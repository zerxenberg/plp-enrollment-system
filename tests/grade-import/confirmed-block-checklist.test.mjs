import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmedGradeBlocks,
  evaluateBlockGradeChecklist,
} from "../../src/features/grade-import/grade-block-checklist.mjs";

function fixture() {
  const blocks = [{ id: "block-a", code: "BSIT-2A", term_id: "TERM-OLD", program_code: "BSIT", planning_status: "PUBLISHED" }];
  const links = [
    { block_id: "block-a", section_id: "section-1" },
    { block_id: "block-a", section_id: "section-2" },
  ];
  const enrollments = [
    { id: "enrollment-1", student_id: "student-a", term_id: "TERM-OLD", status: "CONFIRMED" },
    { id: "enrollment-2", student_id: "student-b", term_id: "TERM-OLD", status: "CONFIRMED" },
    { id: "project-enrollment", student_id: "student-project", term_id: "TERM-OLD", status: "CONFIRMED" },
    { id: "unconfirmed", student_id: "student-c", term_id: "TERM-OLD", status: "SUBMITTED" },
  ];
  const enrollmentSubjects = enrollments.flatMap((enrollment) =>
    ["IT101", "GE101"].map((subjectCode, index) => ({
      enrollment_id: enrollment.id,
      subject_code: subjectCode,
      section_id: index ? "section-2" : "section-1",
      registration_status: "CONFIRMED",
    })));
  const students = [
    { id: "student-a", student_number: "25-00001" },
    { id: "student-b", student_number: "25-00002" },
    { id: "student-project", student_number: "25-50001", record_kind: "PROJECT_ONLY" },
    { id: "student-c", student_number: "25-00003" },
  ];
  const subjects = [{ code: "IT101", name: "Programming" }, { code: "GE101", name: "Ethics" }];
  return {
    blocks, links, enrollments, enrollmentSubjects, students, subjects,
    terms: [{ id: "TERM-OLD", label: "Previous Term" }],
    projectStudentIds: ["student-project"],
  };
}

function batches(block) {
  return block.subjects.map((subject, index) => ({
    id: `batch-${index}`, term_id: block.termId, subject_code: subject.code,
    section_id: subject.expected[0].sectionId,
    status: "VALIDATED", source_checksum: `checksum-${index}`,
    verified_checksum_sha256: `checksum-${index}`, verified_at: "2026-10-01",
    row_count: subject.expected.length,
    rows: subject.expected.map((attempt, rowIndex) => ({
      student_id: attempt.studentId, subject_code: subject.code,
      section_id: attempt.sectionId,
      validation_status: "VALID",
      completion_status: rowIndex ? "FAILED" : "INCOMPLETE",
    })),
  }));
}

test("confirmed historical attempts create a dynamic block checklist while excluding fictional identities", () => {
  const blocks = buildConfirmedGradeBlocks(fixture());
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].termLabel, "Previous Term");
  assert.equal(blocks[0].subjects.length, 2);
  assert.equal(blocks[0].attempts.length, 4);
  assert.deepEqual(blocks[0].subjects.map((row) => row.expected.length), [2, 2]);
  assert.equal(blocks[0].attempts.some((row) => row.studentNumber === "25-50001"), false);
  assert.equal(blocks[0].attempts.some((row) => row.studentNumber === "25-00003"), false);
});

test("publication remains blocked when any subject is missing or its source unverified", () => {
  const block = buildConfirmedGradeBlocks(fixture())[0];
  const rows = batches(block);
  assert.equal(evaluateBlockGradeChecklist(block, rows.slice(0, 1)).allVerified, false);
  const unverified = rows.map((batch) => ({ ...batch, verified_at: null }));
  assert.equal(evaluateBlockGradeChecklist(block, unverified).allVerified, false);
  assert.equal(evaluateBlockGradeChecklist(block, rows).allVerified, true);
});

test("failed and incomplete grades are still valid entries toward whole block readiness", () => {
  const block = buildConfirmedGradeBlocks(fixture())[0];
  const readiness = evaluateBlockGradeChecklist(block, batches(block));
  assert.equal(readiness.allVerified, true);
  assert.equal(readiness.missing, 0);
  assert.equal(readiness.batchIds.length, 2);
  assert.equal(readiness.subjects.every((entry) => entry.status === "VERIFIED"), true);
});

test("cross-block batch rows and duplicate student attempts fail the collective gate", () => {
  const block = buildConfirmedGradeBlocks(fixture())[0];
  const valid = batches(block);
  const mixed = structuredClone(valid);
  mixed[0].rows.push({ student_id: "other-student", subject_code: mixed[0].subject_code, validation_status: "VALID" });
  mixed[0].row_count++;
  assert.equal(evaluateBlockGradeChecklist(block, mixed).allVerified, false);
  const duplicate = structuredClone(valid);
  duplicate.push({ ...duplicate[0], id: "duplicate-import" });
  assert.equal(evaluateBlockGradeChecklist(block, duplicate).allVerified, false);
  const wrongSection = structuredClone(valid);
  wrongSection[0].section_id = "another-offering";
  assert.equal(evaluateBlockGradeChecklist(block, wrongSection).allVerified, false);
});

test("no confirmed block is inferred from draft or split section assignments", () => {
  const data = fixture();
  data.links.pop();
  assert.deepEqual(buildConfirmedGradeBlocks(data), []);
  const draft = fixture();
  draft.blocks[0].planning_status = "DRAFT";
  assert.deepEqual(buildConfirmedGradeBlocks(draft), []);
});

test("project record kind remains excluded even when placement mapping is missing", () => {
  const data = fixture();
  data.projectStudentIds = [];
  const blocks = buildConfirmedGradeBlocks(data);
  assert.equal(blocks[0].attempts.some((item) => item.studentId === "student-project"), false);
});
