import test from "node:test";
import assert from "node:assert/strict";
import { formatClockTime, formatRoomCode, formatWeekday, groupMeetingSchedules } from "../src/features/students/class-meeting-format.mjs";
test("normalizes database weekdays and times without inventing values", () => {
  assert.equal(formatWeekday(1), "Monday");
  assert.equal(formatWeekday(5), "Friday");
  assert.equal(formatClockTime("13:00:00"), "1:00 PM");
  assert.equal(formatClockTime("09:15:00"), "9:15 AM");
  assert.equal(formatClockTime("00:00:00"), "12:00 AM");
});
test("preserves distinct room identifiers", () => {
  assert.equal(formatRoomCode("BSIT-LAB1"), "BSIT LAB 1");
  assert.equal(formatRoomCode("BEED-LAB1"), "BEED LAB 1");
  assert.equal(formatRoomCode("BSIT-201"), "BSIT ROOM 201");
});
test("groups only matching meetings and retains distinct lab meetings", () => {
  const rows = [
    { day: 1, start: "13:00:00", end: "15:00:00", component: "LABORATORY", room: "BSIT-LAB1", instructor: "Professor A" },
    { day: 2, start: "13:00:00", end: "15:00:00", component: "LABORATORY", room: "BSIT-LAB1", instructor: "Professor A" },
    { day: 3, start: "09:00:00", end: "11:00:00", component: "LECTURE", room: "BSIT-201", instructor: "Professor A" },
  ];
  assert.deepEqual(groupMeetingSchedules(rows), [
    "LABORATORY: Monday and Tuesday (1:00 PM to 3:00 PM) · BSIT LAB 1 · Professor A",
    "LECTURE: Wednesday (9:00 AM to 11:00 AM) · BSIT ROOM 201 · Professor A",
  ]);
});
