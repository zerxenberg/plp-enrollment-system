import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildMockAcademicReferences } from "../academic/academic-reference.js";
import { buildBlockPlanningSeed } from "./block-planning-seed.js";
import {
  assignBlockStudentsRecord, getBlockOccupancy, saveBlockMeetingRecord,
  transferBlockStudentRecord, validateBlockScheduleForPublish,
} from "./block-planning-service.js";

function makeData() {
  const source = JSON.parse(readFileSync(new URL("../../data/mock/catalog.json", import.meta.url), "utf8"));
  const references = buildMockAcademicReferences(source.subjects, source.programs);
  return buildBlockPlanningSeed(references, references.curricula);
}

test("all 16 curriculum tracks, four year levels and both semesters have coherent block plans", () => {
  const data = makeData();
  assert.equal(data.colleges.length, 7);
  assert.equal(data.curricula.length, 16);
  const yearsAndTerms = new Set(data.blockSections.map((section) =>
    `${section.curriculumId}|${section.yearLevel}|${section.termId}`));
  assert.equal(yearsAndTerms.size, 16 * 4 * 2);
  const uniqueSectionIds = new Set(data.blockSections.map((section) => section.id));
  assert.equal(uniqueSectionIds.size, data.blockSections.length);
  assert.ok(data.students.some((student) => student.classification === "IRREGULAR" &&
    student.restrictedFutureSubjectCodes.length > 0));
  assert.ok(data.classMeetings.some((meeting) =>
    data.classMeetings.filter((other) => other.subjectClassId === meeting.subjectClassId).length === 3));
});

test("every published academic timetable is complete and conflict free across all colleges", () => {
  const data = makeData();
  const published = data.blockSections.filter((section) => section.status === "PUBLISHED");
  assert.ok(published.length >= 16 * 4);
  for (const section of published) {
    assert.deepEqual(validateBlockScheduleForPublish(data, section.id), [], section.code);
    const occupancy = getBlockOccupancy(data, section.id);
    assert.equal(occupancy.confirmed, 0);
    assert.ok(occupancy.proposed <= occupancy.capacity);
  }
  const classifications = new Set(published.map((section) => getBlockOccupancy(data, section.id).status));
  assert.deepEqual([...classifications].sort(), ["FULL", "NEAR_FULL", "OPEN"]);
});

test("multiple meetings are revalidated when changing the whole class professor", () => {
  let data = makeData();
  const firstTerm = data.blockSections.find((section) => section.code === "BSIT-2A" &&
    section.termId === "2026-27-1");
  const nextTerm = data.blockSections.find((section) => section.code === "BSIT-2A" &&
    section.termId === "2026-27-2");
  // Published plans are immutable and future plans start with incomplete drafts.
  const currentClass = data.subjectClasses.find((subjectClass) => subjectClass.sectionId === firstTerm.id);
  const currentMeeting = data.classMeetings.find((item) => item.subjectClassId === currentClass.id);
  assert.equal(saveBlockMeetingRecord(data, { ...currentMeeting }).ok, false);

  const futureClass = data.subjectClasses.find((subjectClass) => subjectClass.sectionId === nextTerm.id);
  const qualified = data.professors.find((professor) =>
    professor.qualifiedSubjectCodes.includes(futureClass.subjectCode));
  const room = data.rooms.find((item) => item.capacity >= nextTerm.capacity &&
    item.types.includes(futureClass.roomType));
  assert.ok(qualified && room);
  const saved = saveBlockMeetingRecord(data, {
    subjectClassId: futureClass.id, day: "Monday", start: "08:00", end: "10:00",
    professorId: qualified.id, roomId: room.id,
  });
  assert.equal(saved.ok, true, saved.message);
  data = saved.next;
  const second = saveBlockMeetingRecord(data, {
    subjectClassId: futureClass.id, day: "Wednesday", start: "10:00", end: "11:00",
    professorId: qualified.id, roomId: room.id,
  });
  assert.equal(second.ok, true, second.message);
  data = second.next;
  const otherSection = data.blockSections.find((section) => section.termId === nextTerm.termId &&
    section.code === "BSIT-2B");
  const otherClass = data.subjectClasses.find((item) => item.sectionId === otherSection.id &&
    item.subjectCode === futureClass.subjectCode);
  const otherProfessor = data.professors.find((item) => item.id === "PROF-BSIT-2B");
  const otherRoom = data.rooms.find((item) => item.id === "ROOM-BSIT-2B");
  assert.ok(otherClass && otherProfessor.qualifiedSubjectCodes.includes(otherClass.subjectCode));
  const otherMeeting = saveBlockMeetingRecord(data, {
    subjectClassId: otherClass.id, day: "Wednesday", start: "10:00", end: "11:00",
    professorId: otherProfessor.id, roomId: otherRoom.id,
  });
  assert.equal(otherMeeting.ok, true, otherMeeting.message);
  // Monday itself is conflict free, but assigning this professor would
  // silently break Wednesday's retained class meeting without revalidation.
  const illegalReassignment = saveBlockMeetingRecord(otherMeeting.next, {
    ...saved.record, professorId: otherProfessor.id,
  });
  assert.equal(illegalReassignment.ok, false);
  assert.match(illegalReassignment.message, /retained meeting/i);
});

test("proposed assignments preserve audit history and cannot displace confirmed records", () => {
  let data = makeData();
  const source = data.blockSections.find((section) => section.code === "BSIT-1A" && section.termId === "2026-27-2");
  const target = data.blockSections.find((section) => section.code === "BSIT-1B" && section.termId === "2026-27-2");
  const candidate = data.students.find((student) => student.programCode === "BSIT" && student.yearLevel === "1st Year");
  const assigned = assignBlockStudentsRecord(data, { sectionId: source.id, studentIds: [candidate.id] });
  assert.equal(assigned.ok, true, assigned.message);
  assert.equal(assigned.next.history[0].sectionId, source.id);
  assert.equal(assigned.record[0].changes[0].toSectionId, source.id);
  data = assigned.next;
  const transfer = transferBlockStudentRecord(data, {
    studentId: candidate.id, fromSectionId: source.id, toSectionId: target.id,
  });
  assert.equal(transfer.ok, true, transfer.message);
  assert.equal(transfer.record.changes.length, 2);
  assert.equal(transfer.next.history[0].termId, source.termId);
  const official = {
    ...transfer.next,
    assignments: transfer.next.assignments.map((item) => item.id === transfer.record.id ?
      { ...item, status: "CONFIRMED" } : item),
  };
  assert.equal(transferBlockStudentRecord(official, {
    studentId: candidate.id, fromSectionId: target.id, toSectionId: source.id,
  }).ok, false);
});
