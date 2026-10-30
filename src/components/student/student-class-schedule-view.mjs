import { formatClockTime, formatRoomCode, formatWeekday } from "../../features/students/class-meeting-format.mjs";

export const SCHEDULE_WEEKDAYS = Object.freeze([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]);

const blank = (value) => value == null || value === "" || value === "NOT_RECORDED_IN_SOURCE";
const textOr = (value, fallback = "Not recorded") => blank(value) ? fallback : String(value);

function clockMinutes(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) {
    return Number.POSITIVE_INFINITY;
  }
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hour * 60 + minute;
}

function weekday(value) {
  const formatted = formatWeekday(value);
  const abbreviatedIndex = SCHEDULE_WEEKDAYS.findIndex((day) =>
    day.slice(0, 3).toLowerCase() === String(formatted).trim().toLowerCase());
  return abbreviatedIndex >= 0 ? SCHEDULE_WEEKDAYS[abbreviatedIndex] : formatted;
}

function dayOrder(day) {
  const index = SCHEDULE_WEEKDAYS.indexOf(day);
  return index < 0 ? SCHEDULE_WEEKDAYS.length : index;
}

export function resolveClassScheduleView({
  mode = "unavailable", officialSchedule, projectSchedule, proposedSchedule, blockSchedule,
} = {}) {
  if (mode !== "project") return { kind: "unavailable", schedule: null };

  if (officialSchedule?.reference && Array.isArray(officialSchedule?.subjects) &&
      officialSchedule.subjects.length && Array.isArray(officialSchedule?.items) &&
      officialSchedule.items.length) {
    return { kind: "registered", provenance: "official", schedule: officialSchedule };
  }

  if (projectSchedule?.registrationSnapshotComplete === true &&
      projectSchedule?.source === "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT" &&
      projectSchedule?.reference && projectSchedule?.confirmedAt &&
      Array.isArray(projectSchedule.subjects) && projectSchedule.subjects.length &&
      Array.isArray(projectSchedule.items) && projectSchedule.items.length) {
    return { kind: "registered", provenance: "demonstration", schedule: projectSchedule };
  }

  // Only the trusted student loader may supply this student-scoped verified
  // block timetable. It remains a proposal regardless of section publication.
  if (proposedSchedule?.source === "VERIFIED_PROJECT_PROPOSED_TIMETABLE" &&
      proposedSchedule?.timetableValidated === true &&
      Array.isArray(proposedSchedule.subjects) && proposedSchedule.subjects.length &&
      Array.isArray(proposedSchedule.items) && proposedSchedule.items.length) {
    return { kind: "proposed", provenance: "demonstration", schedule: proposedSchedule };
  }

  // A published block timetable is visible even before academic eligibility
  // is established. It must never be presented as a proposed registration.
  if (blockSchedule?.source === "VERIFIED_PROJECT_BLOCK_TIMETABLE" &&
      blockSchedule?.timetableValidated === true &&
      Array.isArray(blockSchedule.subjects) && blockSchedule.subjects.length &&
      Array.isArray(blockSchedule.items) && blockSchedule.items.length) {
    return { kind: "block", provenance: "demonstration", schedule: blockSchedule };
  }

  return { kind: "awaiting", schedule: null };
}

export function buildClassScheduleMeetings(schedule, kind) {
  const subjects = new Map((schedule?.subjects || [])
    .filter((item) => item?.subject_code)
    .map((item) => [item.subject_code, item]));

  return (schedule?.items || []).flatMap((item, index) => {
    const subject = subjects.get(item?.subject_code);
    if (!subject || blank(item.day_of_week) || blank(item.start_time) ||
        blank(item.end_time)) return [];
    const day = weekday(item.day_of_week);
    const start = formatClockTime(item.start_time);
    const end = formatClockTime(item.end_time);
    return [{
      key: `${item.subject_code}:${day}:${item.start_time}:${item.end_time}:${index}`,
      code: item.subject_code,
      name: textOr(subject.subject_name, item.subject_code),
      sectionId: subject.section_id || null,
      section: textOr(subject.section_code || subject.section || schedule.homeBlock),
      sectionStatus: subject.section_status || null,
      units: subject.units ?? subject.academic_units ?? null,
      day, start, end,
      startMinutes: clockMinutes(item.start_time),
      room: formatRoomCode(item.room),
      instructor: textOr(item.professor || item.instructor),
      component: textOr(item.lecture_lab_type || item.component, "Class meeting"),
      recordStatus: kind === "block" ? "PUBLISHED" : kind === "proposed" ? "PROPOSED" : "CONFIRMED",
      recordLabel: kind === "block" ? "Block timetable only" : kind === "proposed" ? "Proposed" : "Registered",
    }];
  }).sort((a, b) => dayOrder(a.day) - dayOrder(b.day) ||
    a.startMinutes - b.startMinutes || a.code.localeCompare(b.code));
}

export function scheduledDays(classes) {
  return [...new Set(classes.map((item) => item.day))].sort((a, b) =>
    dayOrder(a) - dayOrder(b) || a.localeCompare(b));
}

export function scheduledTimeSlots(classes) {
  return [...new Map(classes.map((item) =>
    [item.start, { label: item.start, minutes: item.startMinutes }])).values()]
    .sort((a, b) => a.minutes - b.minutes || a.label.localeCompare(b.label));
}
