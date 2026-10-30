import assert from "node:assert/strict";
import test from "node:test";
import {
  autoProvisionAdmissionsStudent,
  configuredAdmissionsInvitation,
} from "./admissions-auto-provision.mjs";
import { verifyAdmissionsActivation } from "./admissions-activation-policy.mjs";

const ref = "ADM-2026-000006";
const personalEmail = "student@example.edu";
const configuration = configuredAdmissionsInvitation({
  enabled: true, redirectUrl: "http://localhost:3000/activate-student-account",
});
const sample = {
  admission_handoffs: { student_id: "profile-1", admission_status: "ACCEPTED", synchronization_status: "Successful" },
  student_profiles: { id: "profile-1", user_id: "user-1", record_kind: "INSTITUTIONAL",
    student_type: "TRANSFEREE", student_status: "ADMITTED" },
  admissions_student_source_details: { student_id: "profile-1", personal_email: personalEmail },
  app_users: { id: "user-1", email: "student@plp.edu.ph", role_code: "student",
    source_account_key: `PLP_ADMISSIONS:${ref}`,
    auth_user_id: null, account_status: "Inactive", login_enabled: false },
};

function fakeAdmin(overrides = {}) {
  const rows = structuredClone({ ...sample, ...overrides });
  const log = { invitations: [], updates: [], deleted: [], audits: [] };
  const admin = {
    auth: { admin: {
      inviteUserByEmail: async (...args) => {
        log.invitations.push(args);
        return { data: { user: { id: "auth-1", email: args[0] } }, error: null };
      },
      deleteUser: async (id) => { log.deleted.push(id); return { error: null }; },
    } },
    from(table) {
      let updated = null;
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        update(values) { updated = values; return this; },
        maybeSingle: async () => {
          if (updated) {
            log.updates.push({ table, ...updated });
            rows[table] = { ...rows[table], ...updated };
            return { data: { id: rows[table].id, auth_user_id: updated.auth_user_id }, error: null };
          }
          return { data: rows[table] ?? null, error: null };
        },
        insert: async (values) => { log.audits.push(values); return { error: null }; },
      };
    },
  };
  return { admin, log, rows };
}

test("automatic invitations stay disabled by default and reject unsafe redirects", () => {
  assert.equal(configuredAdmissionsInvitation({ enabled: false }).enabled, false);
  for (const redirectUrl of [
    "http://malicious.test/activate-student-account",
    "https://fake.com/payload",
    "https://example.com/activate-student-account?next=evil",
    "file:///activate-student-account",
  ]) {
    assert.equal(configuredAdmissionsInvitation({ enabled: true, redirectUrl }).enabled, false);
  }
  assert.equal(configuration.enabled, true);
});

test("valid accepted Transferee gets only an Auth invitation, never automatic activation", async () => {
  const { admin, log } = fakeAdmin();
  const result = await autoProvisionAdmissionsStudent({ admin, applicantRef: ref, email: personalEmail, configuration });
  assert.deepEqual(result, { status: "invitation_sent" });
  assert.equal(log.invitations.length, 1);
  assert.equal(log.invitations[0][0], personalEmail);
  assert.equal(log.updates.length, 1);
  assert.deepEqual(log.updates[0], { table: "app_users", auth_user_id: "auth-1" });
  assert.equal(log.audits.length, 1);
});

test("never invite a mismatched source contact, student state, or email", async () => {
  for (const overrides of [
    { admissions_student_source_details: { student_id: "profile-1", personal_email: "other@example.edu" } },
    { admission_handoffs: { student_id: "profile-1", admission_status: "PENDING", synchronization_status: "Successful" } },
    { student_profiles: { ...sample.student_profiles, record_kind: "PROJECT_ONLY" } },
    { app_users: { ...sample.app_users, role_code: "registrar" } },
    { app_users: { ...sample.app_users, account_status: "Active" } },
  ]) {
    const { admin, log } = fakeAdmin(overrides);
    assert.deepEqual(
      await autoProvisionAdmissionsStudent({ admin, applicantRef: ref, email: personalEmail, configuration }),
      { status: "manual_review" },
    );
    assert.equal(log.invitations.length, 0);
  }
});

test("linked applicants are idempotent and not invited again", async () => {
  const { admin, log } = fakeAdmin({ app_users: { ...sample.app_users, auth_user_id: "already-1" } });
  assert.deepEqual(
    await autoProvisionAdmissionsStudent({ admin, applicantRef: ref, email: personalEmail, configuration }),
    { status: "already_linked" },
  );
  assert.equal(log.invitations.length, 0);
});

test("activation requires confirmed email, exact Auth ID, and accepted successful Admissions provenance", () => {
  const input = {
    identity: { id: "auth-1", email: personalEmail, email_confirmed_at: "2026-10-30" },
    account: { ...sample.app_users, auth_user_id: "auth-1" },
    profile: sample.student_profiles,
    handoff: { ...sample.admission_handoffs, applicant_reference: ref, source_name: "PLP Admissions" },
    source: sample.admissions_student_source_details,
  };
  assert.equal(verifyAdmissionsActivation(input), true);
  assert.equal(verifyAdmissionsActivation({ ...input, identity: { ...input.identity, email_confirmed_at: null } }), false);
  assert.equal(verifyAdmissionsActivation({ ...input, identity: { ...input.identity, id: "wrong-id" } }), false);
  assert.equal(verifyAdmissionsActivation({ ...input, source: { ...input.source, personal_email: "other@example.edu" } }), false);
  assert.equal(verifyAdmissionsActivation({ ...input, account: { ...input.account, login_enabled: true } }), false);
  assert.equal(verifyAdmissionsActivation({ ...input, handoff: { ...input.handoff, synchronization_status: "Failed" } }), false);
});
