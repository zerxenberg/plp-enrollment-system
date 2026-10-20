import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveStudentProfile } from "../src/features/students/project-student-profile-lookup.mjs";

const SOURCE = "PROJECT_ONLY:TERM-2026-1:25-50001";
const AUTH_USER = { id: "auth-one", email: "fictional@example.invalid" };
const ACCOUNT = {
  id: "app-one",
  auth_user_id: AUTH_USER.id,
  source_account_key: SOURCE,
  role_code: "student",
  full_name: "Fictional Learner",
  email: AUTH_USER.email,
  account_status: "Active",
  login_enabled: true,
  is_synthetic_demo: true,
};
const LINK = {
  app_user_id: ACCOUNT.id,
  auth_user_id: AUTH_USER.id,
  student_id: "student-one",
  cohort_id: "cohort-one",
  source_key: SOURCE,
  source_fingerprint: "f".repeat(64),
  state: "ACTIVE",
};
const PROFILE = {
  id: LINK.student_id,
  user_id: ACCOUNT.id,
  student_number: "25-50001",
  program_code: "BSIT",
  student_type: "NEW_STUDENT",
  student_status: null,
  year_level: null,
  academic_classification: null,
  current_curriculum_code: null,
  is_synthetic_demo: true,
  synthetic_source_key: SOURCE,
  record_kind: "PROJECT_ONLY",
  project_cohort_id: "PLP_PROJECT_600_2026_1",
  institutional_verified_at: null,
  synthetic_source_attributes: {
    purpose: "PROJECT_ONLY",
    cohort_key: "PLP_PROJECT_600_2026_1",
    data_origin: "GENERATED_PROJECT",
    row_fingerprint: LINK.source_fingerprint,
    year_level_proposed: "1",
    curriculum_code_proposed: "BSIT-2024",
    major_code_proposed: null,
    institutional_verified: false,
    admission_approved: false,
    official_enrollment: false,
  },
};
const MEMBER = {
  cohort_id: LINK.cohort_id,
  student_id: LINK.student_id,
  classification: "NEW_STUDENT",
  data_origin: "GENERATED_PROJECT",
  source_reference: SOURCE,
};

function fixture(changes = {}) {
  return {
    app_users: { ...ACCOUNT, ...changes.app_users },
    project_auth_student_links: { ...LINK, ...changes.project_auth_student_links },
    student_profiles: { ...PROFILE, ...changes.student_profiles },
    student_data_cohort_members: { ...MEMBER, ...changes.student_data_cohort_members },
  };
}

function mockAdmin(records, errors = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      calls.push({ table, filters });
      const query = {
        select() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        async maybeSingle() {
          if (errors[table]) return { data: null, error: errors[table] };
          const record = records[table];
          if (!record || filters.some(([column, value]) => record[column] !== value)) {
            return { data: null, error: null };
          }
          return { data: record, error: null };
        },
      };
      return query;
    },
  };
}

async function lookup(changes, options = {}) {
  const admin = mockAdmin(fixture(changes), options.errors);
  let checked = 0;
  const result = await resolveStudentProfile({
    adminClient: admin,
    authUser: options.authUser === undefined ? AUTH_USER : options.authUser,
    verifyProjectAccount: async () => {
      checked += 1;
      return options.verifyProjectAccount === undefined ? true : options.verifyProjectAccount;
    },
  });
  return { result, calls: admin.calls, checked };
}

test("project profile comes only from exact Auth/app/link/student/cohort records", async () => {
  const { result, calls, checked } = await lookup({});
  assert.equal(result.mode, "project");
  assert.equal(checked, 1);
  assert.deepEqual(result.profile, {
    studentNumber: "25-50001",
    fullName: "Fictional Learner",
    email: "fictional@example.invalid",
    program: "BSIT",
    yearLevel: "1",
    studentType: "New Student",
    curriculum: "BSIT-2024",
    major: null,
    accountStatus: "Active (project account)",
  });
  assert.deepEqual(calls.map(({ table }) => table), [
    "app_users",
    "project_auth_student_links",
    "student_profiles",
    "student_data_cohort_members",
  ]);
  assert.deepEqual(calls[0].filters, [["auth_user_id", AUTH_USER.id]]);
  assert.deepEqual(calls[1].filters, [
    ["app_user_id", ACCOUNT.id], ["auth_user_id", AUTH_USER.id],
  ]);
  assert.deepEqual(calls[2].filters, [["user_id", ACCOUNT.id]]);
  assert.deepEqual(calls[3].filters, [
    ["cohort_id", LINK.cohort_id], ["student_id", LINK.student_id],
  ]);
});

