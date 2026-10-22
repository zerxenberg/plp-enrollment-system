import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isActiveLegacyStudentAccount } from "../src/lib/auth/legacy-student-account-policy.mjs";

const account = {
  id: "existing-student-account", auth_user_id: "existing-auth-uuid",
  role_code: "student", account_status: "Active", login_enabled: true,
  source_account_key: "STUDENT:EXISTING",
};
const user = { id: "existing-auth-uuid" };

test("active legacy Student stays authorized without PROJECT_ONLY changes", () => {
  assert.equal(isActiveLegacyStudentAccount(account, user), true);
  assert.equal(isActiveLegacyStudentAccount({ ...account, source_account_key: null }, user), true);
});

test("disabled or inactive legacy Student cannot reopen portal with old Auth JWT", () => {
  for (const candidate of [
    { ...account, login_enabled: false },
    { ...account, login_enabled: null },
    { ...account, account_status: "Inactive" },
    { ...account, account_status: "Suspended" },
  ]) {
    assert.equal(isActiveLegacyStudentAccount(candidate, user), false);
  }
});

test("cross-account identity, three staff roles and malformed project prefixes fail closed", () => {
  assert.equal(isActiveLegacyStudentAccount(account, { id: "other-auth" }), false);
  assert.equal(isActiveLegacyStudentAccount(null, user), false);
  for (const role_code of ["registrar", "academic-coordinator", "system-administrator"]) {
    assert.equal(isActiveLegacyStudentAccount({ ...account, role_code }, user), false);
  }
  for (const source_account_key of ["PROJECT_ONLY:TERM-2026-1:STU", "PROJECT_ONLY", "PROJECT_ONLY:WRONG"]) {
    assert.equal(isActiveLegacyStudentAccount({ ...account, source_account_key }, user), false);
  }
});

test("trusted Student portal server invokes current account-state gate", () => {
  const server = readFileSync(new URL(
    "../src/lib/auth/project-only-first-login-server.js", import.meta.url), "utf8");
  assert.match(server, /isActiveLegacyStudentAccount\(account,\s*identity\.user\)/);
  assert.match(server, /kind:\s*"denied"/);
  const layout = readFileSync(new URL(
    "../src/app/(portal)/student/layout.js", import.meta.url), "utf8");
  assert.match(layout, /state\.kind === "denied"/);
});
