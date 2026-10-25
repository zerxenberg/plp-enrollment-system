// Shared presentation only. Raw meeting identifiers remain unchanged in PostgreSQL.
export const WEEKDAY_NAMES = Object.freeze([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]);

export function formatWeekday(day) {
  if (day == null || day === "") return "Day not recorded";
  const numeric = Number(day);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) {
    return WEEKDAY_NAMES[numeric - 1];
  }
  const named = WEEKDAY_NAMES.find((value) =>
    value.toLowerCase() === String(day).trim().toLowerCase());
  return named || String(day);
}

export function formatClockTime(time) {
  const match = String(time ?? "").match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time == null || time === "" ? "Time not recorded" : String(time);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return String(time);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatRoomCode(room) {
  const source = String(room ?? "").trim();
  if (!source || source === "NOT_RECORDED_IN_SOURCE") return "To Be Announced";
  const lab = source.match(/^([A-Za-z0-9]+)[-\s]+LAB[-\s]?(\d+)$/i);
  if (lab) return `${lab[1].toUpperCase()} LAB ${lab[2]}`;
  const regular = source.match(/^([A-Za-z0-9]+)-(\d+)$/);
  if (regular) return `${regular[1].toUpperCase()} ROOM ${regular[2]}`;
  const plainLab = source.match(/^LAB[-\s]?(\d+)$/i);
  if (plainLab) return `LAB ${plainLab[1]}`;
  return source;
}

export function formatMeetingSchedule(meeting) {
  const kind = String(meeting?.component || meeting?.lecture_lab_type || "CLASS")
    .replaceAll("_", " ").toUpperCase();
  const day = formatWeekday(meeting?.day ?? meeting?.day_of_week);
  const start = formatClockTime(meeting?.start ?? meeting?.start_time);
  const end = formatClockTime(meeting?.end ?? meeting?.end_time);
  const room = formatRoomCode(meeting?.room);
  const teacher = meeting?.instructor || meeting?.professor || "To Be Announced";
  return `${kind}: ${day} (${start} to ${end}) · ${room} · ${teacher}`;
}

export function groupMeetingSchedules(meetings = []) {
  const groups = new Map();
  for (const meeting of meetings) {
    const kind = String(meeting?.component || meeting?.lecture_lab_type || "CLASS")
      .replaceAll("_", " ").toUpperCase();
    const start = formatClockTime(meeting?.start ?? meeting?.start_time);
    const end = formatClockTime(meeting?.end ?? meeting?.end_time);
    const room = formatRoomCode(meeting?.room);
    const teacher = meeting?.instructor || meeting?.professor || "To Be Announced";
    const key = JSON.stringify([kind, start, end, room, teacher]);
    if (!groups.has(key)) groups.set(key, { kind, start, end, room, teacher, days: new Set() });
    groups.get(key).days.add(formatWeekday(meeting?.day ?? meeting?.day_of_week));
  }
  return [...groups.values()].map((group) => {
    const days = [...group.days].sort((left, right) =>
      WEEKDAY_NAMES.indexOf(left) - WEEKDAY_NAMES.indexOf(right));
    const label = days.length === 1 ? days[0] :
      days.length === 2 ? days.join(" and ") :
      `${days.slice(0, -1).join(", ")}, and ${days.at(-1)}`;
    return `${group.kind}: ${label} (${group.start} to ${group.end}) · ${group.room} · ${group.teacher}`;
  });
}
