import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMockAcademicReferences,
  getAcademicSubjectOptions,
  getPrerequisiteCandidates,
  getCurriculumLoadAdvisories,
  validateCurriculumActivation,
  validateCurriculumRecord,
  validatePrerequisiteGraph,
  summarizeCurriculum,
} from "./academic-reference.js";

const catalog = buildMockAcademicReferences();

test("the academic mock catalog has distinct department IDs and complete curriculum tracks", () => {
  assert.equal(catalog.departments.length, 7);
  assert.equal(catalog.programs.length, 11);
  assert.equal(catalog.curricula.length, 16);
  assert.equal(new Set(catalog.programs.map((program) => program.id)).size, 11);
  assert.deepEqual(catalog.departments.filter((department) => department.code === "COE").map((item) => item.id), [
    "COE_EDUCATION", "COE_ENGINEERING",
  ]);
  assert.equal(catalog.curricula.every((curriculum) =>
    curriculum.semesters.length === 8 &&
    curriculum.semesters.every((semester) =>
      semester.subjects.length >= 5 && semester.subjects.length <= 7)), true);
  assert.equal(catalog.curricula.every((curriculum) => validateCurriculumActivation(curriculum, catalog).length === 0), true);
  assert.equal(new Set(catalog.curricula.map((curriculum) => curriculum.id)).size, 16);
  assert.equal(new Set(catalog.subjects.map((subject) => subject.code)).size, catalog.subjects.length);
  assert.equal(new Set(catalog.subjects.map((subject) => subject.name.toLowerCase())).size, catalog.subjects.length);
  assert.equal(catalog.curricula.every((curriculum) => !getCurriculumLoadAdvisories(curriculum).length), true);
  const marketing = catalog.curricula.find((curriculum) => curriculum.program === "BSBA" && curriculum.major === "Marketing Management");
  const entrepreneurship = catalog.curricula.find((curriculum) => curriculum.program === "BSBA" && curriculum.major === "Entrepreneurship");
  assert.ok(marketing.assignments.some((item) => item.subjectCode === entrepreneurship.assignments[16].subjectCode));
});

test("specialization and department filtering uses stable program identities", () => {
  const program = catalog.programs.find((entry) => entry.code === "BSED");
  const math = getAcademicSubjectOptions(catalog, {
    departmentId: "COE_EDUCATION",
    programId: program.id,
    major: "Mathematics",
    yearLevel: "2nd Year",
    semester: "First Semester",
  });
  assert.ok(math.some((subject) => subject.major === "Mathematics"));
  assert.equal(math.some((subject) => subject.major === "English"), false);
  assert.deepEqual(getAcademicSubjectOptions(catalog, {
    departmentId: "COE_ENGINEERING", programId: program.id,
  }), []);
});

test("activation catches missing assignments and subjects from a different specialization", () => {
  const curriculum = catalog.curricula.find((item) => item.program === "BSED" && item.major === "Mathematics");
  const incomplete = { ...curriculum, assignments: curriculum.assignments.filter((item) =>
    !(item.yearLevel === "1st Year" && item.semester === "First Semester")) };
  assert.ok(validateCurriculumActivation(incomplete, catalog).some((issue) =>
    issue.includes("must include at least one")));
  const smallButValid = { ...curriculum, assignments: curriculum.assignments.filter((item) =>
    item.yearLevel !== "4th Year" || item.semester !== "Second Semester" || item.subjectCode === curriculum.assignments[15].subjectCode) };
  assert.deepEqual(validateCurriculumActivation(smallButValid, catalog), []);
  assert.ok(getCurriculumLoadAdvisories(smallButValid).length);
  const english = catalog.curricula.find((item) => item.program === "BSED" && item.major === "English");
  const other = english.assignments.find((assignment) => assignment.subjectCode.startsWith("EEN"));
  const swapped = {
    ...curriculum,
    assignments: curriculum.assignments.map((entry) =>
      entry.subjectCode.startsWith("EMA") ? { ...entry, subjectCode: other.subjectCode } : entry),
  };
  assert.ok(validateCurriculumActivation(swapped, catalog).some((issue) =>
    issue.includes("different specialization")));
});

test("prerequisite cycles and tuition totals are validated", () => {
  assert.ok(validatePrerequisiteGraph(catalog.subjects, "GE101", ["GE101"]));
  const first = catalog.curricula[0];
  const totals = summarizeCurriculum(first.assignments, catalog.subjects);
  assert.equal(totals.total.subjects, 40);
  assert.ok(totals.total.units > 0);
  assert.ok(totals.total.tuition > 0);
});

