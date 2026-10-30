import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as registrarRoster from "../src/features/registrar/registrar-student-roster.mjs";

const require = createRequire(import.meta.url);
const { loadBindings, transform } = require("next/dist/build/swc");
await loadBindings();
const source = readFileSync(new URL(
  "../src/features/registrar/registrar-queries.js", import.meta.url,
), "utf8");
const compiled = await transform(source, {
  filename: "registrar-queries.js",
  jsc: { parser: { syntax: "ecmascript" }, target: "es2022" },
  module: { type: "commonjs" },
});

const cohort = "PLP_PROJECT_600_2026_1";
const term = "TERM-2026-1";
const generatedBlock = {
  id: "generated", term_id: term, code: "BSIT-1A",
  program_code: "BSIT", curriculum_code: "P8F26-BSIT-V1",
  year_level: 1, section_letter: "A", capacity: 40,
  planning_status: "PUBLISHED", is_synthetic_demo: true,
  synthetic_source_key: "PHASE8_PROJECT_2026:BSIT-1A",
};
const manualBlock = {
  ...generatedBlock, id: "manual", code: "BSIT-1M",
  section_letter: "M", planning_status: "DRAFT",
  is_synthetic_demo: false, synthetic_source_key: null,
};
const profiles = ["generated", "manual"].map((id, index) => ({
  id: `student-${id}`, user_id: `user-${id}`,
  student_number: `26-5000${index + 1}`,
  student_type: "CONTINUING_STUDENT", student_status: "ACTIVE",
  record_kind: "PROJECT_ONLY", project_cohort_id: cohort,
  is_synthetic_demo: true,
}));

function mockClient({ rejectManualRoster = false, repeatStudent = false, unknownSex = false,
  institutionalStudents = [], admissionsHandoffs = [], institutionalUsers = [],
  admissionsDemonstrations = [], projectRegistrations = [], officialEnrollments = [],
  additionalBlocks = [], additionalTerms = [], admissionsSourceDetails = [] } = {}) {
  const tables = {
    student_profiles: [...profiles, ...institutionalStudents],
    admission_handoffs: admissionsHandoffs,
    admissions_phase8_demo_enrollments: admissionsDemonstrations,
    admissions_student_source_details: admissionsSourceDetails,
    block_student_assignments: [],
    app_users: institutionalUsers,
    block_sections: [generatedBlock, manualBlock, ...additionalBlocks],
    academic_terms: [{ id: term, label: "First Semester" }, ...additionalTerms],
    curricula: [{ code: "P8F26-BSIT-V1", program_code: "BSIT" }],
    enrollments: officialEnrollments,
    programs: [{ code: "BSIT", name: "Information Technology", organizational_unit_code: "IT" }],
    organizational_units: [{ code: "IT", name: "Information Technology College" }],
  };
  return {
    from(table) {
      const filters = [];
      const result = () => {
        const data = (tables[table] || []).filter((row) => filters.every((match) => match(row)));
        return { data, error: null };
      };
      return {
        select() { return this; },
        eq(field, value) { filters.push((row) => row[field] === value); return this; },
        in(field, values) { filters.push((row) => values.includes(row[field])); return this; },
        like(field, value) {
          filters.push((row) => String(row[field] || "").startsWith(value.replace(/%$/, "")));
          return this;
        },
        or(expression) {
          assert.equal(table, "block_sections");
          assert.match(expression, /and\(is_synthetic_demo\.eq\.true,synthetic_source_key\.like\.PHASE8_PROJECT_2026:\*\)/);
          assert.match(expression, /and\(is_synthetic_demo\.eq\.false,synthetic_source_key\.is\.null\)/);
          filters.push((row) => (
            (row.is_synthetic_demo === true && row.synthetic_source_key?.startsWith("PHASE8_PROJECT_2026:")) ||
            (row.is_synthetic_demo === false && row.synthetic_source_key === null)
          ));
          return this;
        },
        order() { return this; },
        range(start, end) { return Promise.resolve({ data: result().data.slice(start, end + 1), error: null }); },
        maybeSingle() {
          const { data } = result();
          return Promise.resolve({ data: data[0] || null, error: null });
        },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
    },
    rpc(name, { p_block_id } = {}) {
      if (name === "project_phase8_registrar_simulation_queue_v1") {
        return Promise.resolve({ data: { records: projectRegistrations }, error: null });
      }
      assert.equal(name, "project_phase8_block_roster_v1");
      if (p_block_id === "manual" && rejectManualRoster) {
        return Promise.resolve({ data: null, error: { code: "42501", message: "Denied" } });
      }
      const profile = profiles[p_block_id === "manual" && !repeatStudent ? 1 : 0];
      return Promise.resolve({
        error: null,
        data: {
          fictional_only: true, block_id: p_block_id,
          students: [{
            student_id: profile.id, student_number: profile.student_number,
            full_name: p_block_id === "generated" ? "Fictional Student Jr." : "Fictional Student",
            sex: unknownSex ? null : p_block_id === "generated" ? "Male" : "Female",
            year_level: 1,
            academic_classification: "REGULAR",
            enrollment_status: "NOT_CONFIRMED",
          }],
        },
      });
    },
  };
}

function getLoader(client) {
  const mod = { exports: {} };
  let registrarAuthorized = false;
  vm.runInNewContext(compiled.code, {
    module: mod, exports: mod.exports,
    console: { error() {} },
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/server") return { createClient: async () => client };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => {
        assert.ok(registrarAuthorized, "Privileged institutional roster reads require Registrar authorization");
        return client;
      } };
      if (name === "@/lib/auth/require-role") return { requireRole: async (role) => {
        assert.equal(role, "registrar");
        registrarAuthorized = true;
      } };
      if (name === "@/features/students/student-published-readiness-server") return {};
      if (name === "./registrar-project-enrollment-view.mjs") return {};
      if (name === "./registrar-student-roster.mjs") return registrarRoster;
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return mod.exports.getRegistrarStudentsData;
}

test("Registrar Students includes a student transferred into a manual Phase 8 draft block", async () => {
  const result = await getLoader(mockClient())();
  assert.equal(result.students.length, 2);
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups.find((block) => block.blockSection === "BSIT-1M")?.assignedStudents, 1);
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1M")?.student_number, "26-50002");
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1M")?.sex, "Female");
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1A")?.sex, "Male");
  assert.equal(result.students.find((student) => student.home_block === "BSIT-1A")?.full_name, "Fictional Student Jr.");
});

