import assert from "node:assert/strict";
import test from "node:test";
import { buildMockAcademicReferences } from "../src/features/academic/academic-reference.js";
import { withRepresentativeDemoStudents } from "../src/features/students/mock-student-fixtures.js";

const catalog = buildMockAcademicReferences();
const initial = {
  students: [{ studentNumber: "ORIGINAL", program: "BSIT", studentStatus: "ACTIVE" }],
  enrollments: [{ reference: "ORIGINAL-ENROLLMENT", studentNumber: "ORIGINAL", program: "BSIT" }],
};
const expanded = withRepresentativeDemoStudents(initial, catalog.curricula, catalog.subjects);

test("keeps existing student identities and creates realistic demo filter coverage", () => {
  assert.equal(expanded.students.length, 49);
  assert.equal(expanded.enrollments.length, 97);
  assert.deepEqual(expanded.students[0], initial.students[0]);
  assert.deepEqual(expanded.enrollments[0], initial.enrollments[0]);
  assert.equal(new Set(expanded.students.map((record) => record.studentNumber)).size, expanded.students.length);
  assert.equal(new Set(expanded.enrollments.map((record) => record.reference)).size, expanded.enrollments.length);
  assert.equal(new Set(expanded.students.slice(1).map((record) => record.department)).size, 7);
  assert.equal(new Set(expanded.students.slice(1).map((record) => `${record.program}|${record.major}`)).size, 16);
});

test("each demo student has separate term and section snapshots", () => {
  const students = expanded.students.slice(1);
  for (const student of students) {
    const entries = expanded.enrollments.filter((entry) => entry.studentNumber === student.studentNumber);
    assert.equal(entries.length, 2, student.studentNumber);
    assert.notEqual(entries[0].reference, entries[1].reference);
    assert.notEqual(entries[0].subjects[0].section, entries[1].subjects[0].section);
    assert.ok(entries[0].subjects.length > 0);
    assert.ok(entries[1].subjects.length > 0);
    assert.ok(entries.every((entry) => entry.subjects.every((subject) => subject.section)));
    assert.equal(student.isSyntheticDemo, true);
  }
});
