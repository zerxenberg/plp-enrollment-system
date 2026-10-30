import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { buildVerifiedCorDocument, verifiedCorStudentSex } from "./cor-document.mjs";
import { verifiedCorSubjectDisplayCodes } from "./cor-subjects.mjs";
import { estimateProjectSelectedSubjects } from "../students/project-fee-estimate.mjs";

// Next's server-only and @/ imports cannot run under node:test. Execute the
// actual server loader with its imported dependencies and DB client injected.
const source = readFileSync(new URL("./cor-access-server.js", import.meta.url), "utf8")
  .replace(/^import\s+(?:["'][^"']+["']|\{[^}]*\}\s+from\s+["'][^"']+["']);\s*$/gm, "")
  .replace(/^export\s+(?=async\s+function\s+)/gm, "");

const number = "25-50001";
const name = "Miguel Antonio Rafael Garcia Jr.";
const termId = "TERM-2026-1";
const subjectCode = "P8F26-BSIT-T03-M1";
const cohort = "PLP_PROJECT_600_2026_1";
const sourceKey = `PROJECT_ONLY:TERM-2026-1:${number}`;
const subject = {
  subject_code: subjectCode, subject_name: "Data Structures and Algorithms for IT",
  academic_units: 3, section_id: "section-one", section_code: "BSIT-2A",
};
const meeting = {
  subject_code: subjectCode, day_of_week: 1, start_time: "08:00",
  end_time: "10:00",
};
const fee = {
  official: false, assessmentIssued: false, subjectCount: 1,
  totalUnits: 3, estimatedAmount: 300,
  subjects: [{ code: subjectCode, units: 3, ratePerUnit: 100, estimatedFee: 300 }],
};

function projectFixture(sex = "Female") {
  const cor = {
    simulation_only: true, official: false, certificate_of_official_registration: false,
    registration_status: "CONFIRMED FOR PROJECT SIMULATION", registration_snapshot_complete: true,
    simulation_id: "simulation-one", confirmed_at: "2026-10-29T08:30:00+08:00",
    registered_units: 3, academic_year: "2026 to 2027", semester: "First Semester",
    student: {
      student_number: number, student_name: name, program_code: "BSIT",
      year_level: 2, home_block: "BSIT-2A", curriculum_code: "P8F26-BSIT-V1",
    },
    registered_subjects: [subject], registered_schedule: [meeting],
  };
  return {
    cor,
    rows: {
      project_phase8_enrollment_simulations: {
        id: cor.simulation_id, student_id: "profile-one", term_id: termId,
        status: "CONFIRMED_SIMULATION", source_provenance: "GENERATED_PROJECT",
        verified_institutionally: false,
      },
      student_profiles: {
        id: "profile-one", user_id: "account-one", student_number: number,
        record_kind: "PROJECT_ONLY", project_cohort_id: cohort,
        is_synthetic_demo: true, synthetic_source_key: sourceKey,
      },
      app_users: {
        id: "account-one", role_code: "student", full_name: name, sex,
        is_synthetic_demo: true, source_account_key: sourceKey, project_cohort_id: cohort,
      },
      programs: { code: "BSIT", name: "Bachelor of Science in Information Technology" },
      subjects: [{ code: subjectCode, name: subject.subject_name }],
    },
  };
}

function officialFixture(sex = "Male") {
  const cor = {
    official: true, ready_to_print: true, schedule_complete: true,
    registration_reference_complete: true, status: "OFFICIALLY ENROLLED",
    confirmed_at: "2026-10-29T09:00:00+08:00", enrollment_id: "enrollment-one",
    term_id: termId, student_number: number, student_name: name,
    program_name: "Bachelor of Science in Information Technology",
    year_level: 2, home_block: "BSIT-2A", subjects: [subject], schedule: [meeting],
  };
  return {
    cor,
    rows: {
      enrollments: {
        id: cor.enrollment_id, student_id: "profile-one", term_id: termId,
        status: "CONFIRMED",
      },
      student_profiles: {
        id: "profile-one", user_id: "account-one", student_number: number,
        record_kind: "INSTITUTIONAL", is_synthetic_demo: false,
      },
      app_users: {
        id: "account-one", role_code: "student", full_name: name, sex,
        is_synthetic_demo: false,
      },
      academic_terms: {
        id: termId, label: "2026 to 2027 First Semester",
        academic_year: "2026 to 2027", semester: "First Semester",
      },
      subjects: [{ code: subjectCode, name: subject.subject_name }],
    },
  };
}

