import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { allowProjectOnlyLogin } from "../src/lib/auth/project-only-login-policy.mjs";

const AUTH_ID = "auth-uuid-one";
const APP_ID = "app-uuid-one";
const COHORT_ID = "cohort-uuid-one";
const SOURCE = "PROJECT_ONLY:TERM-2026-1:25-50001";
const HASH = "592b2c56baf3334ffc4898996bb3a3976c808ada5652d564141096e150cb66bc";
const APPROVAL = "APPROVED-PROJECT-600";
const AUTH_USER = {
  id: AUTH_ID, email: "sample.student@example.invalid",
  email_confirmed_at: "2026-10-20T09:00:00Z",
};

function fixture(overrides = {}) {
  return {
    account: {
      id: APP_ID, auth_user_id: AUTH_ID, source_account_key: SOURCE,
      email: AUTH_USER.email, role_code: "student", account_status: "Active", login_enabled: true,
      ...overrides.account,
    },
    eligible: overrides.eligible ?? true,
    link: {
      app_user_id: APP_ID, auth_user_id: AUTH_ID, source_key: SOURCE,
      cohort_id: COHORT_ID, state: "ACTIVE", approved_by: "approved-admin",
      activated_at: "2026-10-20T09:00:00Z", operator_approval_reference: APPROVAL,
      ...overrides.link,
    },
    control: {
      cohort_id: COHORT_ID, enabled: true,
      purpose: "PROJECT_ONLY", source_type: "GENERATED_PROJECT",
      manifest_sha256: HASH, activation_approval_reference: APPROVAL,
      manual_activation_guarded: true, production_write_approved: true,
      approved_via: "AUTHORIZED_SYSTEM_ADMIN", approved_by: "approved-admin",
      approved_at: "2026-10-20T08:00:00Z",
      ...overrides.control,
    },
    cohort: {
      id: COHORT_ID, cohort_key: "PLP_PROJECT_600_2026_1",
      is_project_data: true, expected_count: 600,
      ...overrides.cohort,
    },
    projectAccount: {
      id: APP_ID, auth_user_id: AUTH_ID, source_account_key: SOURCE,
      account_kind: "PROJECT_ONLY", project_cohort_id: "PLP_PROJECT_600_2026_1",
      is_synthetic_demo: true, institutional_verified_at: null,
      project_activation_approved_at: "2026-10-20T09:00:00Z",
      ...overrides.projectAccount,
    },
    errors: overrides.errors ?? {},
    throwRpc: overrides.throwRpc ?? false,
  };
}

function mockAdmin(fix) {
  const calls = [];
  const records = {
    project_auth_student_links: fix.link,
    project_auth_cohort_control: fix.control,
    student_data_cohorts: fix.cohort,
    app_users: fix.projectAccount,
  };
  const admin = {
    calls,
    async rpc(name, args) {
      calls.push({ action: "rpc", name, args });
      if (fix.throwRpc) throw Error("RPC unavailable");
      return {
        data: fix.eligible,
        error: fix.errors.rpc ?? null,
      };
    },
    from(table) {
      calls.push({ action: "table", table });
      return {
        select(columns) {
          calls.push({ action: "select", table, columns });
          return {
            eq(column, value) {
              calls.push({ action: "eq", table, column, value });
              return {
                async maybeSingle() {
                  return { data: records[table] ?? null, error: fix.errors[table] ?? null };
                },
              };
            },
          };
        },
      };
    },
  };
  return admin;
}

test("ordinary student and all three staff roles never query project-only schema", async () => {
  for (const role of ["student", "registrar", "academic-coordinator", "system-administrator"]) {
    for (const sourceKey of [null, undefined, "INSTITUTIONAL:ABC", "SYNTHETIC_PLANNING:ABC"]) {
      const fix = fixture({ account: { role_code: role, source_account_key: sourceKey } });
      const admin = mockAdmin(fix);
      assert.equal(await allowProjectOnlyLogin(admin, fix.account, AUTH_USER), true);
      assert.deepEqual(admin.calls, []);
    }
  }
});

test("approved PROJECT_ONLY owner has exact active link and enabled 600-cohort", async () => {
  const fix = fixture();
  const admin = mockAdmin(fix);
  assert.equal(await allowProjectOnlyLogin(admin, fix.account, AUTH_USER), true);
  assert.deepEqual(admin.calls[0], {
    action: "rpc", name: "project_auth_eligible_v1",
    args: { p_app_user_id: APP_ID },
  });
  assert.deepEqual(
    admin.calls.filter(({ action }) => action === "table").map(({ table }) => table),
    ["project_auth_student_links", "project_auth_cohort_control", "student_data_cohorts", "app_users"],
  );
});

