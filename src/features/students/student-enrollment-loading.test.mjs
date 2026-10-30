import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { estimateProjectSelectedSubjects, selectedProjectSubjectCodes } from "./project-fee-estimate.mjs";

// Execute the production loader, including its summary and fail-closed guards,
// with stand-ins for the owner-checked Supabase reads. No live writes.
const serverSource = readFileSync(new URL("./student-enrollment-server.js", import.meta.url), "utf8")
  .replace(/^import\s+["'][^"']+["'];\s*$/gm, "")
  .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*$/gm, "")
  .replace(/^export\s+(?=(?:async\s+)?function\s+)/gm, "");

const subjectCode = "P8F26-BSIT-T03-M1";
const studentId = "student-uuid";
const snapshot = {
  project_only: true, verified_institutionally: false,
  data_origin: "GENERATED_PROJECT", student_number: "25-50001",
  term_id: "TERM-2026-1", curriculum_code: "P8F26-BSIT-V1",
  schedule_validated_for_project: true, year_level: 2,
  subjects: [{ subject_code: subjectCode, subject_name: "Data Structures", academic_units: 3 }],
  class_schedule: [{ subject_code: subjectCode, day: 1, start_time: "08:00", end_time: "09:00" }],
};

function queryResult(data, error = null) {
  const result = { data, error };
  const query = {
    select: () => query, eq: () => query, in: () => query,
    maybeSingle: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function setup({ accountReady = true, readinessError = null, termError = null,
  sectionStatus = "PLANNED", simulationStatus = "CONFIRMED_SIMULATION",
  gradeReady = false } = {}) {
  const calls = [];
  const tableResults = {
    academic_terms: queryResult({
      id: "TERM-2026-1", semester: "First Semester", status: "Open",
      enrollment_start: "2026-10-01", enrollment_end: "2026-11-30",
    }, termError),
    project_student_academic_placements: queryResult({ home_block_id: "block-uuid" }),
    project_phase8_demo_enrollment_window: queryResult({
      project_cohort_id: "PLP_PROJECT_600_2026_1", term_id: "TERM-2026-1",
      source_type: "PROJECT_ONLY_FICTIONAL", verified_institutionally: false,
      start_date: "2026-10-01", end_date: "2026-11-30", status: "OPEN",
    }),
    curriculum_subjects: queryResult([{ subject_code: subjectCode }]),
    block_subject_sections: queryResult([{ section_id: "section-uuid" }]),
    sections: queryResult([{
      id: "section-uuid", subject_code: subjectCode, section_code: "BSIT-2A",
      status: sectionStatus, schedule_status: "FINALIZED",
    }]),
  };
  const context = {
    kind: "project", studentId, studentNumber: "25-50001",
    studentType: "CONTINUING_STUDENT",
    client: {
      rpc: async (name) => {
        calls.push(name);
        if (name === "project_phase8_student_snapshot_v2") return { data: snapshot };
        if (name === "project_phase8_student_portal_status_v1") return { data: {
          project_only: true, verified_institutionally: false,
          curriculum_is_official: false, curriculum_code: "P8F26-BSIT-V1",
          simulation: { id: "sim-uuid", status: simulationStatus },
        } };
        if (name === "project_phase8_demonstration_cor_v1") {
          return { error: { code: "P0001", message: "No immutable subject snapshot" } };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    },
    admin: {
      from: (table) => {
        calls.push(table);
        assert.ok(tableResults[table], `Unexpected table ${table}`);
        return tableResults[table];
      },
    },
  };
  const sandbox = {
    getStudentContext: async () => accountReady ? context : { kind: "unavailable" },
    requireStudentContext: async () => context,
    loadStudentPublishedReadiness: async () => {
      if (readinessError) throw readinessError;
      return { readiness: { ready: gradeReady, reason: gradeReady ? null : "Published results not accepted" },
        subjectDecisions: new Map([[subjectCode, {
          eligibility: gradeReady ? "ELIGIBLE" : "PENDING_EVALUATION",
        }]]),
        acceptedProjectResults: gradeReady ? [{
          subject_code: "P8F26-BSIT-T02-M1", result_status: "COMPLETED",
          source: "ACCEPTED_PROJECT",
        }] : [],
        projectTransferDecisions: [],
      };
    },
    loadVerifiedProjectSubjectPrices: async () => gradeReady
      ? [{ subject_code: subjectCode, rate_per_unit: 100,
        classification: "SYNTHETIC_DEVELOPMENT_ONLY" }] : [],
    selectedProjectSubjectCodes,
    estimateProjectSelectedSubjects,
  };
  runInNewContext(`${serverSource}\nthis.load = loadStudentEnrollmentForPage;`, sandbox);
  return { load: sandbox.load, calls };
}

test("valid pilot identity with PLANNED sections renders blocked enrollment, not auth failure", async () => {
  const { load } = setup();
  const data = await load();
  assert.equal(data.kind, "ready");
  assert.equal(data.student.number, "25-50001");
  assert.equal(data.canSubmit, false);
  assert.equal(data.proposedSubjects.length, 0);
  assert.equal(data.proposedUnits, 0);
  assert.ok(data.blockingReasons.some((reason) => reason.includes("academically eligible subjects")));
});

test("published grades plus Coordinator OPEN section and Registrar RETURNED recovery prepare live subjects", async () => {
  const { load } = setup({ sectionStatus: "OPEN", simulationStatus: "RETURNED", gradeReady: true });
  const data = await load();
  assert.equal(data.kind, "ready");
  assert.equal(data.student.number, "25-50001");
  assert.equal(data.simulation.status, "RETURNED");
  assert.equal(data.subjects.length, 1);
  assert.equal(data.proposedSubjects.length, 1);
  assert.equal(data.proposedUnits, 3);
  assert.equal(data.projectFeeEstimate.estimatedAmount, 300);
  assert.equal(data.acceptedProjectResults.length, 1);
  assert.equal(data.canSubmit, true);
});

test("returned student with validated PLANNED sections sees prepared units and verified price but cannot submit", async () => {
  const { load } = setup({ sectionStatus: "PLANNED", simulationStatus: "RETURNED", gradeReady: true });
  const data = await load();
  assert.equal(data.kind, "ready");
  assert.equal(data.proposedSubjects.length, 1);
  assert.equal(data.proposedUnits, 3);
  assert.equal(data.openSubjectCount, 0);
  assert.equal(data.projectFeeEstimate.estimatedAmount, 300);
  assert.equal(data.canSubmit, false);
  assert.ok(data.blockingReasons.some((reason) => reason.includes("Academic Coordinator") && reason.includes("PLANNED")));
});

test("seven verified BSIT-2A classes total 19 units and PHP 1900 before and after section activation", () => {
  const codes = [
    "P8F26-GE-T03-1", "P8F26-GE-T03-2", "P8F26-GE-T03-3",
    "P8F26-BSIT-T03-M1", "P8F26-BSIT-T03-M2", "P8F26-BSIT-T03-M3", "P8F26-BSIT-T03-M4",
  ];
  const units = [3, 3, 2, 3, 3, 3, 2];
  const rows = codes.map((code, index) => ({ subject_code: code,
    subject_name: code, academic_units: units[index] }));
  const sandbox = { estimateProjectSelectedSubjects, selectedProjectSubjectCodes };
  runInNewContext(`${serverSource}\nthis.buildSummary = buildStudentEnrollmentSummary;`, sandbox);
  const makeSummary = (sectionStatus) => sandbox.buildSummary({
    context: { studentNumber: "25-50001", studentType: "CONTINUING_STUDENT" },
    snapshot: { ...snapshot, student_name: "Miguel Marie Garcia", subjects: rows,
      class_schedule: codes.map((code) => ({ subject_code: code, day: 1,
        start_time: "08:00", end_time: "09:00" })) },
    sectionCodes: new Map(codes.map((code) => [code, {
      code: "BSIT-2A", status: sectionStatus, scheduleStatus: "FINALIZED",
    }])),
    term: { id: "TERM-2026-1", label: "First Semester 2026 to 2027",
      academic_year: "2026 to 2027", semester: "First Semester" },
    demoWindow: { project_cohort_id: "PLP_PROJECT_600_2026_1", term_id: "TERM-2026-1",
      source_type: "PROJECT_ONLY_FICTIONAL", verified_institutionally: false,
      status: "OPEN", start_date: "2026-10-01", end_date: "2026-11-30" },
    simulation: { status: "RETURNED" },
    currentTermCodes: new Set(codes),
    publishedEvidence: { readiness: { ready: true, classification: "REGULAR" },
      subjectDecisions: new Map(codes.map((code) => [code, { eligibility: "ELIGIBLE" }])) },
    priceRows: codes.map((code) => ({ subject_code: code,
      rate_per_unit: 100, classification: "SYNTHETIC_DEVELOPMENT_ONLY" })),
    asOfDate: "2026-10-27",
  });
  const planned = makeSummary("PLANNED");
  assert.equal(planned.proposedSubjects.length, 7);
  assert.equal(planned.proposedUnits, 19);
  assert.equal(planned.projectFeeEstimate.estimatedAmount, 1900);
  assert.equal(planned.canSubmit, false);
  const opened = makeSummary("OPEN");
  assert.equal(opened.proposedSubjects.length, 7);
  assert.equal(opened.proposedUnits, 19);
  assert.equal(opened.projectFeeEstimate.estimatedAmount, 1900);
  assert.equal(opened.openSubjectCount, 7);
  assert.equal(opened.canSubmit, true);
});

test("BSCS-2C second-year eligibility prepares seven distinct subjects, 19 units, and PHP 1900 after publication only", () => {
  const codes = [
    "P8F26-GE-T03-1", "P8F26-GE-T03-2", "P8F26-GE-T03-3",
    "P8F26-BSCS-T03-M1", "P8F26-BSCS-T03-M2",
    "P8F26-BSCS-T03-M3", "P8F26-BSCS-T03-M4",
  ];
  const units = [3, 3, 2, 3, 3, 3, 2];
  const selection = codes.map((subject_code, index) => ({
    subject_code, subject_name: subject_code, academic_units: units[index],
  }));
  const common = {
    context: { studentNumber: "25-50079", studentType: "CONTINUING_STUDENT" },
    snapshot: {
      ...snapshot, student_number: "25-50079", student_name: "Vincent Rose Mendoza",
      program_code: "BSCS", curriculum_code: "P8F26-BSCS-V1", home_block: "BSCS-2C",
      subjects: selection,
      class_schedule: codes.flatMap((subject_code) => [
        { subject_code, day: 1, start_time: "08:00", end_time: "09:00" },
        { subject_code, day: 3, start_time: "08:00", end_time: "09:00" },
      ]),
    },
    term: { id: "TERM-2026-1", semester: "First Semester", status: "Open",
      enrollment_start: "2026-10-01", enrollment_end: "2026-11-30" },
    asOfDate: "2026-10-30",
    simulation: null,
    sectionCodes: new Map(codes.map((code) => [code,
      { code: "BSCS-2C", status: "OPEN", scheduleStatus: "FINALIZED" }])),
    currentTermCodes: new Set(codes),
    priceRows: codes.map((code) => ({ subject_code: code, rate_per_unit: 100,
      classification: "SYNTHETIC_DEVELOPMENT_ONLY" })),
  };
  const sandbox = { estimateProjectSelectedSubjects, selectedProjectSubjectCodes };
  runInNewContext(`${serverSource}\nthis.buildSummary = buildStudentEnrollmentSummary;`, sandbox);
  const decisions = new Map(codes.map((code) => [code, { eligibility: "ELIGIBLE" }]));
  const pending = sandbox.buildSummary({ ...common, priceRows: [], publishedEvidence: {
    readiness: { ready: false, classification: "PENDING_EVALUATION", reason: "Eight grades awaiting publication" },
    subjectDecisions: new Map(codes.map((code) => [code, { eligibility: "PENDING_EVALUATION" }])),
  } });
  assert.equal(pending.canSubmit, false);
  assert.equal(pending.proposedUnits, 0);
  assert.equal(pending.projectFeeEstimate.estimatedAmount, 0);
  const accepted = sandbox.buildSummary({ ...common, publishedEvidence: {
    readiness: { ready: true, classification: "REGULAR" }, subjectDecisions: decisions,
  } });
  assert.equal(accepted.proposedSubjects.length, 7);
  assert.equal(accepted.proposedUnits, 19);
  assert.equal(accepted.projectFeeEstimate.estimatedAmount, 1900);
  assert.equal(accepted.projectFeeEstimate.subjects.length, 7);
  assert.equal(accepted.canSubmit, true);
});

test("published grades and OPEN section never bypass an old confirmed simulation", async () => {
  const { load } = setup({ sectionStatus: "OPEN", simulationStatus: "CONFIRMED_SIMULATION", gradeReady: true });
  const data = await load();
  assert.equal(data.kind, "ready");
  assert.equal(data.proposedSubjects.length, 1);
  assert.equal(data.canSubmit, false);
  assert.equal(data.confirmedRegistration, null);
});

test("service-role policy SELECT denial fails closed as records issue, not identity failure", async () => {
  const { load } = setup({ readinessError: Object.assign(
    new Error("Academic publication records cannot currently be verified."),
    { code: "42501" },
  ) });
  const data = await load();
  assert.equal(data.kind, "unavailable");
  assert.equal(data.reason, "records");
  assert.equal(data.canSubmit, undefined);
});

test("upstream term data error is not relabeled as a student account error", async () => {
  const { load } = setup({ termError: { code: "42501", message: "permission denied" } });
  const data = await load();
  assert.equal(data.kind, "unavailable");
  assert.equal(data.reason, "records");
});

test("missing authenticated project identity preserves sign-in warning and performs no academic reads", async () => {
  const { load, calls } = setup({ accountReady: false });
  const data = await load();
  assert.equal(data.kind, "unavailable");
  assert.equal(data.reason, "identity");
  assert.equal(calls.length, 0);
});