test("Registrar Phase 8 roster preserves unknown sex as NULL", async () => {
  const result = await getLoader(mockClient({ unknownSex: true }))();
  assert.equal(result.students.length, 2);
  assert.ok(result.students.every((student) => student.sex === null));
});

test("Registrar admitted roster excludes unverified institutional profiles without a successful Admissions handoff", async () => {
  const institutionalStudents = [
    { id: "admitted-1", user_id: "live-user-1", student_number: "26-90001", student_status: "ADMITTED", is_synthetic_demo: false, record_kind: "INSTITUTIONAL" },
    { id: "unverified-2", user_id: "live-user-2", student_number: "26-90002", student_status: "ADMITTED", is_synthetic_demo: false, record_kind: "INSTITUTIONAL" },
    { id: "enrolled-3", user_id: "live-user-3", student_number: "26-90003", student_status: "ACTIVE", is_synthetic_demo: false, record_kind: "INSTITUTIONAL" },
  ];
  const admissionsHandoffs = [
    { student_id: "admitted-1", source_name: "PLP Admissions", admission_status: "ACCEPTED", synchronization_status: "Successful" },
    { student_id: "unverified-2", source_name: "PLP Admissions", admission_status: "ACCEPTED", synchronization_status: "Pending" },
    { student_id: "enrolled-3", source_name: "PLP Admissions", admission_status: "ACCEPTED", synchronization_status: "Successful" },
  ];
  const result = await getLoader(mockClient({ institutionalStudents, admissionsHandoffs }))();
  assert.deepEqual(Array.from(result.admittedStudents, (row) => row.student_number),
    ["26-90001", "26-90003"], "accepted Admissions identities remain visible after student status changes to ACTIVE");
  assert.equal(result.students.length, 2, "Existing Phase 8 students remain visible");
});

