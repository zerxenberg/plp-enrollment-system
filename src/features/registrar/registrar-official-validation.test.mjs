import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const mocks = new Map([
  ["next/cache", 'export function revalidatePath() {}'],
  ["@/lib/auth/require-role", 'export async function requireRole(role) { return globalThis.__registrarReviewRole(role); }'],
  ["@/lib/supabase/server", 'export async function createClient() { return globalThis.__registrarReviewClient; }'],
  ["@/features/academic/project-phase8-actions",
    'export const readProjectDemonstrationCOR = () => {}; export const simulateProjectEnrollmentAction = () => {};'],
  ["@/features/grade-import/registrar-grade-actions",
    "export const amendOfficialAcademicResult=()=>{}; export const attestOfficialGradeSource=()=>{}; export const getOfficialRegistrationData=()=>{}; export const previewOfficialGradeImport=()=>{}; export const publishOfficialGradeImport=()=>{}; export const stageOfficialGradeImport=()=>{}; export const validateOfficialGradeImport=()=>{};"],
  ["@/features/students/official-enrollment-actions",
    'export const confirmRegistrarValidatedEnrollment = () => {};'],
  ["./registrar-queries",
    'export const getRegistrarProjectEnrollmentDetail=()=>{}; export const getRegistrarStudentRecordDetail=()=>{};'],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks.has(specifier)) {
      return { url: `mock-registrar:${encodeURIComponent(specifier)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("mock-registrar:")) {
      return {
        format: "module",
        source: mocks.get(decodeURIComponent(url.slice("mock-registrar:".length))),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { reviewOfficialEnrollment } = await import("./registrar-actions.js");
const ENROLLMENT_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const B = "44444444-4444-4444-8444-444444444444";
const OFFER_A = "55555555-5555-4555-8555-555555555555";
const OFFER_B = "66666666-6666-4666-8666-666666666666";
const ROOM = "77777777-7777-4777-8777-777777777777";
const INSTRUCTOR = "88888888-8888-4888-8888-888888888888";

function fixture() {
  const db = {
    enrollments: [{ id: ENROLLMENT_ID, student_id: STUDENT_ID, term_id: "TERM-2026-1",
      status: "FOR_VALIDATION", program_code: "BSIT", curriculum_code: "BSIT-2024", declared_units: 6 }],
    student_profiles: [{ id: STUDENT_ID, user_id: "app-user", record_kind: "INSTITUTIONAL",
      is_synthetic_demo: false, student_status: "ACTIVE", program_code: "BSIT",
      current_curriculum_code: "BSIT-2024", current_term_id: "TERM-2026-1" }],
    academic_terms: [{ id: "TERM-2026-1", academic_year: "2026 to 2027", semester: "First Semester" }],
    curricula: [{ code: "BSIT-2024", program_code: "BSIT", status: "Active" }],
    curriculum_subjects: [{ curriculum_code: "BSIT-2024", subject_code: "SUB1" },
      { curriculum_code: "BSIT-2024", subject_code: "SUB2" }],
    enrollment_subjects: [{ enrollment_id: ENROLLMENT_ID, subject_code: "SUB1", section_id: A,
      registration_status: "SELECTED", units_at_enrollment: 3 },
    { enrollment_id: ENROLLMENT_ID, subject_code: "SUB2", section_id: B,
      registration_status: "SELECTED", units_at_enrollment: 3 }],
    student_subject_eligibility: ["SUB1", "SUB2"].map((subject_code) => ({
      student_id: STUDENT_ID, term_id: "TERM-2026-1", subject_code,
      eligibility_status: "ELIGIBLE", source_name: "REGISTRAR_PUBLICATION_V1",
    })),
    sections: [{ id: A, subject_code: "SUB1", subject_offering_id: OFFER_A },
      { id: B, subject_code: "SUB2", subject_offering_id: OFFER_B }]
      .map((row) => ({ ...row, term_id: "TERM-2026-1", status: "OPEN",
        schedule_status: "FINALIZED", capacity: 40, is_synthetic_demo: false })),
    subject_offerings: [{ id: OFFER_A, subject_code: "SUB1" },
      { id: OFFER_B, subject_code: "SUB2" }].map((row) => ({
      ...row, term_id: "TERM-2026-1", program_code: "BSIT",
      curriculum_code: "BSIT-2024", status: "ACTIVE", is_synthetic_demo: false,
    })),
    section_meetings: [{ section_id: A, day_of_week: 1, start_time: "08:00", end_time: "09:00" },
      { section_id: B, day_of_week: 2, start_time: "08:00", end_time: "09:00" }]
      .map((row) => ({ ...row, room_id: ROOM, meeting_status: "ACTIVE", is_synthetic_demo: false })),
    section_instructors: [{ section_id: A, instructor_id: INSTRUCTOR, assignment_role: "PRIMARY" },
      { section_id: B, instructor_id: INSTRUCTOR, assignment_role: "PRIMARY" }],
    rooms: [{ id: ROOM, is_active: true, is_synthetic_demo: false }],
    instructors: [{ id: INSTRUCTOR, is_synthetic_demo: false, display_name: "Verified faculty" }],
  };
  let updates = 0;
  let reviews = 0;
  const client = {
    async rpc(name, args) {
      assert.equal(name, "registrar_review_verified_admissions_enrollment_v1");
      const row = db.enrollments.find((item) =>
        item.id === args.p_enrollment_id && item.status === "FOR_VALIDATION");
      if (!row || !["VALIDATE", "RETURN"].includes(args.p_action) ||
          args.p_reason.trim().length < 10) {
        return { data: null, error: { message: "Review refused" } };
      }
      reviews++;
      row.status = args.p_action === "VALIDATE" ? "VALIDATED" : "REQUIRES_CORRECTION";
      row.current_correction_reason = args.p_action === "RETURN" ? args.p_reason : null;
      return { data: { enrollment_id: row.id, status: row.status, reviewed: true }, error: null };
    },
    from(name) {
      const clauses = [];
      let patch = null;
      const matches = (row) => clauses.every(([key, expected, isArray]) =>
        isArray ? expected.includes(row[key]) : row[key] === expected);
      const execute = () => {
        const records = db[name].filter(matches);
        if (patch) {
          updates += records.length;
          for (const row of records) Object.assign(row, patch);
          return { data: records.map((row) => ({ ...row })), error: null };
        }
        return { data: records.map((row) => ({ ...row })), error: null };
      };
      const builder = {
        select() { return builder; },
        update(fields) { patch = fields; return builder; },
        eq(key, value) { clauses.push([key, value, false]); return builder; },
        in(key, values) { clauses.push([key, values, true]); return builder; },
        async maybeSingle() {
          const result = execute();
          return { ...result, data: result.data.length === 1 ? result.data[0] : null };
        },
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
      };
      return builder;
    },
  };
  globalThis.__registrarReviewClient = client;
  globalThis.__registrarReviewRole = async (role) => {
    if (role !== "registrar") throw new Error("Access denied");
    return { id: "registrar-user" };
  };
  return { db, get updates() { return updates; }, get reviews() { return reviews; } };
}

test("Registrar validates source-backed institutional subjects without confirming enrollment", async () => {
  const state = fixture();
  const result = await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "VALIDATE", reason: "Verified academic source and timetable" });
  assert.equal(result.ok, true);
  assert.equal(result.data.status, "VALIDATED");
  assert.equal(state.db.enrollments[0].status, "VALIDATED");
  assert.equal(state.reviews, 1);
  assert.equal(state.updates, 0, "only the trusted RPC can mutate enrollment");
});

test("Correction requires a reason and preserves it in the enrollment", async () => {
  const state = fixture();
  assert.equal((await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "RETURN", reason: "short" })).ok, false);
  const result = await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "RETURN", reason: "Missing required registration proof" });
  assert.equal(result.ok, true);
  assert.equal(result.data.status, "REQUIRES_CORRECTION");
  assert.equal(state.db.enrollments[0].current_correction_reason,
    "Missing required registration proof");
  assert.equal(state.reviews, 1);
  assert.equal(state.updates, 0);
});

test("Project-only and synthetic records cannot be reviewed as official", async () => {
  const state = fixture();
  state.db.student_profiles[0].record_kind = "PROJECT_ONLY";
  assert.equal((await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "VALIDATE", reason: "Review source enrollment" })).ok, false);
  assert.equal((await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "RETURN", reason: "Requires academic correction" })).ok, false);
  assert.equal(state.updates, 0);
});

test("Official validation fails closed for missing academic, timetable, or capacity evidence", async () => {
  const changes = [
    (db) => { db.student_subject_eligibility[0].eligibility_status = "RESTRICTED"; },
    (db) => { db.sections[0].is_synthetic_demo = true; },
    (db) => { db.sections[0].status = "PLANNED"; },
    (db) => { db.subject_offerings[0].is_synthetic_demo = true; },
    (db) => { db.section_meetings[0].room_id = null; },
    (db) => { db.section_meetings[1].day_of_week = 1; },
    (db) => { db.rooms[0].is_active = false; },
    (db) => { db.section_instructors.length = 0; },
    (db) => { db.enrollments[0].declared_units = 9; },
  ];
  for (const alter of changes) {
    const state = fixture();
    alter(state.db);
    const result = await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
      action: "VALIDATE", reason: "Verified academic source and timetable" });
    assert.equal(result.ok, false, "invalid official source must prevent review");
    assert.equal(state.reviews, 0);
    assert.equal(state.updates, 0);
  }
});

test("Official validation rejects a section with fully occupied confirmed seats", async () => {
  const state = fixture();
  state.db.sections[0].capacity = 1;
  state.db.enrollments.push({
    id: "99999999-9999-4999-8999-999999999999",
    student_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    term_id: "TERM-2026-1", status: "CONFIRMED",
  });
  state.db.enrollment_subjects.push({
    enrollment_id: "99999999-9999-4999-8999-999999999999",
    subject_code: "SUB1", section_id: A, registration_status: "CONFIRMED",
  });
  const result = await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "VALIDATE", reason: "Verified academic source and timetable" });
  assert.equal(result.ok, false);
  assert.match(result.message, /capacity/);
  assert.equal(state.reviews, 0);
  assert.equal(state.updates, 0);
});

test("Only authenticated Registrar and FOR_VALIDATION records can be reviewed", async () => {
  const state = fixture();
  globalThis.__registrarReviewRole = async () => { throw new Error("Access denied"); };
  assert.equal((await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "VALIDATE", reason: "Verified academic source and timetable" })).ok, false);
  assert.equal(state.updates, 0);
  globalThis.__registrarReviewRole = async () => ({ id: "registrar-user" });
  state.db.enrollments[0].status = "SUBMITTED";
  assert.equal((await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "RETURN", reason: "Requires academic correction" })).ok, false);
  assert.equal(state.updates, 0);
});

test("Official review requires an audit reason and trusted transactional acknowledgment", async () => {
  const state = fixture();
  assert.equal((await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "VALIDATE", reason: "short" })).ok, false);
  assert.equal(state.reviews, 0);
  globalThis.__registrarReviewClient.rpc = async () => ({
    data: { enrollment_id: ENROLLMENT_ID, status: "VALIDATED", reviewed: false },
    error: null,
  });
  const result = await reviewOfficialEnrollment({ enrollmentId: ENROLLMENT_ID,
    action: "VALIDATE", reason: "Verified academic source and timetable" });
  assert.equal(result.ok, false);
  assert.equal(state.updates, 0);
});
