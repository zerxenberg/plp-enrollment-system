import assert from "node:assert/strict";
import test from "node:test";
import {
  projectPhase8SubjectEstimate, projectPhase8PlacementEstimate,
  verifyProjectPhase8CurriculumTuition,
} from "./coordinator-phase8-pricing.mjs";
import { liveTuitionEstimate } from "./academic-setup-normalized.js";

const classification = "SYNTHETIC_DEVELOPMENT_ONLY";

test("Phase8 subject display consumes real normalized 2/3 units and configured per-unit prices", () => {
  const first = projectPhase8SubjectEstimate(
    { code: "FICTION-A", units: 2 },
    { subject_code: "FICTION-A", rate_per_unit: "100.00", classification },
  );
  const second = projectPhase8SubjectEstimate(
    { code: "FICTION-B", units: 3 },
    { subject_code: "FICTION-B", rate_per_unit: "125.00", classification },
  );
  assert.deepEqual(first, { units: 2, feePerUnit: 100, fee: 200, feeClassification: classification });
  assert.deepEqual(second, { units: 3, feePerUnit: 125, fee: 375, feeClassification: classification });
  assert.throws(() => projectPhase8SubjectEstimate({ code: "OLD", units: 4 }, {
    subject_code: "OLD", rate_per_unit: 100, classification,
  }), /units or price provenance/);
  assert.throws(() => projectPhase8SubjectEstimate(
    { code: "FICTION-A", units: 2 }, null,
  ), /price provenance/);
});

test("semester and full-curriculum tuition use the same normalized rates, with no fallback", () => {
  const subjects = Array.from({ length: 60 }, (_, i) => ({
    code: `SUB-${i}`, units: i < 16 ? 2 : 3,
  }));
  const priced = new Map(subjects.map((subject) => [subject.code,
    projectPhase8SubjectEstimate(subject,
      { subject_code: subject.code, rate_per_unit: "100.00", classification })]));
  const assignments = subjects.map((subject, i) => ({
    subjectCode: subject.code,
    yearLevel: `${Math.floor(i / 15) + 1}${["st", "nd", "rd", "th"][Math.floor(i / 15)]} Year`,
    semester: i % 15 < 7 ? "First Semester" : "Second Semester",
    ...projectPhase8PlacementEstimate({ units_override: null }, priced.get(subject.code)),
  }));
  const summary = verifyProjectPhase8CurriculumTuition(assignments, priced, {
    priced_subjects: 60, unpriced_subjects: 0, academic_units: 164,
    estimated_tuition: "16400.00", semesters_represented: 8,
    is_complete: true, classification,
  });
  assert.equal(summary.totalUnits, 164);
  assert.equal(summary.estimatedTuition, 16400);
  assert.equal(summary.estimatedTuitionCoverage, 8);
  assert.equal(liveTuitionEstimate(assignments, subjects).amount, 16400);
  const semester = liveTuitionEstimate(assignments, subjects, "1st Year", "First Semester");
  assert.equal(semester.amount, 1400);
  assert.equal(semester.count, 7);
  assert.equal(semester.missing, 0);
  assert.throws(() => verifyProjectPhase8CurriculumTuition(assignments, priced, {
    priced_subjects: 60, unpriced_subjects: 0, academic_units: 168,
    estimated_tuition: "16800.00", semesters_represented: 8,
    is_complete: true, classification,
  }), /totals disagree/);
});
