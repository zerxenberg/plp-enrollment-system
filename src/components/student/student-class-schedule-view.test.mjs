import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassScheduleMeetings, resolveClassScheduleView, scheduledDays, scheduledTimeSlots,
} from "./student-class-schedule-view.mjs";

const proposed = {
  source: "VERIFIED_PROJECT_PROPOSED_TIMETABLE",
  timetableValidated: true,
  term: "TERM-2026-1",
  homeBlock: "BSIT-3A",
  subjects: [{ subject_code: "P8-101", subject_name: "Networking", section_id: "SECTION-1", units: 3, section_status: "OPEN" }],
  items: [
    { subject_code: "P8-101", day_of_week: 6, start_time: "13:00:00", end_time: "14:30:00", room: "CCS-402", professor: "Prof. A", lecture_lab_type: "Lecture" },
    { subject_code: "P8-101", day_of_week: "Mon", start_time: "08:00:00", end_time: "09:00:00", room: "CCS-LAB-3", professor: "Prof. B", lecture_lab_type: "Laboratory" },
    { subject_code: "OTHER", day_of_week: 2, start_time: "09:00", end_time: "10:00", professor: "Unrelated" },
  ],
};

test("proposals require trusted timetable source and explicit validation", () => {
  assert.equal(resolveClassScheduleView({ mode: "unavailable", proposedSchedule: proposed }).kind, "unavailable");
  assert.equal(resolveClassScheduleView({ mode: "project", proposedSchedule: { ...proposed, source: "UNKNOWN" } }).kind, "awaiting");
  assert.equal(resolveClassScheduleView({ mode: "project", proposedSchedule: { ...proposed, timetableValidated: false } }).kind, "awaiting");
  assert.equal(resolveClassScheduleView({ mode: "project", proposedSchedule: { ...proposed, items: [] } }).kind, "awaiting");
  const view = resolveClassScheduleView({ mode: "project", proposedSchedule: proposed });
  assert.equal(view.kind, "proposed");
  assert.equal(view.provenance, "demonstration");
});

test("only a verified Registrar snapshot upgrades a plan to registration", () => {
  const incompleteProject = {
    ...proposed, reference: "DEMO-1", confirmedAt: "2026-10-26T10:00:00Z",
    registrationSnapshotComplete: false, source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
  };
  assert.equal(resolveClassScheduleView({
    mode: "project", proposedSchedule: proposed, projectSchedule: incompleteProject,
  }).kind, "proposed");
  const completeProject = { ...incompleteProject, registrationSnapshotComplete: true };
  const demo = resolveClassScheduleView({
    mode: "project", proposedSchedule: proposed, projectSchedule: completeProject,
  });
  assert.equal(demo.kind, "registered");
  assert.equal(demo.provenance, "demonstration");
  assert.equal(resolveClassScheduleView({
    mode: "project", proposedSchedule: proposed, projectSchedule: completeProject,
    officialSchedule: { reference: "OFFICIAL-1", subjects: proposed.subjects, items: proposed.items },
  }).provenance, "official");
});

test("day, time, venue and instructor come from meetings, including weekend sessions", () => {
  const classes = buildClassScheduleMeetings(proposed, "proposed");
  assert.equal(classes.length, 2, "do not show meetings not linked to listed subjects");
  assert.deepEqual(scheduledDays(classes), ["Monday", "Saturday"]);
  assert.deepEqual(scheduledTimeSlots(classes).map((slot) => slot.label), ["8:00 AM", "1:00 PM"]);
  assert.equal(classes[0].room, "CCS LAB 3");
  assert.equal(classes[0].instructor, "Prof. B");
  assert.equal(classes[1].room, "CCS ROOM 402");
  assert.equal(classes[1].section, "BSIT-3A");
  assert.equal(classes[1].sectionStatus, "OPEN");
  assert.ok(classes.every((item) => item.recordStatus === "PROPOSED"));
  assert.ok(buildClassScheduleMeetings(proposed, "registered")
    .every((item) => item.recordStatus === "CONFIRMED"));
});

test("missing instructors and rooms have visible fallbacks without fabricated assignments", () => {
  const schedule = {
    subjects: proposed.subjects,
    items: [{ subject_code: "P8-101", day_of_week: 3, start_time: "10:00", end_time: "12:00", room: null, professor: "NOT_RECORDED_IN_SOURCE" }],
  };
  const [meeting] = buildClassScheduleMeetings(schedule, "proposed");
  assert.equal(meeting.room, "To Be Announced");
  assert.equal(meeting.instructor, "Not recorded");
  assert.equal(meeting.component, "Class meeting");
  assert.equal(meeting.day, "Wednesday");
});
