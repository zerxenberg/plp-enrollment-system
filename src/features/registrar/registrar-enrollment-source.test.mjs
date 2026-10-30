import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMISSIONS_DEMO_SOURCE,
  PROJECT_COHORT_SOURCE,
  combineRegistrarProjectCases,
  isAdmissionsDemoCase,
  registrarEnrollmentSourceLabel,
} from "./registrar-enrollment-source.mjs";

const project = {
  id: "existing-project-simulation",
  student_id: "original-student",
  student_number: "P8-001",
  home_block_id: "bsit-block",
  status: "CONFIRMED_SIMULATION",
  project_simulation_id: "existing-project-simulation",
};
const admissions = {
  id: "new-admissions-ledger",
  student_id: "real-admissions-student",
  studentNumber: "26-50604",
  studentName: "Manggi Miguelito Jr.",
  block_id: "bsit-block",
  blockCode: "BSIT-1A",
  term_id: "TERM-2026-1",
  programCode: "BSIT",
  source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION",
  simulation_only: true,
  is_official: false,
  status: "PROPOSED",
  subject_snapshot: [],
};

test("original project students and verified Admissions rows share one block without merging ledgers", () => {
  const rows = combineRegistrarProjectCases([project], [admissions]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].enrollment_source, PROJECT_COHORT_SOURCE);
  assert.equal(rows[0].project_simulation_id, project.id);
  assert.equal(rows[1].enrollment_source, ADMISSIONS_DEMO_SOURCE);
  assert.equal(rows[1].admissions_ledger_id, admissions.id);
  assert.equal(rows[1].project_simulation_id, null);
  assert.equal(rows[1].id, "admissions:new-admissions-ledger");
  assert.equal(rows[0].home_block_id, rows[1].home_block_id);
  assert.equal(rows[1].student_number, "26-50604");
  assert.equal(rows[1].status, "PROPOSED");
  assert.equal(registrarEnrollmentSourceLabel(rows[0]), "Original Project Cohort");
  assert.equal(registrarEnrollmentSourceLabel(rows[1]), "Admissions Demonstration");
  assert.equal(isAdmissionsDemoCase(rows[0]), false);
  assert.equal(isAdmissionsDemoCase(rows[1]), true);
});

test("invalid or official Admissions payloads never enter the project demonstration queue", () => {
  const rows = combineRegistrarProjectCases([project], [
    { ...admissions, is_official: true },
    { ...admissions, source_kind: "UNKNOWN" },
    { ...admissions, simulation_only: false },
    { ...admissions, block_id: null },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].student_id, "original-student");
});

test("returned and confirmed Admissions records retain their own history status", () => {
  const rows = combineRegistrarProjectCases([], [
    { ...admissions, id: "returned", status: "RETURNED", correction_reason: "Update the submitted classes." },
    { ...admissions, id: "confirmed", status: "CONFIRMED_SIMULATION",
      confirmed_at: "2026-10-30T08:00:00Z" },
  ]);
  assert.deepEqual(rows.map((row) => row.status), ["RETURNED", "CONFIRMED_SIMULATION"]);
  assert.ok(rows[1].confirmedAtLabel !== "Not available");
  assert.equal(rows[0].correction_reason, "Update the submitted classes.");
});
