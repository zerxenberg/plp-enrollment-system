import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const importServer = readFileSync(new URL("./registrar-project-grade-actions.js", import.meta.url), "utf8");
const importScreen = readFileSync(new URL("./RegistrarProjectGradeWorkspace.js", import.meta.url), "utf8");
const academicServer = readFileSync(new URL("../students/student-academic-server.js", import.meta.url), "utf8");
const academicScreen = readFileSync(new URL("../../components/student/StudentAcademicRecords.js", import.meta.url), "utf8");

test("Registrar only uses protected cohort-scoped mappings and synthetic faculty", () => {
  assert.match(importServer, /requireRole/);
  assert.match(importServer, /\.from\("project_historical_subject_instructors"\)/);
  for (const scope of ["project_cohort_id", "target_block_id", "prior_term_id", "curriculum_code", "previous_block_code"]) {
    assert.ok(importServer.includes(`.eq("${scope}"`), `historical mapping scopes ${scope}`);
  }
  assert.match(importServer, /item\.is_synthetic_demo === true/);
  assert.match(importServer, /PROJECT_FICTIONAL_ASSIGNMENT/);
  assert.match(importServer, /verified_institutionally !== false/);
});

test("Registrar shows fictional professor in upload, review and publication stages", () => {
  assert.match(importScreen, /Previous Semester Professor \(Fictional Demonstration\)/);
  assert.match(importScreen, /subject\.previousProfessor\?\.name \|\| "Not assigned"/);
  assert.doesNotMatch(importScreen, /For Excel column previous_subject_professor, use this exact name/);
  assert.match(importScreen, /Assigned Fictional Professor/);
  assert.match(importScreen, /Fictional Demo Professor/);
  assert.match(importScreen, /Assigned Professor \(Fictional Demo\)/);
  assert.match(importScreen, /entry\.code === selectedBatch\.subject_code\)\?\.previousProfessor\?\.name/);
  assert.match(importScreen, /Original workbook value: \$\{item\.original_row\?\.previous_subject_professor/);
  assert.doesNotMatch(importScreen, /label: "Original Workbook Professor"/,
    "display must not mislabel the assigned fictional professor as the workbook's original value");
});

test("Student reads fictional attribution only after accepted grade publication", () => {
  assert.match(academicServer, /if \(!acceptedResults\.length/);
  assert.match(academicServer, /loadAcceptedProjectGradeResults\(/);
  assert.match(academicServer, /projectProfessors = await loadProjectHistoricalProfessors/);
  assert.match(academicServer, /verified_institutionally === false/);
  assert.match(academicServer, /item\.is_synthetic_demo === true/);
  assert.match(academicScreen, /Previous Professor \(Fictional Demo\)/);
  assert.match(academicScreen, /Accepted project result/);
  assert.match(academicScreen, /not verified university faculty/);
});
