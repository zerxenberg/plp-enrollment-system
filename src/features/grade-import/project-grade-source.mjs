import { createHash } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import Papa from "papaparse";
import { unzipSync, strFromU8 } from "fflate";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const REQUIRED_PROJECT_GRADE_COLUMNS = [
  "student_number", "student_full_name", "subject_code", "academic_year",
  "semester", "section_code", "grade_value", "completion_status",
  "source_record_reference",
];
const ALLOWED_COLUMNS = new Set([
  ...REQUIRED_PROJECT_GRADE_COLUMNS, "previous_block_section", "previous_subject_professor",
]);
const COMPLETION = new Set(["COMPLETED", "FAILED", "INCOMPLETE", "CREDITED"]);
const normalize = (value) => String(value ?? "").trim();
const key = (value) => normalize(value).toUpperCase();
const loose = (value) => normalize(value).toLowerCase().replace(/\s+/g, " ");
const problem = (code, message) => ({ code, message });

/** Accept only a 2-D row matrix or the named-sheet wrapper returned by read-excel-file 9.x. */
export function extractProjectGradesMatrix(extracted) {
  if (!Array.isArray(extracted) || !extracted.length) {
    throw new Error("The Grades worksheet contains no rows.");
  }
  if (extracted.every((item) => Array.isArray(item))) return extracted;
  if (extracted.every((item) => item && !Array.isArray(item) && typeof item === "object")) {
    const grades = extracted.find((item) => item.sheet === "Grades");
    if (grades && Array.isArray(grades.data) && grades.data.every(Array.isArray)) {
      return grades.data;
    }
  }
  throw new Error("The Grades worksheet could not be located or read as rows.");
}

/** Node-only parser: no database access or writes, and no guessing a professor assignment. */
export async function parseProjectGradeSource(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !/\.(xlsx|csv)$/i.test(file.name) ||
      file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw new Error("Choose one XLSX or CSV grade file of up to 2 MB.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  let matrix;
  if (/\.csv$/i.test(file.name)) {
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch {
      throw new Error("The CSV file must use valid UTF-8 encoding.");
    }
    if (source.includes("\0")) throw new Error("The CSV file contains invalid control bytes.");
    const parsed = Papa.parse(source, { skipEmptyLines: "greedy", header: false });
    if (parsed.errors.length) throw new Error("The CSV file contains invalid quoting or row structure.");
    matrix = parsed.data;
  } else {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      throw new Error("This file is not a valid XLSX workbook.");
    }
    let archive;
    try {
      archive = unzipSync(bytes);
    } catch {
      throw new Error("The XLSX archive could not be opened.");
    }
    const workbook = archive["xl/workbook.xml"];
    const sheetNames = workbook
      ? [...strFromU8(workbook).matchAll(/<(?:\w+:)?sheet\b[^>]*\bname="([^"]+)"/gi)].map((match) => match[1])
      : [];
    if (!sheetNames.length || sheetNames[0] !== "Grades" || sheetNames.length > 2 ||
        (sheetNames.length === 2 && sheetNames[1] !== "Instructions")) {
      throw new Error("Upload a workbook with a first sheet named Grades and an optional Instructions sheet.");
    }
    for (const [name, content] of Object.entries(archive)) {
      if (name.startsWith("xl/worksheets/") && name.endsWith(".xml") &&
          /<(?:\w+:)?f(?:\s|>)/i.test(strFromU8(content))) {
        throw new Error("Grade worksheets cannot contain formulas.");
      }
    }
    let extracted;
    try {
      extracted = await readXlsxFile(bytes, { sheet: "Grades" });
    } catch {
      throw new Error("The grade worksheet could not be read.");
    }
    matrix = extractProjectGradesMatrix(extracted);
  }
  if (!Array.isArray(matrix) || matrix.length < 2 || !matrix.every(Array.isArray)) {
    throw new Error("The grade workbook contains no student records.");
  }
  const columns = matrix[0].map((value) => loose(value));
  if (columns.some((name) => !ALLOWED_COLUMNS.has(name)) ||
      new Set(columns).size !== columns.length ||
      REQUIRED_PROJECT_GRADE_COLUMNS.some((name) => !columns.includes(name))) {
    throw new Error(`Use the eleven recognized headers, including ${REQUIRED_PROJECT_GRADE_COLUMNS.join(", ")}.`);
  }
  const records = matrix.slice(1)
    .map((cells, index) => ({ cells, rowNumber: index + 2 }))
    .filter(({ cells }) => cells.some((value) => normalize(value)))
    .map(({ cells, rowNumber }) => {
      if (cells.slice(columns.length).some((value) => normalize(value))) {
        throw new Error("A grade source row contains unlabeled extra values.");
      }
      return { source_row_number: rowNumber,
        ...Object.fromEntries(columns.map((column, index) => [column, normalize(cells[index])])) };
    });
  if (!records.length || records.length > 1500) {
    throw new Error("A grade workbook must contain between 1 and 1,500 student records.");
  }
  return { fileName: file.name, checksum: createHash("sha256").update(bytes).digest("hex"), columns, records };
}

/** Match grades without treating a NULL canonical grade as zero. */
export function matchesProjectCanonicalGrade(sourceGrade, sourceStatus, canonicalGrade, canonicalStatus) {
  if (key(sourceStatus) !== key(canonicalStatus)) return false;
  if (canonicalGrade == null) return ["INC", "INCOMPLETE"].includes(key(sourceGrade));
  return /^\d+(?:\.\d{1,3})?$/.test(normalize(sourceGrade)) &&
    Number(sourceGrade) === Number(canonicalGrade);
}

