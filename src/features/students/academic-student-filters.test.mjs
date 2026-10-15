import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ALL_ACADEMIC_FILTERS,
  filterAcademicRecords,
  getAcademicFilterOptions,
  updateAcademicFilters,
} from "./academic-student-filters.js";
import { DEPARTMENTS, PROGRAMS } from "../academic/academic-reference.js";

const fixture = JSON.parse(readFileSync(new URL("../../data/mock/registrar.json", import.meta.url), "utf8"));

test("all academic filters retain each original student and enrollment record", () => {
  const students = filterAcademicRecords(fixture.students, ALL_ACADEMIC_FILTERS, fixture.enrollments);
  const enrollments = filterAcademicRecords(fixture.enrollments, ALL_ACADEMIC_FILTERS);
  assert.equal(students.length, fixture.students.length);
  assert.equal(enrollments.length, fixture.enrollments.length);
  assert.ok(students.every((record, index) => record === fixture.students[index]));
  assert.ok(enrollments.every((record, index) => record === fixture.enrollments[index]));
  const noTerm = { studentNumber: "N-1", fullName: "Unassigned Student", program: "BSIT" };
  assert.strictEqual(filterAcademicRecords([noTerm], ALL_ACADEMIC_FILTERS)[0], noTerm);
});

test("section and historical term must belong to the same student's enrollment", () => {
  const student = fixture.students.find((item) => item.studentNumber === "2026-01896");
  const history = [
    { studentNumber: student.studentNumber, program: student.program, term: "1st Sem 2025", subjects: [{ section: "BSIT-2A" }] },
    { studentNumber: student.studentNumber, program: student.program, term: "1st Sem 2026", subjects: [{ section: "BSIT-3A" }] },
  ];
  const wrongPair = { ...ALL_ACADEMIC_FILTERS, academicYear: "2025", section: "BSIT-3A" };
  const correctPair = { ...ALL_ACADEMIC_FILTERS, academicYear: "2025", section: "BSIT-2A" };
  assert.equal(filterAcademicRecords([student], wrongPair, history).length, 0);
  assert.equal(filterAcademicRecords([student], correctPair, history).length, 1);
});

test("the two COE departments retain distinct IDs and cascaded programs", () => {
  const education = { ...ALL_ACADEMIC_FILTERS, department: "COE_EDUCATION" };
  const engineering = { ...ALL_ACADEMIC_FILTERS, department: "COE_ENGINEERING" };
  const educationPrograms = getAcademicFilterOptions(fixture.students, education, fixture.enrollments, PROGRAMS, DEPARTMENTS).program.map((item) => item.value);
  const engineeringPrograms = getAcademicFilterOptions(fixture.students, engineering, fixture.enrollments, PROGRAMS, DEPARTMENTS).program.map((item) => item.value);
  assert.ok(educationPrograms.includes("BSED"));
  assert.ok(!educationPrograms.includes("BSECE"));
  assert.ok(engineeringPrograms.includes("BSECE"));
  assert.ok(!engineeringPrograms.includes("BSED"));
});

test("changing an upstream filter clears every dependent selection", () => {
  const current = { department: "CCS", program: "BSIT", academicYear: "2026", semester: "First Semester", yearLevel: "3rd Year", section: "BSIT-3A" };
  const next = updateAcademicFilters(current, "program", "BSCS");
  assert.equal(next.department, "CCS");
  assert.equal(next.program, "BSCS");
  assert.equal(next.academicYear, "ALL");
  assert.equal(next.semester, "ALL");
  assert.equal(next.yearLevel, "ALL");
  assert.equal(next.section, "ALL");
});

test("unknown legacy demo program codes remain visible under All Programs", () => {
  const options = getAcademicFilterOptions(fixture.students, ALL_ACADEMIC_FILTERS, fixture.enrollments, PROGRAMS, DEPARTMENTS);
  assert.ok(options.program.some((option) => option.value === "BSP"));
  assert.equal(filterAcademicRecords(fixture.students, { ...ALL_ACADEMIC_FILTERS, program: "BSP" }, fixture.enrollments).length, 1);
});