test("Registrar combines Manggi's confirmed Admissions seat with confirmed Phase 8 registration without converting either to official", async () => {
  const student = { id: "manggi", user_id: "manggi-user", student_number: "26-50604",
    student_type: "NEW_STUDENT", student_status: "ADMITTED", program_code: "BSIT",
    year_level_number: 1, is_synthetic_demo: false, record_kind: "INSTITUTIONAL" };
  const handoff = { student_id: "manggi", source_name: "PLP Admissions",
    admission_status: "ACCEPTED", synchronization_status: "Successful" };
  const manggiRegistration = { id: "demo-manggi", student_id: "manggi", term_id: term,
    block_id: "generated", status: "CONFIRMED_SIMULATION",
    confirmed_at: "2026-10-30T14:16:00Z", source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION",
    simulation_only: true, is_official: false };
  const phase8Registration = { id: "project-1", student_id: "student-generated",
    term_id: term, home_block_id: "generated", status: "CONFIRMED_SIMULATION",
    confirmed_at: "2026-10-30T13:00:00Z", source_provenance: "GENERATED_PROJECT",
    verified_institutionally: false };
  const result = await getLoader(mockClient({
    institutionalStudents: [student], admissionsHandoffs: [handoff],
    institutionalUsers: [{ id: "manggi-user", role_code: "student",
      full_name: "MANGGI MIGUELITO JR.", account_status: "Active", auth_user_id: "auth-manggi",
      source_account_key: "PLP_ADMISSIONS:MANGGI" }],
    admissionsDemonstrations: [manggiRegistration],
    projectRegistrations: [phase8Registration],
  }))();
  const original = result.students.find((row) => row.student_number === "26-50001");
  const manggi = result.students.find((row) => row.student_number === "26-50604");
  const block = result.groups.find((row) => row.blockSection === "BSIT-1A");
  assert.equal(original.enrollment_status, "CONFIRMED_SIMULATION");
  assert.equal(original.official_enrollment_status, "NOT_CONFIRMED");
  assert.equal(manggi.enrollment_status, "CONFIRMED_SIMULATION");
  assert.equal(manggi.official_enrollment_status, "NOT_CONFIRMED");
  assert.equal(manggi.home_block, "BSIT-1A");
  assert.equal(manggi.project_only, false, "real Admissions student identity must remain institutional");
  assert.equal(manggi.admissions_demonstration, true);
  assert.equal(block.assignedStudents, 2);
  assert.equal(block.confirmedStudents, 2);
  const admitted = result.admittedStudents.find((row) => row.student_number === "26-50604");
  assert.equal(admitted.assigned_block, "BSIT-1A");
  assert.equal(admitted.year_level, 1);
  assert.equal(admitted.demonstration_review_status, "CONFIRMED_SIMULATION");
  assert.equal(admitted.official_enrollment_status, "NOT_CONFIRMED");
});

