import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { buildMockAcademicReferences } from "../src/features/academic/academic-reference.js";
import { buildBlockPlanningSeed } from "../src/features/block-planning/block-planning-seed.js";
import {
  assignBlockStudentsRecord, createBlockSectionRecord, finalizeBlockScheduleRecord,
  getBlockOccupancy, saveBlockMeetingRecord, transferBlockStudentRecord,
  updateBlockSectionRecord, validateBlockScheduleForPublish,
} from "../src/features/block-planning/block-planning-service.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(readFileSync(path.join(dir, "src/data/mock/catalog.json"), "utf8"));
const refs = buildMockAcademicReferences(source.subjects, source.programs);
const fixture = () => buildBlockPlanningSeed(refs, refs.curricula);
const draft = (data, code = "BSIT-1A") => data.blockSections.find((section) => section.termId === "2026-27-2" && section.code === code);
const professor = (data, section) => data.professors.find((item) => item.id === `PROF-${section.code}`);
const room = (data, section) => data.rooms.find((item) => item.id === `ROOM-${section.code}`);

test("new sections receive canonical codes, their curriculum subject classes, and unique term identities", () => {
  const data = fixture();
  const exemplar = draft(data);
  const values = { ...exemplar, letter: "C" };
  const result = createBlockSectionRecord(data, values);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.record.code, "BSIT-1C");
  assert.ok(result.next.subjectClasses.some((entry) => entry.sectionId === result.record.id));
  assert.equal(createBlockSectionRecord(data, { ...values, letter: "A" }).ok, false);
  assert.equal(createBlockSectionRecord(data, { ...values, capacity: 0 }).ok, false);
});

test("assignment, duplicate prevention, transfer, capacity, and Registrar confirmed lock", () => {
  let data = fixture();
  const from = draft(data, "BSIT-1A");
  const to = draft(data, "BSIT-1B");
  assert.ok(from && to);
  const student = data.students.find((item) => item.programCode === "BSIT" && item.yearLevel === "1st Year" && item.major === "");
  const assigned = assignBlockStudentsRecord(data, { sectionId: from.id, studentIds: [student.id] });
  assert.equal(assigned.ok, true, assigned.message);
  data = assigned.next;
  assert.equal(getBlockOccupancy(data, from.id).proposed, 1);
  assert.equal(assignBlockStudentsRecord(data, { sectionId: to.id, studentIds: [student.id] }).ok, false);
  const moved = transferBlockStudentRecord(data, { studentId: student.id, fromSectionId: from.id, toSectionId: to.id });
  assert.equal(moved.ok, true, moved.message);
  data = moved.next;
  assert.equal(getBlockOccupancy(data, from.id).proposed, 0);
  assert.equal(getBlockOccupancy(data, to.id).proposed, 1);
  assert.equal(updateBlockSectionRecord(data, to.id, { ...to, capacity: 0 }).ok, false);
  const confirmed = { ...data, assignments: data.assignments.map((item) => item.studentId === student.id && item.termId === to.termId ? { ...item, status: "CONFIRMED" } : item) };
  assert.equal(transferBlockStudentRecord(confirmed, { studentId: student.id, fromSectionId: to.id, toSectionId: from.id }).ok, false);
});

test("meeting scheduling checks conflicts and accepts adjacent classes and self-edit", () => {
  let data = fixture();
  const section = draft(data);
  const classes = data.subjectClasses.filter((item) => item.sectionId === section.id);
  const resources = { professorId: professor(data, section).id, roomId: room(data, section).id };
  const initial = saveBlockMeetingRecord(data, { subjectClassId: classes[0].id, day: "Monday", start: "08:00", end: "10:00", ...resources });
  assert.equal(initial.ok, true, initial.message);
  data = initial.next;
  const overlap = saveBlockMeetingRecord(data, { subjectClassId: classes[1].id, day: "Monday", start: "09:00", end: "11:00", ...resources });
  assert.equal(overlap.ok, false);
  const adjacent = saveBlockMeetingRecord(data, { subjectClassId: classes[1].id, day: "Monday", start: "10:00", end: "12:00", ...resources });
  assert.equal(adjacent.ok, true, adjacent.message);
  data = adjacent.next;
  const edit = saveBlockMeetingRecord(data, { id: initial.record.id, subjectClassId: classes[0].id, day: "Monday", start: "08:00", end: "10:00", ...resources });
  assert.equal(edit.ok, true, edit.message);
});

test("incomplete schedules remain draft; valid curriculum timetables can publish", () => {
  let data = fixture();
  const section = draft(data);
  const subjects = data.subjectClasses.filter((item) => item.sectionId === section.id);
  assert.ok(validateBlockScheduleForPublish(data, section.id).length > 0);
  assert.equal(finalizeBlockScheduleRecord(data, section.id).ok, false);
  for (let index = 0; index < subjects.length; index += 1) {
    const qualified = data.professors.find((entry) => entry.status === "ACTIVE" && entry.qualifiedSubjectCodes.includes(subjects[index].subjectCode));
    const suitable = data.rooms.find((entry) => entry.status === "AVAILABLE" && entry.capacity >= section.capacity && entry.types.includes(subjects[index].roomType));
    assert.ok(qualified && suitable, `missing resources for ${subjects[index].subjectCode}`);
    const result = saveBlockMeetingRecord(data, {
      subjectClassId: subjects[index].id, day: ["Mon", "Tue", "Wed", "Thu", "Fri"][index],
      start: "08:00", end: "10:00", professorId: qualified.id, roomId: suitable.id,
    });
    assert.equal(result.ok, true, result.message);
    data = result.next;
  }
  const published = finalizeBlockScheduleRecord(data, section.id);
  assert.equal(published.ok, true, published.message);
  assert.equal(published.record.status, "PUBLISHED");
  assert.equal(saveBlockMeetingRecord(published.next, { subjectClassId: subjects[0].id, day: "Mon", start: "08:00", end: "10:00", professorId: published.next.subjectClasses.find((entry) => entry.id === subjects[0].id).professorId, roomId: published.next.classMeetings.find((entry) => entry.subjectClassId === subjects[0].id).roomId }).ok, false);
});