function setup({ cor, rows }, errors = {}) {
  const calls = [];
  const admin = {
    from(table) {
      assert.ok(Object.hasOwn(rows, table), `Unexpected table ${table}`);
      const call = { table, columns: null, filters: [] };
      calls.push(call);
      const query = {
        select(columns) {
          call.columns = columns;
          return this;
        },
        eq(column, value) {
          call.filters.push({ op: "eq", column, value });
          return this;
        },
        in(column, values) {
          call.filters.push({ op: "in", column, values: [...values] });
          return this;
        },
        maybeSingle() {
          return Promise.resolve(response());
        },
        then(resolve, reject) {
          return Promise.resolve(response()).then(resolve, reject);
        },
      };
      function response() {
        assert.ok(call.columns, `Missing selected columns for ${table}`);
        return { data: rows[table], error: errors[table] || null };
      }
      return query;
    },
  };
  const sandbox = {
    createAdminClient: () => admin,
    readProjectDemonstrationCOR: async (id, role) => {
      calls.push({ reader: "project", id, role });
      assert.equal(id, cor.simulation_id);
      return cor;
    },
    getOfficialRegistrationData: async (id, role) => {
      calls.push({ reader: "official", id, role });
      assert.equal(id, cor.enrollment_id);
      return cor;
    },
    buildVerifiedCorDocument,
    verifiedCorStudentSex,
    verifiedCorSubjectDisplayCodes,
    estimateProjectSelectedSubjects,
    loadVerifiedProjectSubjectPrices: async (client, curriculum, selection) => {
      assert.equal(client, admin);
      assert.equal(curriculum, "P8F26-BSIT-V1");
      calls.push({ pricing: true });
      return selection.map(({ code }) => ({
        subject_code: code, rate_per_unit: 100,
        classification: "SYNTHETIC_DEVELOPMENT_ONLY",
      }));
    },
  };
  runInNewContext(`${source}\nthis.loadProject = verifiedProjectCorDocument;` +
    `\nthis.loadRegistrar = registrarProjectCorDocument;` +
    `\nthis.loadOfficial = officialCorDocument;`, sandbox);
  return { loadProject: sandbox.loadProject, loadRegistrar: sandbox.loadRegistrar,
    loadOfficial: sandbox.loadOfficial, calls };
}

function expectLinkedIdentityReads(calls, { project }) {
  const identities = calls.filter(({ table }) =>
    ["project_phase8_enrollment_simulations", "enrollments", "student_profiles", "app_users"]
      .includes(table));
  assert.equal(identities.length, 3, "COR must resolve exactly one registration, profile and account");
  assert.deepEqual(identities.map(({ table }) => table), [
    project ? "project_phase8_enrollment_simulations" : "enrollments",
    "student_profiles", "app_users",
  ]);
  assert.deepEqual(identities.map(({ filters }) => filters.map(({ column, value }) =>
    [column, value])), [
    [["id", project ? "simulation-one" : "enrollment-one"]],
    [["id", "profile-one"]], [["id", "account-one"]],
  ]);
  assert.match(identities[0].columns, /\bstudent_id\b/);
  assert.match(identities[1].columns, /\buser_id\b/);
  assert.match(identities[1].columns, /\bstudent_number\b/);
  assert.match(identities[2].columns, /\bsex\b/);
  assert.match(identities[2].columns, /\bfull_name\b/);
}

test("project COR server loader reads sex only from the linked confirmed synthetic student", async () => {
  for (const sex of ["Male", "Female", null]) {
    const fixture = projectFixture(sex);
    // A snapshot-supplied sex must never override the linked app_users value.
    fixture.cor.student.sex = sex === "Male" ? "Female" : "Male";
    const { loadProject, calls } = setup(fixture);
    const document = await loadProject(fixture.cor, fee);
    assert.equal(document.sex, sex ?? "Not recorded");
    assert.equal(document.studentName, name);
    assert.equal(document.project, true);
    assert.equal(document.totalFee, 300);
    assert.equal(document.subjects[0].displayCode, "IT 201");
    expectLinkedIdentityReads(calls, { project: true });
  }
});

