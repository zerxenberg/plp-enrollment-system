import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { estimateProjectSelectedSubjects, selectedProjectSubjectCodes } from "../src/features/students/project-fee-estimate.mjs";

const require = createRequire(import.meta.url);
const { loadBindings, transform } = require("next/dist/build/swc");
const source = readFileSync(
  new URL("../src/features/students/student-enrollment-server.js", import.meta.url),
  "utf8",
);
await loadBindings();
const compiled = await transform(source, {
  filename: "student-enrollment-server.js",
  jsc: { parser: { syntax: "ecmascript" }, target: "es2022" },
  module: { type: "commonjs" },
});
const mod = { exports: {} };
vm.runInNewContext(compiled.code, {
  module: mod, exports: mod.exports,
  require: (name) => {
    if (name === "server-only") return {};
    if (name === "./student-context-server") return {};
    if (name === "./project-fee-estimate.mjs") return {
      estimateProjectSelectedSubjects, selectedProjectSubjectCodes,
    };
    if (name === "./project-fee-prices-server") return {};
    throw new Error(`Unexpected dependency: ${name}`);
  },
}, { filename: "student-enrollment-server.compiled.js" });
const { buildStudentEnrollmentSummary: prepare } = mod.exports;

function fixture({ status = null, ready = true, termStart = "2026-10-01",
  termEnd = "2026-10-31" } = {}) {
  return {
    context: { studentNumber: "26-50001", studentType: "CONTINUING_STUDENT" },
    snapshot: {
      project_only: true, verified_institutionally: false,
      student_name: "Project Student One", student_number: "26-50001",
      program_code: "BSIT", curriculum_code: "P8F26-BSIT",
      year_level: 3, term_id: "TERM-2026-1",
      academic_classification: "IRREGULAR",
      schedule_validated_for_project: ready,
      subjects: [
        { subject_code: "IT301", subject_name: "Software Design", academic_units: 3, eligibility: "ELIGIBLE" },
        { subject_code: "IT201", subject_name: "Database", academic_units: 3, eligibility: "RETAKE" },
        { subject_code: "IT401", subject_name: "Networks", academic_units: 3, eligibility: "ELIGIBLE" },
        { subject_code: "IT402", subject_name: "Advanced Systems", academic_units: 3, eligibility: "RESTRICTED", reason: "Failed prerequisite" },
      ],
      class_schedule: [
        { subject_code: "IT301", day: "Monday", start_time: "08:00", end_time: "10:00" },
        { subject_code: "IT201", day: "Tuesday", start_time: "09:00", end_time: "11:00" },
      ],
      previous_results: [{ result: "FAILED", subject_code: "IT201" }],
      transfer_credits: [],
    },
    term: { id: "TERM-2026-1", label: "2026 · First Semester",
      enrollment_start: termStart, enrollment_end: termEnd, status: "Open" },
    simulation: status ? { id: "sim-1", status, submitted_at: "2026-10-02" } : null,
    sectionCodes: new Map([ ["IT301", "BSIT-3A"], ["IT201", "BSIT-3A"], ["IT402", "BSIT-3A"] ]),
    priceRows: [
      { subject_code: "IT301", rate_per_unit: 100, classification: "SYNTHETIC_DEVELOPMENT_ONLY" },
      { subject_code: "IT201", rate_per_unit: 100, classification: "SYNTHETIC_DEVELOPMENT_ONLY" },
    ],
    asOfDate: "2026-10-23",
  };
}

test("automatic preparation counts only eligible scheduled block subjects and retakes", () => {
  const result = prepare(fixture());
  assert.equal(result.kind, "ready");
  assert.equal(result.canSubmit, true);
  assert.equal(result.proposedSubjects.length, 2);
  assert.equal(result.proposedUnits, 6);
  assert.equal(result.projectFeeEstimate.estimatedAmount, 600);
  assert.deepEqual(Array.from(result.proposedSubjects, (row) => row.code), ["IT301", "IT201"]);
  assert.equal(result.subjects.find((row) => row.code === "IT401").section, null);
  assert.equal(result.subjects.find((row) => row.code === "IT402").eligibility, "RESTRICTED");
  assert.equal(result.student.classification, "IRREGULAR");
  assert.equal(result.officialStatus, "NOT_CONFIRMED");
});

test("expired term and unvalidated timetable block student submission", () => {
  for (const input of [fixture({ termEnd: "2026-06-30" }), fixture({ ready: false })]) {
    const result = prepare(input);
    assert.equal(result.canSubmit, false);
    assert.ok(result.blockingReasons.length > 0);
  }
});

test("a verified project demonstration window opens enrollment without rewriting old term dates", () => {
  const oldTerm = fixture({ termStart: "2026-06-10", termEnd: "2026-06-30" });
  const demoWindow = {
    project_cohort_id: "PLP_PROJECT_600_2026_1",
    term_id: "TERM-2026-1",
    source_type: "PROJECT_ONLY_FICTIONAL",
    verified_institutionally: false,
    start_date: "2026-10-23",
    end_date: "2026-11-06",
    status: "OPEN",
  };
  const ready = prepare({ ...oldTerm, demoWindow });
  assert.equal(ready.canSubmit, true);
  assert.equal(ready.term.windowOpen, true);
  assert.equal(ready.term.demonstrationWindow, true);
  assert.equal(ready.term.enrollmentStart, "2026-10-23");
  assert.equal(oldTerm.term.enrollment_start, "2026-06-10");
  for (const invalid of [
    { ...demoWindow, status: "CLOSED" },
    { ...demoWindow, verified_institutionally: true },
    { ...demoWindow, project_cohort_id: "UNRELATED" },
    { ...demoWindow, start_date: "2026-11-01" },
  ]) {
    assert.equal(prepare({ ...oldTerm, demoWindow: invalid }).canSubmit, false);
  }
});

test("submitted or simulated confirmed enrollment is read only, never officially confirmed", () => {
  for (const status of ["SUBMITTED", "VALIDATED", "CONFIRMED_SIMULATION"]) {
    const result = prepare(fixture({ status }));
    assert.equal(result.canSubmit, false);
    assert.equal(result.simulation.status, status);
    assert.equal(result.officialStatus, "NOT_CONFIRMED");
  }
  assert.equal(prepare(fixture({ status: "RETURNED" })).canSubmit, true);
  const returned = prepare({
    ...fixture({ status: "RETURNED" }), correctionReason: "Revise the recorded class section",
  });
  assert.equal(returned.simulation.correctionReason, "Revise the recorded class section");
});
