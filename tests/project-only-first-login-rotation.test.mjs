import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  requireProjectOnlyInitialPasswordRotation,
  recordProjectOnlyPasswordRotation,
} from "../src/lib/auth/project-only-first-login-rotation.mjs";

const user = { id: "auth-1", email_confirmed_at: "2026-10-20T00:00:00Z" };
const account = {
  id: "app-1", auth_user_id: user.id, role_code: "student",
  source_account_key: "PROJECT_ONLY:TERM-2026-1:STU-1",
  account_status: "Active", login_enabled: true,
};

function linkClient(link, error = null) {
  return {
    from(name) {
      assert.equal(name, "project_auth_student_links");
      return {
        select(columns) {
          assert.match(columns, /initial_password_changed_at/);
          return {
            eq(key, value) {
              assert.equal(key, "app_user_id");
              assert.equal(value, account.id);
              return { async maybeSingle() { return { data: link, error }; } };
            },
          };
        },
      };
    },
  };
}
const baseLink = {
  app_user_id: account.id, auth_user_id: user.id,
  state: "ACTIVE", initial_password_changed_at: null,
};

test("legacy four-role accounts remain unaffected", async () => {
  assert.equal(await requireProjectOnlyInitialPasswordRotation(
    null, { source_account_key: null }, user,
  ), false);
});

test("verified active PROJECT_ONLY user must change temporary password", async () => {
  assert.equal(await requireProjectOnlyInitialPasswordRotation(
    linkClient(baseLink), account, user,
  ), true);
});

test("confirmed rotation opens only the matched account", async () => {
  assert.equal(await requireProjectOnlyInitialPasswordRotation(
    linkClient({ ...baseLink, initial_password_changed_at: "2026-10-20T00:00:00Z" }),
    account, user,
  ), false);
});

test("wrong Auth ID, revoked link or query failure all deny project access", async () => {
  await assert.rejects(() => requireProjectOnlyInitialPasswordRotation(
    linkClient({ ...baseLink, auth_user_id: "other" }), account, user,
  ));
  await assert.rejects(() => requireProjectOnlyInitialPasswordRotation(
    linkClient({ ...baseLink, state: "REVOKED" }), account, user,
  ));
  await assert.rejects(() => requireProjectOnlyInitialPasswordRotation(
    linkClient(null, { code: "PGRST" }), account, user,
  ));
});

test("completion refuses forged identity and missing trusted RPC evidence", async () => {
  await assert.rejects(() => recordProjectOnlyPasswordRotation(
    {}, account, { ...user, id: "other" },
  ));
  const rpc = async (name, args) => {
    assert.equal(name, "project_auth_record_initial_password_change_v1");
    assert.equal(args.p_app_user_id, account.id);
    assert.equal(args.p_auth_user_id, user.id);
    return { data: false, error: null };
  };
  await assert.rejects(() => recordProjectOnlyPasswordRotation({ rpc }, account, user));
  assert.equal(await recordProjectOnlyPasswordRotation({
    rpc: async () => ({ data: true, error: null }),
  }, account, user), true);
});

test("server entrypoints enforce rotation and do not retain demo student session", () => {
  const paths = [
    "../src/features/auth/auth-actions.js",
    "../src/app/api/auth/university-id/route.js",
  ];
  for (const path of paths) {
    const text = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(text, /requireProjectOnlyInitialPasswordRotation\s*\(/);
  }
  const layout = readFileSync(
    new URL("../src/app/(portal)/student/layout.js", import.meta.url), "utf8");
  assert.match(layout, /state\.kind === "required"/);
  assert.match(layout, /redirect\("\/student\/change-password"\)/);
  const login = readFileSync(new URL("../src/components/auth/LoginForm.js", import.meta.url), "utf8");
  assert.match(login, /sourceAccountKey/);
  const liveAuth=readFileSync(new URL("../src/lib/auth/live-auth.js",import.meta.url),"utf8");
  assert.match(liveAuth,/sourceAccountKey: record\.source_account_key/,
    "University ID sign in after rotation must retain PROJECT_ONLY provenance");
  const migration = readFileSync(
    new URL("../supabase/migrations/20261020074600_project_only_initial_password_rotation.sql", import.meta.url), "utf8");
  assert.match(migration, /initial_password_changed_at IS NOT NULL/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.project_auth_record_initial_password_change_v1/);
  const loader=readFileSync(new URL(
    "../src/features/students/student-profile-server.js",import.meta.url),"utf8");
  assert.match(loader,/requireProjectOnlyInitialPasswordRotation\s*\(/,
    "Student Profile itself must deny temporary-password sessions");
});