test("Registrar project COR resolves the same linked student after its protected reader", async () => {
  const fixture = projectFixture("Female");
  const { loadRegistrar, calls } = setup(fixture);
  const document = await loadRegistrar(fixture.cor.simulation_id);
  assert.equal(document.sex, "Female");
  assert.equal(calls[0].reader, "project");
  assert.equal(calls[0].role, "registrar");
  expectLinkedIdentityReads(calls, { project: true });
});

test("official COR server loader honors protected Student and Registrar readers", async () => {
  for (const [role, sex] of [["student", "Female"], ["registrar", "Male"], ["student", null]]) {
    const fixture = officialFixture(sex);
    fixture.cor.sex = "Female"; // The protected snapshot is not a sex authority.
    const { loadOfficial, calls } = setup(fixture);
    const document = await loadOfficial(fixture.cor.enrollment_id, role);
    assert.equal(document.sex, sex ?? "Not recorded");
    assert.equal(document.project, false);
    assert.equal(document.studentName, name);
    assert.equal(document.semester, "First Semester");
    assert.equal(calls[0].reader, "official");
    assert.equal(calls[0].role, role);
    expectLinkedIdentityReads(calls, { project: false });
  }
});

test("COR sex lookup fails closed on missing linked records and database read errors", async () => {
  const cases = [
    ["registration missing", "project_phase8_enrollment_simulations", null, null,
      /registration identity could not be verified/],
    ["registration error", "project_phase8_enrollment_simulations", null,
      { message: "permission denied" }, /registration identity could not be verified/],
    ["student profile missing", "student_profiles", null, null,
      /student profile could not be verified/],
    ["student profile error", "student_profiles", null,
      { message: "permission denied" }, /student profile could not be verified/],
    ["student account missing", "app_users", null, null,
      /student account could not be verified/],
    ["student account error", "app_users", null,
      { message: "permission denied" }, /student account could not be verified/],
  ];
  for (const [label, table, value, error, expected] of cases) {
    const fixture = projectFixture();
    fixture.rows[table] = value;
    const { loadProject, calls } = setup(fixture, error ? { [table]: error } : {});
    await assert.rejects(loadProject(fixture.cor, fee), expected, label);
    if (table === "project_phase8_enrollment_simulations") {
      assert.equal(calls.some(({ table: called }) => called === "student_profiles"), false);
    }
    if (table === "student_profiles") {
      assert.equal(calls.some(({ table: called }) => called === "app_users"), false);
    }
  }
});

test("COR lookup rejects identity mismatches, unconfirmed rows, synthetic official identities and invalid sex", async () => {
  const tampering = [
    [(rows) => { rows.student_profiles.student_number = "another-student"; }, /could not be verified/],
    [(rows) => { rows.app_users.full_name = "Another Student"; }, /could not be verified/],
    [(rows) => { rows.app_users.role_code = "registrar"; }, /could not be verified/],
    [(rows) => { rows.app_users.source_account_key = "wrong-source"; }, /provenance/],
    [(rows) => { rows.project_phase8_enrollment_simulations.status = "SUBMITTED"; }, /provenance/],
    [(rows) => { rows.app_users.sex = "Other"; }, /sex value is invalid/],
  ];
  for (const [mutate, expected] of tampering) {
    const fixture = projectFixture();
    mutate(fixture.rows);
    const { loadProject } = setup(fixture);
    await assert.rejects(loadProject(fixture.cor, fee), expected);
  }
  for (const mutate of [
    (rows) => { rows.enrollments.status = "DRAFT"; },
    (rows) => { rows.student_profiles.is_synthetic_demo = true; },
    (rows) => { rows.app_users.is_synthetic_demo = true; },
  ]) {
    const fixture = officialFixture();
    mutate(fixture.rows);
    const { loadOfficial } = setup(fixture);
    await assert.rejects(loadOfficial(fixture.cor.enrollment_id), /identity could not be verified/);
  }
});
