import { DEPARTMENTS, PROGRAMS } from "../academic/academic-reference.js";

export const ALL_ACADEMIC_FILTERS = Object.freeze({
  department: "ALL",
  program: "ALL",
  major: "ALL",
  academicYear: "ALL",
  semester: "ALL",
  yearLevel: "ALL",
  section: "ALL",
});

const FILTER_ORDER = Object.keys(ALL_ACADEMIC_FILTERS);
const ALL = "ALL";
const LABELS = {
  major: "Major",
  academicYear: "Academic Year",
  semester: "Semester",
  yearLevel: "Year Level",
  section: "Section",
};

export function updateAcademicFilters(filters, field, value) {
  const index = FILTER_ORDER.indexOf(field);
  if (index < 0) return filters;
  const next = { ...filters, [field]: value };
  FILTER_ORDER.slice(index + 1).forEach((key) => { next[key] = ALL; });
  return next;
}

function termDetails(record) {
  const term = String(record.term || record.academicTerm || "");
  const explicitYear = record.academicYear || "";
  const academicYear = explicitYear || term.match(/\b(?:19|20)\d{2}(?:\s*(?:to|[-–])\s*(?:19|20)\d{2})?\b/i)?.[0] || "";
  const semester = record.semester || (/\b(?:1st|first)\s*(?:sem(?:ester)?)\b/i.test(term)
    ? "First Semester"
    : /\b(?:2nd|second)\s*(?:sem(?:ester)?)\b/i.test(term)
      ? "Second Semester"
      : /\b(?:summer|midyear)\b/i.test(term) ? "Summer" : "");
  return { academicYear, semester, yearLevel: record.yearLevel || "" };
}

// Each snapshot represents one enrollment term and section. Historical academic
// fields must match the same snapshot, not different transactions of a student.
function snapshotsForRecord(record, enrollmentsByStudent) {
  const isStudent = Object.hasOwn(record, "admissionReference");
  const transactions = isStudent ? (enrollmentsByStudent.get(record.studentNumber) || []) : [record];
  const snapshots = transactions.flatMap((entry) => {
    const term = termDetails(entry);
    const sections = [...new Set((entry.subjects || []).map((subject) => subject.section).filter(Boolean))];
    return sections.length ? sections.map((section) => ({ ...term, section })) : [{ ...term, section: "" }];
  });
  if (!isStudent || !record.academicTerm) return snapshots;
  // An admission handoff may contain a term not represented by an enrollment.
  const academicTerm = termDetails(record);
  const hasTerm = snapshots.some((snapshot) => snapshot.academicYear === academicTerm.academicYear &&
    snapshot.semester === academicTerm.semester);
  return hasTerm ? snapshots : [...snapshots, { ...academicTerm, section: "" }];
}

function recordsWithSnapshots(records, enrollments) {
  const byStudent = new Map();
  enrollments.forEach((entry) => {
    const list = byStudent.get(entry.studentNumber) || [];
    list.push(entry);
    byStudent.set(entry.studentNumber, list);
  });
  return records.map((record) => ({ record, snapshots: snapshotsForRecord(record, byStudent) }));
}

function recordMatches(item, filters, programDepartment) {
  const { record, snapshots } = item;
  if (filters.program !== ALL && record.program !== filters.program) return false;
  if (filters.department !== ALL && programDepartment.get(record.program) !== filters.department) return false;
  if (filters.major !== ALL && record.major !== filters.major) return false;
  if (["academicYear", "semester", "yearLevel", "section"].every((key) => filters[key] === ALL)) return true;
  return snapshots.some((snapshot) => ["academicYear", "semester", "yearLevel", "section"]
    .every((key) => filters[key] === ALL || snapshot[key] === filters[key]));
}

export function filterAcademicRecords(records, filters, enrollments = [], programs = PROGRAMS) {
  const programDepartment = new Map(programs.map((program) => [program.code, program.department]));
  return recordsWithSnapshots(records, enrollments)
    .filter((item) => recordMatches(item, filters, programDepartment))
    .map((item) => item.record);
}

export function getAcademicFilterOptions(records, filters, enrollments = [], programs = PROGRAMS, departments = DEPARTMENTS) {
  const programDepartment = new Map(programs.map((program) => [program.code, program.department]));
  const withSnapshots = recordsWithSnapshots(records, enrollments);
  const options = {
    department: [{ value: ALL, label: "All Departments" },
      ...departments.map((department) => ({ value: department.id, label: department.name }))],
    program: [{ value: ALL, label: "All Programs" }],
    major: [{ value: ALL, label: "All Majors" }],
  };
  programs.filter((program) => filters.department === ALL || program.department === filters.department)
    .forEach((program) => options.program.push({ value: program.code, label: program.code }));
  if (filters.department === ALL) {
    [...new Set(records.map((record) => record.program).filter(Boolean))]
      .filter((code) => !programDepartment.has(code))
      .forEach((code) => options.program.push({ value: code, label: `${code} (legacy demo record)` }));
  }
  const selectedProgram = programs.find((entry) => entry.code === filters.program);
  (selectedProgram?.majors || []).forEach((major) => options.major.push({ value: major, label: major }));
  const scope = { ...ALL_ACADEMIC_FILTERS, department: filters.department, program: filters.program, major: filters.major };
  for (const key of ["academicYear", "semester", "yearLevel", "section"]) {
    const matches = withSnapshots.filter((item) => recordMatches(item, scope, programDepartment));
    const values = new Set(matches.flatMap((item) => item.snapshots
      .filter((snapshot) => ["academicYear", "semester", "yearLevel", "section"]
        .every((previous) => previous === key || scope[previous] === ALL || snapshot[previous] === scope[previous]))
      .map((snapshot) => snapshot[key]).filter(Boolean)));
    options[key] = [
      { value: ALL, label: `All ${LABELS[key]}s` },
      ...[...values].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
        .map((value) => ({ value, label: value })),
    ];
    scope[key] = filters[key];
  }
  return options;
}

export function academicFilterSummary(filters) {
  return Object.entries(filters).filter(([, value]) => value !== ALL)
    .map(([key, value]) => `${LABELS[key] || (key === "department" ? "Department" : "Program")}: ${value}`);
}