test("Unconfirmed Admissions reservation occupies one seat without falsely indicating confirmation", async () => {
  const student = { id: "new", user_id: "new-user", student_number: "26-50601",
    student_type: "NEW_STUDENT", student_status: "ADMITTED", program_code: "BSIT",
    year_level_number: 1, is_synthetic_demo: false, record_kind: null };
  const result = await getLoader(mockClient({
    institutionalStudents: [student],
    admissionsHandoffs: [{ student_id: "new", source_name: "PLP Admissions",
      admission_status: "ACCEPTED", synchronization_status: "Successful" }],
    institutionalUsers: [{ id: "new-user", full_name: "ALBERT I CAMUS",
      source_account_key: "PLP_ADMISSIONS:ALBERT" }],
    admissionsDemonstrations: [{ id: "d1", student_id: "new", term_id: term,
      block_id: "generated", status: "PROPOSED",
      source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION", simulation_only: true, is_official: false }],
  }))();
  const row = result.students.find((member) => member.student_number === "26-50601");
  assert.equal(row.enrollment_status, "PROPOSED");
  assert.equal(row.official_enrollment_status, "NOT_CONFIRMED");
  assert.equal(result.groups.find((group) => group.blockId === "generated").assignedStudents, 2);
  assert.equal(result.groups.find((group) => group.blockId === "generated").confirmedStudents, 0);
});

test("Transferred Admissions placement appears only in its active target block and keeps official status independent", async () => {
  const profile = { id: "moved", user_id: "moved-user", student_number: "26-70604",
    student_type: "NEW_STUDENT", student_status: "ACTIVE", program_code: "BSIT",
    year_level_number: 1, is_synthetic_demo: false, record_kind: null };
  const result = await getLoader(mockClient({
    additionalBlocks: [{ ...generatedBlock, id: "transfer-target", code: "BSIT-1B",
      synthetic_source_key: null, section_letter: "B" }],
    institutionalStudents: [profile],
    admissionsHandoffs: [{ student_id: "moved", source_name: "PLP Admissions",
      admission_status: "ACCEPTED", synchronization_status: "Successful" }],
    institutionalUsers: [{ id: "moved-user", full_name: "TRANSFER TEST", account_status: "Active",
      source_account_key: "PLP_ADMISSIONS:MOVE" }],
    admissionsDemonstrations: [{ id: "demo-moved", student_id: "moved",
      block_id: "transfer-target", term_id: term, status: "CONFIRMED_SIMULATION",
      confirmed_at: "2026-10-30T15:00:00Z",
      source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION", simulation_only: true, is_official: false }],
    officialEnrollments: [{ id: "verified-official", student_id: "moved", term_id: term,
      status: "CONFIRMED", confirmed_at: "2026-10-30T15:30:00Z" }],
  }))();
  const row = result.students.find((member) => member.student_number === "26-70604");
  assert.equal(row.home_block_id, "transfer-target");
  assert.equal(result.students.filter((member) => member.student_number === "26-70604").length, 1);
  assert.equal(result.groups.find((group) => group.blockId === "generated").assignedStudents, 1);
  assert.equal(result.groups.find((group) => group.blockId === "manual").assignedStudents, 1);
  assert.equal(result.groups.find((group) => group.blockId === "transfer-target").assignedStudents, 1);
  const admitted = result.admittedStudents[0];
  assert.equal(admitted.demonstration_review_status, "CONFIRMED_SIMULATION");
  assert.equal(admitted.official_enrollment_status, "CONFIRMED");
  assert.equal(admitted.assigned_block, "BSIT-1B");
});

test("a verified future term Admissions block remains visible without being merged into the 2026 cohort", async () => {
  const futureTerm = "TERM-2027-1";
  const result = await getLoader(mockClient({
    additionalTerms: [{ id: futureTerm, label: "First Semester 2027 to 2028" }],
    additionalBlocks: [{ ...generatedBlock, id: "future-bsit", term_id: futureTerm,
      code: "BSIT-2B", year_level: 2, section_letter: "B", synthetic_source_key: null }],
    institutionalStudents: [{ id: "transferee", user_id: "transferee-user",
      student_number: "27-50603", student_type: "TRANSFEREE", student_status: "ADMITTED",
      program_code: "BSIT", year_level_number: 2, is_synthetic_demo: false }],
    institutionalUsers: [{ id: "transferee-user", full_name: "TRANSFEREE TEST",
      source_account_key: "PLP_ADMISSIONS:FUTURE" }],
    admissionsSourceDetails: [{ student_id: "transferee", inputted_gwa: 89, gwa_verified: true }],
    admissionsHandoffs: [{ student_id: "transferee", source_name: "PLP Admissions",
      admission_status: "ACCEPTED", synchronization_status: "Successful" }],
    admissionsDemonstrations: [{ id: "future-demo", student_id: "transferee",
      term_id: futureTerm, block_id: "future-bsit", status: "PROPOSED",
      source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION", simulation_only: true,
      is_official: false }],
  }))();
  const futureGroup = result.groups.find((group) => group.blockId === "future-bsit");
  assert.equal(futureGroup.termId, futureTerm);
  assert.equal(futureGroup.assignedStudents, 1);
  assert.equal(result.students.find((student) => student.student_number === "27-50603")?.home_block,
    "BSIT-2B");
  assert.equal(result.admittedStudents[0].enrollment_term_id, futureTerm);
  assert.equal(result.admittedStudents[0].demonstration_review_status, "PROPOSED");
  assert.equal(result.admittedStudents[0].official_enrollment_status, "NOT_CONFIRMED");
  assert.equal(result.groups.find((group) => group.blockId === "generated").assignedStudents, 1);
});

test("Registrar rejects duplicate or falsely official Admissions demonstration records", async () => {
  const fake = { id: "f1", student_id: "new", term_id: term, block_id: "generated",
    status: "CONFIRMED_SIMULATION", source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION",
    simulation_only: true, is_official: true };
  const student = { id: "new", user_id: "new-user", student_number: "26-77777",
    student_status: "ADMITTED", program_code: "BSIT", is_synthetic_demo: false };
  const opts = { institutionalStudents: [student],
    admissionsHandoffs: [{ student_id: "new", source_name: "PLP Admissions",
      admission_status: "ACCEPTED", synchronization_status: "Successful" }],
    admissionsDemonstrations: [fake] };
  await assert.rejects(getLoader(mockClient(opts))(), /source provenance mismatch/);
  await assert.rejects(getLoader(mockClient({ ...opts, admissionsDemonstrations: [
    { ...fake, is_official: false }, { ...fake, id: "f2", is_official: false },
  ] }))(), /Duplicate demonstration registrations/);
});

test("Registrar Students rejects a denied manual roster or duplicate student membership", async () => {
  await assert.rejects(getLoader(mockClient({ rejectManualRoster: true }))());
  await assert.rejects(getLoader(mockClient({ repeatStudent: true }))(),
    /roster and cohort profiles are inconsistent/);
});