test("estimated tuition respects curriculum unit and rate overrides without double counting", () => {
  const assignments = [
    { subjectCode: "IT001", yearLevel: "1st Year", semester: "First Semester",
      unitsOverride: 2, feePerUnit: 125 },
    { subjectCode: "IT002", yearLevel: "1st Year", semester: "Second Semester",
      feePerUnit: 100 },
  ];
  const subjects = [
    { code: "IT001", units: 3, feePerUnit: 100 },
    { code: "IT002", units: 3, feePerUnit: 100 },
  ];
  const summary = summarizeCurriculum(assignments, subjects, "1st Year", "First Semester");
  assert.equal(summary.selected.units, 2);
  assert.equal(summary.selected.tuition, 250);
  assert.equal(summary.total.units, 5);
  assert.equal(summary.total.tuition, 550);
});

test("drafts may be empty, while rules require earlier assigned prerequisites", () => {
  const original = catalog.curricula.find((item) => item.program === "BSIT");
  assert.deepEqual(validateCurriculumRecord({ ...original, status: "Draft", assignments: [] }, catalog), []);
  assert.ok(validateCurriculumActivation({ ...original, status: "Draft", assignments: [] }, catalog).length);
  const first = original.assignments.find((item) => item.subjectCode === "IT001");
  const later = original.assignments.find((item) => item.subjectCode === "IT003");
  const reversed = {
    ...original,
    assignments: original.assignments.map((item) =>
      item.subjectCode === first.subjectCode
        ? { ...item, prerequisites: [later.subjectCode] }
        : item),
  };
  assert.ok(validateCurriculumRecord(reversed, catalog).some((error) => error.includes("earlier semester")));
  const cyclic = {
    ...original,
    assignments: original.assignments.map((item) => item.subjectCode === first.subjectCode
      ? { ...item, prerequisites: [later.subjectCode] }
      : item),
  };
  assert.ok(validateCurriculumRecord(cyclic, catalog).some((error) => error.includes("circular")));
});

test("options include shared GE via program code fallback and prerequisites filter prior terms", () => {
  const program = catalog.programs.find((item) => item.code === "BSIT");
  const noProgramIds = {
    ...catalog,
    subjects: catalog.subjects.map((subject) => subject.code === "GE101"
      ? { ...subject, programIds: undefined } : subject),
  };
  assert.ok(getAcademicSubjectOptions(noProgramIds, {
    departmentId: program.departmentId, programId: program.id,
    yearLevel: "1st Year", semester: "First Semester",
  }).some((subject) => subject.code === "GE101"));
  const target = catalog.subjects.find((item) => item.code === "IT003");
  const options = getPrerequisiteCandidates(catalog, {
    code: target.code, department: target.department, programs: target.programs,
    major: target.major, yearLevel: target.yearLevel, semester: target.semester,
    prerequisites: target.prerequisites,
  });
  assert.ok(options.some((subject) => subject.code === "IT001"));
  assert.equal(options.some((subject) => subject.code === "IT004"), false);
  assert.equal(options.some((subject) => subject.code === "BAH001"), false);
  const unsavedOptions = getPrerequisiteCandidates(catalog, {
    code: "IT999", department: "CCS", programs: ["BSIT"], major: "",
    yearLevel: "2nd Year", semester: "First Semester",
  });
  assert.ok(unsavedOptions.some((subject) => subject.code === "IT001"));
  assert.equal(unsavedOptions.some((subject) => subject.code === "IT007"), false);
  assert.deepEqual(getPrerequisiteCandidates(catalog, {
    code: "IT999", department: "COE_ENGINEERING", programs: ["BSIT"],
    yearLevel: "2nd Year", semester: "First Semester",
  }), []);
});

test("original seeded Student catalog remains valid and its GE master is shared", () => {
  const source = JSON.parse(readFileSync(new URL("../../data/mock/catalog.json", import.meta.url), "utf8"));
  const seeded = buildMockAcademicReferences(source.subjects, source.programs);
  const accounting = seeded.programs.find((program) => program.code === "BSA");
  assert.ok(getAcademicSubjectOptions(seeded, {
    departmentId: accounting.departmentId,
    programId: accounting.id,
    yearLevel: "1st Year",
    semester: "First Semester",
  }).some((subject) => subject.code === "GE101"));
  assert.equal(seeded.subjects.filter((subject) => subject.code === "GE101").length, 1);
  for (const curriculum of seeded.curricula) {
    assert.deepEqual(validateCurriculumActivation(curriculum, seeded), [], curriculum.version);
  }
});

test("same-named subjects in different colleges retain separate academic masters", () => {
  const custom = [
    { code: "ENG111", name: "Research Methods", department: "COE_ENGINEERING", program: "BSECE", programs: ["BSECE"], units: 3 },
    { code: "PSY111", name: "Research Methods", department: "CAS", program: "BSP", programs: ["BSP"], units: 3 },
  ];
  const scoped = buildMockAcademicReferences(custom);
  assert.ok(scoped.subjects.some((subject) => subject.code === "ENG111" && subject.departmentId === "COE_ENGINEERING"));
  assert.ok(scoped.subjects.some((subject) => subject.code === "PSY111" && subject.departmentId === "CAS"));
});