test("wrong source format, role, inactive account, disabled login or Auth mismatch is denied before SQL", async () => {
  for (const account of [
    { source_account_key: "PROJECT_ONLY:TERM-2026-1:" },
    { source_account_key: "PROJECT_ONLY:OTHER-TERM:25-50001" },
    { source_account_key: "PROJECT_ONLY:TERM-2026-1:abc" },
    { role_code: "system-administrator" },
    { account_status: "Inactive" },
    { login_enabled: false },
    { auth_user_id: "a different Auth user" },
  ]) {
    const fix = fixture({ account });
    const admin = mockAdmin(fix);
    assert.equal(await allowProjectOnlyLogin(admin, fix.account, AUTH_USER), false);
    assert.equal(admin.calls.length, 0);
  }
});

test("disabled, revoked, wrong-user or cross-cohort links deny access", async () => {
  for (const link of [
    { state: "LINKED" }, { state: "REVOKED" }, { state: "STAGED" },
    { auth_user_id: "another Auth UUID" },
    { app_user_id: "another app ID" },
    { source_key: "PROJECT_ONLY:TERM-2026-1:OTHER" },
    { cohort_id: null },
  ]) {
    const fix = fixture({ link });
    assert.equal(await allowProjectOnlyLogin(mockAdmin(fix), fix.account, AUTH_USER), false);
  }
});

test("missing project schema, missing RPC, refused eligibility or read errors fail closed", async () => {
  for (const overrides of [
    { eligible: false },
    { errors: { rpc: { message: "RPC missing" } } },
    { throwRpc: true },
    { link: { state: "ACTIVE" }, errors: { project_auth_student_links: { message: "relation missing" } } },
    { errors: { project_auth_cohort_control: { message: "relation missing" } } },
    { errors: { student_data_cohorts: { message: "permission denied" } } },
    { errors: { app_users: { message: "new columns missing" } } },
  ]) {
    const fix = fixture(overrides);
    assert.equal(await allowProjectOnlyLogin(mockAdmin(fix), fix.account, AUTH_USER), false);
  }
});

test("cohort revoked or not exactly approved project 600 cannot sign in", async () => {
  for (const overrides of [
    { control: { enabled: false } },
    { control: { cohort_id: "unrelated-cohort" } },
    { control: { purpose: "INSTITUTION_VERIFIED" } },
    { control: { source_type: "IMPORTED_RECORD" } },
    { control: { manifest_sha256: "0".repeat(64) } },
    { control: { approved_via: "UNVERIFIED" } },
    { control: { approved_via: "SYSTEM_MIGRATION", approved_by: null }, link: { approved_by: null } },
    { control: { approved_via: "AUTHORIZED_SYSTEM_ADMIN", approved_by: null } },
    { control: { approved_at: null } },
    { control: { manual_activation_guarded: false } },
    { control: { production_write_approved: false } },
    { control: { activation_approval_reference: "DIFFERENT-APPROVAL" } },
    { link: { approved_by: "unrelated-staff-account" } },
    { link: { activated_at: null } },
    { link: { operator_approval_reference: null } },
    { cohort: { id: "different-cohort" } },
    { cohort: { cohort_key: "PLP_PROJECT_ANOTHER_COHORT" } },
    { cohort: { is_project_data: false } },
    { cohort: { expected_count: 599 } },
    { projectAccount: { account_kind: "INSTITUTION_VERIFIED" } },
    { projectAccount: { project_cohort_id: "unrelated" } },
    { projectAccount: { institutional_verified_at: "2026-10-20" } },
    { projectAccount: { project_activation_approved_at: null } },
  ]) {
    const fix = fixture(overrides);
    assert.equal(await allowProjectOnlyLogin(mockAdmin(fix), fix.account, AUTH_USER), false);
  }
});

test("PROJECT_ONLY login requires confirmed exact Auth identity but ordinary accounts do not", async () => {
  for (const authUser of [
    null,
    { ...AUTH_USER, id: "wrong ID" },
    { ...AUTH_USER, email: "attacker@example.invalid" },
    { ...AUTH_USER, email_confirmed_at: null },
  ]) {
    const f = fixture();
    const admin = mockAdmin(f);
    assert.equal(await allowProjectOnlyLogin(admin, f.account, authUser), false);
    assert.deepEqual(admin.calls, []);
  }
  const f = fixture({ account: { source_account_key: "PLP_NORMAL_STUDENT" } });
  assert.equal(await allowProjectOnlyLogin(mockAdmin(f), f.account, null), true);
});

test("both login routes invoke the shared guard before success or tokens", () => {
  const email = readFileSync(new URL("../src/features/auth/auth-actions.js", import.meta.url), "utf8");
  const universityId = readFileSync(new URL("../src/app/api/auth/university-id/route.js", import.meta.url), "utf8");
  for (const content of [email, universityId]) {
    assert.match(content, /import\s*\{ allowProjectOnlyLogin \}\s*from\s*["']@\/lib\/auth\/project-only-login-guard["']/);
    assert.match(content, /source_account_key/);
    assert.match(content, /await allowProjectOnlyLogin\(/);
  }
  assert.ok(email.indexOf("await allowProjectOnlyLogin(") < email.indexOf("ok: true"));
  assert.ok(universityId.indexOf("await allowProjectOnlyLogin(") < universityId.indexOf("accessToken:"));
});