test("ordinary authenticated Student loads only their own PostgreSQL profile", async () => {
  const { result, calls, checked } = await lookup({
    app_users: { source_account_key: "INSTITUTIONAL:STUDENT-1", is_synthetic_demo: false },
    student_profiles: {
      is_synthetic_demo: false,
      student_status: "ACTIVE",
      academic_classification: "REGULAR",
      current_curriculum_code: "BSIT-2024",
      year_level: "3rd Year",
    },
  });
  assert.deepEqual(result, {
    mode: "live",
    profile: {
      studentNumber: "25-50001",
      fullName: "Fictional Learner",
      email: "fictional@example.invalid",
      program: "BSIT",
      yearLevel: "3rd Year",
      studentType: "NEW_STUDENT",
      curriculum: "BSIT-2024",
      academicClassification: "REGULAR",
      studentStatus: "ACTIVE",
      accountStatus: "Active",
    },
  });
  assert.equal(checked, 0);
  assert.deepEqual(calls.map(({ table }) => table), ["app_users", "student_profiles"]);
  assert.deepEqual(calls[1].filters, [["user_id", ACCOUNT.id]]);
});

test("ordinary students with missing or cross-student PostgreSQL profile deny the page", async () => {
  const ordinaryAccount = {
    source_account_key: "INSTITUTIONAL:STUDENT-1", is_synthetic_demo: false,
  };
  for (const profile of [
    { is_synthetic_demo: true },
    { user_id: "someone-else" },
    { id: null },
    { student_number: null },
  ]) {
    const { result } = await lookup({
      app_users: ordinaryAccount,
      student_profiles: { is_synthetic_demo: false, ...profile },
    });
    assert.deepEqual(result, { mode: "unavailable" });
  }
  const { result } = await lookup({
    app_users: ordinaryAccount,
    student_profiles: { is_synthetic_demo: false },
  }, { errors: { student_profiles: new Error("Database unavailable") } });
  assert.deepEqual(result, { mode: "unavailable" });
});

test("unauthenticated, unlinked, staff and disabled identities cannot render a student profile", async () => {
  for (const options of [{ authUser: null }, { authUser: { id: "" } }]) {
    assert.deepEqual((await lookup({}, options)).result, { mode: "unavailable" });
  }
  for (const changes of [
    { app_users: { auth_user_id: "someone-else" } },
    { app_users: { role_code: "registrar" } },
    { app_users: { account_status: "Inactive" } },
    { app_users: { login_enabled: false } },
    { app_users: { source_account_key: "PROJECT_ONLY:broken" } },
    { app_users: { source_account_key: "PROJECT_ONLYbad" } },
    { app_users: { source_account_key: "SYNTHETIC_PLANNING:OLD" } },
  ]) {
    assert.deepEqual((await lookup(changes)).result, { mode: "unavailable" });
  }
});

test("project cohort revocation and unavailable SQL always deny with no demo fallback", async () => {
  const refused = await lookup({}, { verifyProjectAccount: false });
  assert.deepEqual(refused.result, { mode: "unavailable" });
  assert.deepEqual(refused.calls.map(({ table }) => table), ["app_users"]);
  for (const table of [
    "app_users",
    "project_auth_student_links",
    "student_profiles",
    "student_data_cohort_members",
  ]) {
    assert.deepEqual(
      (await lookup({}, { errors: { [table]: new Error("SQL unavailable") } })).result,
      { mode: "unavailable" },
    );
  }
});

test("cross student profile and cohort member mismatches fail closed", async () => {
  for (const changes of [
    { project_auth_student_links: { student_id: "someone-else" } },
    { project_auth_student_links: { auth_user_id: "someone-else" } },
    { project_auth_student_links: { state: "REVOKED" } },
    { project_auth_student_links: { source_key: "PROJECT_ONLY:TERM-2026-1:25-50002" } },
    { student_profiles: { user_id: "someone-else" } },
    { student_profiles: { record_kind: "INSTITUTION_VERIFIED" } },
    { student_profiles: { synthetic_source_key: "SYNTHETIC_PLANNING:OLD" } },
    { student_profiles: { student_number: "25-50002" } },
    { student_profiles: { student_status: "ACTIVE" } },
    { student_profiles: { academic_classification: "REGULAR" } },
    { student_profiles: { current_curriculum_code: "BSIT-2024" } },
    { student_profiles: { institutional_verified_at: "2026-01-01" } },
    { student_profiles: { synthetic_source_attributes: {
      ...PROFILE.synthetic_source_attributes, admission_approved: true,
    } } },
    { student_profiles: { synthetic_source_attributes: {
      ...PROFILE.synthetic_source_attributes, row_fingerprint: "0".repeat(64),
    } } },
    { student_data_cohort_members: { classification: "TRANSFEREE" } },
    { student_data_cohort_members: { cohort_id: "other-cohort" } },
    { student_data_cohort_members: { source_reference: "wrong-source" } },
  ]) {
    assert.deepEqual((await lookup(changes)).result, { mode: "unavailable" });
  }
});
