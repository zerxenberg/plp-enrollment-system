// Convert the current academic_terms record into the shared Topbar contract.
// Keep dates, labels, and period ownership in PostgreSQL, not in the UI.
function formatEnrollmentDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(date.getTime()) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return null;
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila",
  }).format(date);
}

export function admissionsStudentHeaderTerm(record) {
  if (!record || typeof record.short_label !== "string" ||
      !record.short_label.trim()) return null;
  const enrollmentStart = formatEnrollmentDate(record.enrollment_start);
  const enrollmentEnd = formatEnrollmentDate(record.enrollment_end);
  if (!enrollmentStart || !enrollmentEnd ||
      record.enrollment_start > record.enrollment_end) return null;

  return {
    shortLabel: record.short_label.trim(),
    enrollmentStart,
    enrollmentEnd,
    isDemonstration: false,
  };
}
