import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  displayAcademicReference,
  displayCurriculumCode,
  displayCurriculumName,
  displaySubjectCode,
} from "./project-academic-display-aliases.mjs";

// The existing seeded curriculum manifest is the independent source of the
// 600 actual identities. No second hardcoded subject codebook is maintained.
const require = createRequire(import.meta.url);
const { makePlan } = require("../../../scripts/database-normalization/academic-phase8/curriculum-fictional-seed.cjs");

test("all 16 protected Phase 8 curricula have unambiguous readable code and name aliases", () => {
  const plan = makePlan();
  const aliases = plan.curricula.map((curriculum) => displayCurriculumCode(curriculum.code));
  assert.equal(plan.curricula.length, 16);
  assert.equal(new Set(aliases).size, plan.curricula.length);
  for (const curriculum of plan.curricula) {
    const code = displayCurriculumCode(curriculum.code);
    const name = displayCurriculumName(curriculum.code);
    assert.notEqual(code, curriculum.code, curriculum.code);
    assert.match(code, /-2026$/);
    assert.match(name, /Curriculum 2026$/);
    assert.match(curriculum.name, /Curriculum 2026 - Version 1$/);
    assert.match(curriculum.version_label, /^PHASE8_PROJECT_ONLY_FICTION_2026_V1 /);
    assert.notEqual(name, curriculum.name, curriculum.code);
    assert.ok(!/Version 1|\bV1\b/.test(name), curriculum.code);
    assert.equal(displayCurriculumName(curriculum.name), name);
    assert.equal(displayCurriculumName(curriculum.version_label), name);
    assert.equal(displayCurriculumName(curriculum), name);
    assert.equal(displayAcademicReference(curriculum.code), code);
    assert.equal(displayAcademicReference(curriculum.name), name);
  }
  assert.equal(displayCurriculumCode("P8F26-BSBAENT-V1"), "BSBA-ENT-2026");
  assert.equal(displayCurriculumCode("P8F26-BSEDMATH-V1"), "BSED-MATH-2026");
  assert.equal(displayCurriculumCode("P8F26-BSIT-V1"), "BSIT-2026");
  assert.equal(displayCurriculumName("Information Technology Curriculum 2026 - Version 1"),
    "Information Technology Curriculum 2026");
  assert.equal(displayCurriculumName("Accountancy Curriculum 2026 - Version 1"),
    "Accountancy Curriculum 2026");
  assert.equal(displayCurriculumName("Elementary Education Curriculum 2026 - Version 1"),
    "Elementary Education Curriculum 2026");
  assert.equal(displayCurriculumName("Business Administration - Entrepreneurship Curriculum 2026 - Version 1"),
    "Business Administration (Entrepreneurship) Curriculum 2026");
  assert.equal(displayCurriculumName("Secondary Education - Science Curriculum 2026 - Version 1"),
    "Secondary Education (Science) Curriculum 2026");
});

test("all 600 seeded subjects produce distinct aliases across 16 program variants and shared GE", () => {
  const plan = makePlan();
  const rawCodes = plan.subjects.map((subject) => subject.code);
  const displayCodes = rawCodes.map(displaySubjectCode);
  assert.equal(rawCodes.length, 600);
  assert.equal(new Set(rawCodes).size, rawCodes.length);
  assert.equal(new Set(displayCodes).size, rawCodes.length);
  assert.ok(displayCodes.every((code, index) => code !== rawCodes[index]));
  assert.ok(displayCodes.every((code) => /^[A-Z]+ [1-4]\d\d$/.test(code)));

  const displayByRaw = new Map(rawCodes.map((code, index) => [code, displayCodes[index]]));
  assert.equal(plan.placements.length, 960);
  for (const placement of plan.placements) {
    const alias = displayByRaw.get(placement.subject_code);
    assert.ok(alias, placement.subject_code);
    const match = /^([A-Z]+) ([1-4])(\d\d)$/.exec(alias);
    assert.ok(match, alias);
    assert.equal(Number(match[2]), placement.year_level_number, placement.subject_code);
    const semester = placement.semester === "First Semester" ? 1 : 2;
    assert.ok(Number(match[3]) >= (semester === 1 ? 1 : 51), placement.subject_code);
    assert.ok(Number(match[3]) <= (semester === 1 ? 5 : 55), placement.subject_code);
    assert.equal(displayAcademicReference(placement.subject_code), alias);
  }
  assert.deepEqual(plan.subjects.map((subject) => subject.code), rawCodes);
  assert.equal(displaySubjectCode("P8F26-BEED-T01-M3"), "BEED 103");
  assert.equal(displaySubjectCode("P8F26-GE-T01-1"), "GE 101");
  assert.equal(displaySubjectCode("P8F26-BSIT-T01-M1"), "IT 101");
  assert.equal(displaySubjectCode("P8F26-BSIT-T01-M2"), "IT 102");
  assert.equal(displaySubjectCode("P8F26-BSIT-T08-M5"), "IT 455");
});

test("legacy, absent, malformed, and nonstring values pass through without altering raw data", () => {
  const unchanged = [
    null, undefined, 0, 12, false, true, ["P8F26-BSIT-V1"],
    "IT101", "GE101", "BSIT-2024", "GE103",
    "P8F26-BSIT-V2", "P8F26-UNKNOWN-V1", "P8F26-IT-T01-M1",
    "P8F26-BSIT-T09-M1", "P8F26-BSIT-T01-M5",
    "P8F26-GE-T01-4", "P8F26-GE-T07-M1", "P8F26-BSIT-T01-M0",
    "P8F26-BSIT-T01-M01", " P8F26-BSIT-T01-M1 ",
    "Other Curriculum 2026 - Version 1",
  ];
  for (const value of unchanged) {
    assert.strictEqual(displaySubjectCode(value), value);
    assert.strictEqual(displayCurriculumCode(value), value);
    assert.strictEqual(displayAcademicReference(value), value);
    assert.strictEqual(displayCurriculumName(value), value);
  }
  const unknownCurriculum = { code: "BSIT-2024", name: "Institutional Curriculum" };
  assert.strictEqual(displayCurriculumName(unknownCurriculum), unknownCurriculum);
  const knownCurriculum = { curriculum_code: "P8F26-BSIT-V1", name: "some source name" };
  const original = { ...knownCurriculum };
  assert.equal(displayCurriculumName(knownCurriculum),
    "Information Technology Curriculum 2026");
  assert.deepEqual(knownCurriculum, original);
});
