import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { buildMockAcademicReferences } from "../src/features/academic/academic-reference.js";
import { buildBlockPlanningSeed } from "../src/features/block-planning/block-planning-seed.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const original = JSON.parse(readFileSync(path.join(root, "src/data/mock/catalog.json"), "utf8"));
const references = buildMockAcademicReferences(original.subjects, original.programs);
const planning = buildBlockPlanningSeed(references, references.curricula);
const unique = (records, label) => assert.equal(new Set(records.map((record) => record.id)).size, records.length, `${label} duplicate id`);
const byId = (records) => new Map(records.map((record) => [record.id, record]));

test("seven colleges and all configured curriculum tracks have eight term/year blocks", () => {
  assert.equal(planning.colleges.length, 7);
  const trackKeys = new Set(planning.curricula.map((entry) => `${entry.program}|${entry.major || ""}`));
  assert.ok(trackKeys.size >= 16);
  planning.curricula.forEach((curriculum) => {
    const sections = planning.blockSections.filter((section) => section.curriculumId === curriculum.id);
    for (const term of planning.terms) {
      for (let year = 1; year <= 4; year += 1) {
        assert.ok(sections.some((section) => section.termId === term.id && section.yearLevel.startsWith(String(year))), `${curriculum.program} ${curriculum.major} ${term.id} year ${year}`);
      }
    }
  });
});

test("all planning IDs and foreign key references are valid", () => {
  for (const [key, records] of Object.entries(planning)) {
    if (Array.isArray(records) && !["programs", "subjects"].includes(key)) unique(records, key);
  }
  const sections = byId(planning.blockSections);
  const students = byId(planning.students);
  const classes = byId(planning.subjectClasses);
  const professors = byId(planning.professors);
  const rooms = byId(planning.rooms);
  const terms = byId(planning.terms);
  const subjects = new Set(planning.subjects.map((subject) => subject.code));
  planning.assignments.forEach((entry) => {
    assert.ok(students.has(entry.studentId));
    assert.ok(sections.has(entry.sectionId));
    assert.equal(entry.termId, sections.get(entry.sectionId).termId);
  });
  planning.subjectClasses.forEach((entry) => {
    assert.ok(sections.has(entry.sectionId));
    assert.ok(terms.has(entry.termId));
    assert.ok(subjects.has(entry.subjectCode), entry.subjectCode);
    if (entry.professorId) assert.ok(professors.has(entry.professorId));
  });
  planning.classMeetings.forEach((entry) => {
    assert.ok(classes.has(entry.subjectClassId));
    assert.ok(rooms.has(entry.roomId));
    assert.ok(entry.start < entry.end);
  });
});

test("occupancy metrics can be derived entirely from proposed student assignments", () => {
  const memberships = new Map();
  for (const assignment of planning.assignments) memberships.set(assignment.sectionId, (memberships.get(assignment.sectionId) || 0) + 1);
  const available = planning.blockSections.filter((section) => section.termId === planning.terms[0].id);
  const counts = available.map((section) => memberships.get(section.id) || 0);
  assert.ok(available.some((section) => (memberships.get(section.id) || 0) === section.capacity), "full representative block");
  assert.ok(available.some((section) => section.capacity - (memberships.get(section.id) || 0) <= 5 && (memberships.get(section.id) || 0) < section.capacity), "near capacity representative block");
  assert.ok(available.some((section) => section.capacity - (memberships.get(section.id) || 0) > 5), "open representative block");
  assert.ok(counts.every((count, index) => count <= available[index].capacity), "no seeded overcapacity");
});

test("published schedules contain meetings with no shared room, professor or block overlap", () => {
  const classes = byId(planning.subjectClasses);
  const sections = byId(planning.blockSections);
  const meetings = planning.classMeetings.map((meeting) => ({ ...meeting, class: classes.get(meeting.subjectClassId) }));
  const currentTerm = planning.terms.find((term) => term.status === "CURRENT");
  const published = planning.blockSections.filter((section) => section.termId === currentTerm.id && section.status === "PUBLISHED");
  assert.ok(published.length > 0);
  published.forEach((section) => {
    const subjectClasses = planning.subjectClasses.filter((entry) => entry.sectionId === section.id);
    assert.ok(subjectClasses.length >= 1, section.code);
    subjectClasses.forEach((entry) => {
      assert.ok(entry.professorId, entry.id);
      assert.ok(meetings.some((meeting) => meeting.subjectClassId === entry.id), entry.id);
    });
  });
  for (let index = 0; index < meetings.length; index += 1) {
    const a = meetings[index];
    const aSection = sections.get(a.class.sectionId);
    for (let other = index + 1; other < meetings.length; other += 1) {
      const b = meetings[other];
      const bSection = sections.get(b.class.sectionId);
      if (aSection.termId !== bSection.termId || a.day !== b.day || !(a.start < b.end && b.start < a.end)) continue;
      assert.notEqual(a.roomId, b.roomId, `room conflict ${a.id} ${b.id}`);
      assert.notEqual(a.class.professorId, b.class.professorId, `professor conflict ${a.id} ${b.id}`);
      assert.notEqual(a.class.sectionId, b.class.sectionId, `block conflict ${a.id} ${b.id}`);
    }
  }
});