/** Exact historical source precheck: 12 continuing students, their prior BSIT-1A term and subject. */
export function validateProjectGradeRows(parsed, block, subject) {
  const expected = Array.isArray(subject.expected) ? subject.expected : [];
  const roster = new Map(expected.map((student) => [key(student.studentNumber), student]));
  const counts = new Map();
  const sourceReferences = new Map();
  for (const record of parsed.records) {
    const studentKey = key(record.student_number);
    counts.set(studentKey, (counts.get(studentKey) || 0) + 1);
    const sourceKey = key(record.source_record_reference);
    sourceReferences.set(sourceKey, (sourceReferences.get(sourceKey) || 0) + 1);
  }
  const previewRows = parsed.records.map((row) => {
    const issues = [];
    for (const column of REQUIRED_PROJECT_GRADE_COLUMNS) {
      if (!normalize(row[column])) issues.push(problem("MISSING_COLUMN_VALUE", `${column} is required.`));
    }
    for (const [column, value] of Object.entries(row)) {
      if (column !== "source_row_number" && /^[=+@\t\r]/.test(value)) {
        issues.push(problem("UNSAFE_EXPRESSION", `Unsafe spreadsheet expression in ${column}.`));
      }
    }
    const student = roster.get(key(row.student_number));
    if (!student) issues.push(problem("OUTSIDE_PROJECT_ROSTER", "Student is not in this verified PROJECT_ONLY block and subject roster."));
    if (student && loose(row.student_full_name) !== loose(student.studentName)) {
      issues.push(problem("STUDENT_NAME_CONFLICT", "Student name differs from the authoritative project roster."));
    }
    if (key(row.subject_code) !== key(subject.code)) {
      issues.push(problem("SUBJECT_MISMATCH", "Subject code differs from the selected subject."));
    }
    if (loose(row.academic_year) !== loose(block.academicYear) ||
        loose(row.semester) !== loose(block.semester)) {
      issues.push(problem("TERM_MISMATCH", "Academic year or semester differs from the selected grading term."));
    }
    if (student && key(row.section_code) !== key(student.sectionCode || block.code)) {
      issues.push(problem("SECTION_MISMATCH", "Section differs from the verified project subject assignment."));
    }
    if (row.previous_block_section && key(row.previous_block_section) !== key(block.code)) {
      issues.push(problem("PREVIOUS_BLOCK_MISMATCH", "The historical previous block differs from the verified source group."));
    }
    if (row.previous_subject_professor &&
        !["NOT_VERIFIED_IN_SOURCE", "NOT_RECORDED", "NOT VERIFIED"].includes(key(row.previous_subject_professor))) {
      const assignedProfessor = subject.previousProfessor;
      if (assignedProfessor?.provenance !== "PROJECT_FICTIONAL_ASSIGNMENT" ||
          key(assignedProfessor.name) !== key(row.previous_subject_professor)) {
        issues.push(problem("PROFESSOR_ASSIGNMENT_MISMATCH",
          "Professor must match the assigned PROJECT_ONLY fictional professor for this historical subject. No institutional faculty verification is implied."));
      }
    }
    if ((counts.get(key(row.student_number)) || 0) !== 1) {
      issues.push(problem("DUPLICATE_STUDENT", "The student appears more than once in this subject workbook."));
    }
    if ((sourceReferences.get(key(row.source_record_reference)) || 0) !== 1) {
      issues.push(problem("DUPLICATE_SOURCE_REFERENCE", "A source record reference appears more than once in the workbook."));
    }
    if (!COMPLETION.has(key(row.completion_status))) {
      issues.push(problem("COMPLETION_INVALID", "Completion must be COMPLETED, FAILED, INCOMPLETE, or CREDITED."));
    }
    if (!/^\d+(?:\.\d{1,3})?$/.test(row.grade_value) && !/^(INC|INCOMPLETE)$/i.test(row.grade_value)) {
      issues.push(problem("GRADE_FORMAT_INVALID", "Use a numeric source grade or an incomplete marker."));
    }
    const canonicalMatches = student && matchesProjectCanonicalGrade(
      row.grade_value, row.completion_status, student.canonicalGrade, student.canonicalResultStatus);
    const validationStatus = issues.length ? "INVALID" : canonicalMatches ? "ALREADY_PRESENT" : "CONFLICT";
    if (validationStatus === "CONFLICT") {
      issues.push(problem("CANONICAL_RESULT_CONFLICT", "The uploaded result differs from existing project history. Protected correction approval is required."));
    }
    return {
      rowNumber: row.source_row_number, studentNumber: row.student_number,
      studentFullName: row.student_full_name, gradeValue: row.grade_value,
      previousSubjectProfessor: row.previous_subject_professor || null,
      completionStatus: key(row.completion_status), sourceRecordReference: row.source_record_reference,
      issues, validationStatus,
      previousGrade: student?.canonicalGrade, previousStatus: student?.canonicalResultStatus || null,
    };
  });
  const missingStudents = expected.filter((student) => !counts.has(key(student.studentNumber)));
  const invalidRows = previewRows.filter((row) => row.validationStatus === "INVALID").length;
  const alreadyPresentRows = previewRows.filter((row) => row.validationStatus === "ALREADY_PRESENT").length;
  const conflictRows = previewRows.filter((row) => row.validationStatus === "CONFLICT").length;
  return {
    fileName: parsed.fileName, checksum: parsed.checksum, rowCount: previewRows.length,
    requiredRows: expected.length, validRows: previewRows.length - invalidRows,
    alreadyPresentRows, conflictRows, invalidRows,
    missingStudents: missingStudents.map((student) => student.studentNumber), rows: previewRows,
  };
}
