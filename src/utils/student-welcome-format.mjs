// Presentation labels for trusted Student Portal identity fields. Database
// student types and year levels remain unchanged for business rules.
const YEAR_LEVELS = Object.freeze({
  1: "1st Year",
  2: "2nd Year",
  3: "3rd Year",
  4: "4th Year",
});

const STUDENT_TYPES = Object.freeze({
  NEW_STUDENT: "Freshman",
  TRANSFEREE: "Transferee",
  CONTINUING_STUDENT: "Continuing Student",
});

export function formatStudentYearLevel(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(?:Year\s+)?([1-4])(?:st|nd|rd|th)?(?:\s+Year)?$/i);
  return match ? YEAR_LEVELS[Number(match[1])] : null;
}

export function formatStudentType(value) {
  if (typeof value !== "string") return "Student";
  const type = value.trim().toUpperCase().replaceAll(" ", "_");
  return STUDENT_TYPES[type] || "Student";
}

export function formatStudentWelcomeDetails(student) {
  const yearLevel = formatStudentYearLevel(student?.yearLevel);
  return [student?.number, student?.program, yearLevel, formatStudentType(student?.type)]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" · ");
}
