import assert from "node:assert/strict";
import test from "node:test";
import { getMeetingConflict, summarizeBlockOccupancy } from "./sections-schedules-live-summary.mjs";

test("official confirmations occupy one block seat even when a proposal exists", () => {
  const blocks = [
    { id: "block1", code: "BSIT-3A", termId: "TERM-1", capacity: 40 },
    { id: "block2", code: "BSIT-3B", termId: "TERM-1", capacity: 40 },
  ];
  const students = [
    { id: "person1", studentNumber: "2026-0001" },
    { id: "person2", studentNumber: "2026-0002" },
  ];
  const assignments = [
    { sectionId: "block1", studentId: "person1", status: "PROPOSED" },
    { sectionId: "block1", studentId: "person2", status: "PROPOSED" },
    { sectionId: "block1", studentId: "person2", status: "CANCELLED" },
  ];
  const enrollments = [
    { term: "TERM-1", status: "CONFIRMED", studentNumber: "2026-0001",
      subjects: [{ section: "BSIT-3A" }, { section: "BSIT-3A" }] },
    { term: "TERM-2", status: "CONFIRMED", studentNumber: "2026-0002",
      subjects: [{ section: "BSIT-3A" }] },
    { term: "TERM-1", status: "SUBMITTED", studentNumber: "2026-0003",
      subjects: [{ section: "BSIT-3A" }] },
  ];
  const count = summarizeBlockOccupancy(blocks, assignments, students, enrollments);
  assert.deepEqual(count.get("block1"), { proposed: 1, confirmed: 1, occupied: 2, available: 38 });
  assert.deepEqual(count.get("block2"), { proposed: 0, confirmed: 0, occupied: 0, available: 40 });
});

test("meeting conflict previews block, room and instructor overlaps only within the same term", () => {
  const classes = [
    { id: "blockA:sectionA", sectionId: "blockA", termId: "TERM-1", professorId: "teacher1" },
    { id: "blockA:sectionB", sectionId: "blockA", termId: "TERM-1", professorId: "teacher2" },
    { id: "blockB:sectionC", sectionId: "blockB", termId: "TERM-1", professorId: "teacher1" },
    { id: "blockC:sectionD", sectionId: "blockC", termId: "TERM-2", professorId: "teacher1" },
  ];
  const meetings = [
    { id: "meeting1:blockA", subjectClassId: "blockA:sectionA", day: "Mon",
      start: "09:00", end: "10:00", roomId: "room1" },
  ];
  const base = { subjectClassId: "blockA:sectionB", professorId: "teacher2",
    day: "Mon", start: "09:30", end: "10:30", roomId: "room2" };
  assert.match(getMeetingConflict(base, meetings, classes), /block already/);
  assert.match(getMeetingConflict({ ...base, subjectClassId: "blockB:sectionC",
    professorId: "teacher1" }, meetings, classes), /professor already/);
  assert.match(getMeetingConflict({ ...base, subjectClassId: "blockB:sectionC",
    professorId: "teacher1", roomId: "room1" }, meetings, classes), /room is already/);
  assert.equal(getMeetingConflict({ ...base, subjectClassId: "blockC:sectionD",
    professorId: "teacher1" }, meetings, classes), "");
  assert.equal(getMeetingConflict({ ...base, start: "10:00" }, meetings, classes), "");
  assert.equal(getMeetingConflict({ ...base, id: "meeting1:blockA" }, meetings, classes), "");
  assert.match(getMeetingConflict({ ...base, start: "10:45", end: "10:00" }, meetings, classes), /start time before/);
});
