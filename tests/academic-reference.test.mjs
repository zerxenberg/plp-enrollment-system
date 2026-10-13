import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMockAcademicReferences, validateCurriculumRecord, validatePrerequisiteGraph,
  summarizeCurriculum, DEPARTMENTS, PROGRAMS,
} from "../src/features/academic/academic-reference.js";

const catalog = buildMockAcademicReferences();

test("the approved college and degree reference list is complete", () => {
  assert.equal(DEPARTMENTS.length, 7);
  assert.equal(PROGRAMS.length, 11);
  assert.notEqual(DEPARTMENTS.find((item) => item.name === "College of Education")?.id,
    DEPARTMENTS.find((item) => item.name === "College of Engineering")?.id);
  assert.deepEqual(PROGRAMS.find((item) => item.code === "BSBA").majors,
    ["Marketing Management", "Entrepreneurship", "Human Resource Management"]);
  assert.deepEqual(PROGRAMS.find((item) => item.code === "BSED").majors,
    ["English", "Filipino", "Mathematics", "Science"]);
});

test("all 16 illustrative curriculum tracks cover eight semesters with five subjects each", () => {
  assert.equal(catalog.curricula.length, 16);
  const combinations = new Set();
  for (const curriculum of catalog.curricula) {
    assert.equal(curriculum.assignments.length, 40, curriculum.version);
    assert.deepEqual(validateCurriculumRecord(curriculum, catalog), [], curriculum.version);
    for (let year = 1; year <= 4; year += 1) {
      for (const semester of ["First Semester", "Second Semester"]) {
        assert.equal(curriculum.assignments.filter((item) => item.yearLevel === ["1st Year", "2nd Year", "3rd Year", "4th Year"][year - 1] && item.semester === semester).length, 5, curriculum.version);
      }
    }
    combinations.add(`${curriculum.program}|${curriculum.major}`);
  }
  assert.equal(combinations.size, 16);
});

test("curriculum totals use snapshot override and calculate without mutating source", () => {
  const curriculum = structuredClone(catalog.curricula[0]);
  const original = structuredClone(curriculum.assignments);
  const totals = summarizeCurriculum(curriculum.assignments, catalog.subjects, "1st Year", "First Semester");
  assert.equal(totals.selected.subjects, 5);
  assert.ok(totals.total.units > totals.selected.units);
  assert.equal(totals.selected.tuition, totals.selected.units * 100);
  curriculum.assignments[0].feePerUnit = 125;
  assert.ok(summarizeCurriculum(curriculum.assignments, catalog.subjects).total.tuition > totals.total.tuition);
  assert.equal(original[0].feePerUnit, 100);
});

test("prerequisite checks reject self, missing, duplicate and cyclic relationships", () => {
  const subjects = [
    { code: "A", prerequisites: [] },
    { code: "B", prerequisites: ["A"] },
    { code: "C", prerequisites: ["B"] },
  ];
  assert.match(validatePrerequisiteGraph(subjects, "A", ["A"]), /itself/i);
  assert.match(validatePrerequisiteGraph(subjects, "A", ["Z"]), /does not exist/i);
  assert.match(validatePrerequisiteGraph(subjects, "C", ["A", "A"]), /Duplicate/i);
  assert.match(validatePrerequisiteGraph(subjects, "A", ["C"]), /circular/i);
  assert.equal(validatePrerequisiteGraph(subjects, "C", ["B"]), null);
});
