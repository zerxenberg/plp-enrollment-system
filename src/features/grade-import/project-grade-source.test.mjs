import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import {
  canonicalProjectNameWithoutJr,
  extractProjectGradesMatrix,
  matchesProjectCanonicalGrade,
  parseProjectGradeSource,
  REQUIRED_PROJECT_GRADE_COLUMNS,
  validateProjectGradeRows,
} from "./project-grade-source.mjs";

// Generated local grade evidence only: no live student records or database changes.
const STUDENT_NUMBERS = [
  "25-50001", "25-50004", "25-50007", "25-50010", "25-50013", "25-50016",
  "25-50019", "25-50022", "25-50025", "25-50028", "25-50031", "25-50034",
];
const HEADERS = [...REQUIRED_PROJECT_GRADE_COLUMNS, "previous_block_section", "previous_subject_professor"];
const SUBJECTS = [
  { code: "CP2", conflictStudent: "25-50004" },
  { code: "DISCRETE", conflictStudent: "25-50013" },
  { code: "CN1", conflictStudent: "25-50022" },
];
const BLOCK = { code: "BSIT-1A", academicYear: "2025-2026", semester: "Second Semester" };

function subjectContext(code) {
  return { code, expected: STUDENT_NUMBERS.map((studentNumber, index) => ({
    studentNumber, studentName: `Project Student ${index + 1}`,
    sectionCode: "BSIT-1A", canonicalGrade: 2,
    canonicalResultStatus: "COMPLETED",
  })) };
}

function matrixFor(code, conflictStudent) {
  return [HEADERS, ...subjectContext(code).expected.map((student) => {
    const failed = student.studentNumber === conflictStudent;
    return [
      student.studentNumber, student.studentName, code, BLOCK.academicYear,
      BLOCK.semester, "BSIT-1A", failed ? 5 : 2,
      failed ? "FAILED" : "COMPLETED", `${code}-${student.studentNumber}`,
      "BSIT-1A", "NOT_VERIFIED_IN_SOURCE",
    ];
  })];
}

function file(name, bytes) {
  const buffer = Buffer.from(bytes);
  return { name, size: buffer.length, async arrayBuffer() {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } };
}

function workbookFile(matrix, code, { instructions = true, firstSheet = "Grades", formula = false } = {}) {
  const workbook = XLSX.utils.book_new();
  const gradeSheet = XLSX.utils.aoa_to_sheet(matrix);
  if (formula) gradeSheet.G2 = { t: "n", v: 2, f: "1+1" };
  XLSX.utils.book_append_sheet(workbook, gradeSheet, firstSheet);
  if (instructions) XLSX.utils.book_append_sheet(workbook,
    XLSX.utils.aoa_to_sheet([["Instructions"], ["Historical PROJECT_ONLY grading source"]]), "Instructions");
  return file(`${code}_BSIT-1A.xlsx`, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function csvFile(matrix, code) {
  const encode = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const bytes = Buffer.from(`\uFEFF${matrix.map((row) => row.map(encode).join(",")).join("\r\n")}\r\n`, "utf8");
  return file(`${code}_BSIT-1A.csv`, bytes);
}

test("read-excel-file named sheet wrapper and unwrapped 2D matrix both select Grades", () => {
  const grades = [["student_number"], ["25-50001"]];
  assert.deepEqual(extractProjectGradesMatrix(grades), grades);
  assert.deepEqual(extractProjectGradesMatrix([
    { sheet: "Grades", data: grades }, { sheet: "Instructions", data: [["Read me"]] },
  ]), grades);
  assert.throws(() => extractProjectGradesMatrix([
    { sheet: "Instructions", data: grades },
  ]), /Grades worksheet/);
});

test("two-sheet XLSX parses exact 11 headers, 12 roster rows and unverified professor", async () => {
  const parsed = await parseProjectGradeSource(workbookFile(matrixFor("CP2"), "CP2"));
  assert.deepEqual(parsed.columns, HEADERS);
  assert.equal(parsed.records.length, 12);
  assert.equal(parsed.records[0].source_row_number, 2);
  assert.equal(parsed.records[0].previous_subject_professor, "NOT_VERIFIED_IN_SOURCE");
  assert.match(parsed.checksum, /^[a-f0-9]{64}$/);
  const preview = validateProjectGradeRows(parsed, BLOCK, subjectContext("CP2"));
  assert.equal(preview.invalidRows, 0);
  assert.equal(preview.conflictRows, 0);
  assert.equal(preview.alreadyPresentRows, 12);
});

test("transferees added to a current block are not historical students and cannot be staged", async () => {
  const matrix = matrixFor("CP2");
  matrix.push(...["26-50104", "26-50106", "26-50108"].map((id) => [
    id, `New Transfer ${id}`, "CP2", BLOCK.academicYear, BLOCK.semester,
    "BSIT-1A", 5, "FAILED", `CP2-${id}`, "BSIT-1A", "NOT_VERIFIED_IN_SOURCE",
  ]));
  const parsed = await parseProjectGradeSource(workbookFile(matrix, "CP2"));
  const preview = validateProjectGradeRows(parsed, BLOCK, subjectContext("CP2"));
  assert.equal(preview.rowCount, 15);
  assert.equal(preview.requiredRows, 12);
  assert.equal(preview.outsideRosterRows, 3);
  assert.equal(preview.invalidRows, 3);
  assert.equal(preview.alreadyPresentRows, 12);
  assert.equal(preview.missingStudents.length, 0);
  assert.ok(preview.rows.filter((row) => row.validationStatus === "INVALID")
    .every((row) => row.issues.some((issue) => issue.code === "OUTSIDE_PROJECT_ROSTER")));
});

test("only an explicit canonical Jr. suffix produces a historical unsuffixed alias", () => {
  const name = "Juan Miguel Antonio Dela Cruz Jr.";
  assert.equal(canonicalProjectNameWithoutJr({ full_name: name, suffix: "Jr." }),
    "Juan Miguel Antonio Dela Cruz");
  assert.equal(canonicalProjectNameWithoutJr({ full_name: name, suffix: "jr" }),
    "Juan Miguel Antonio Dela Cruz");
  assert.equal(canonicalProjectNameWithoutJr({ full_name: name, suffix: null }), null);
  assert.equal(canonicalProjectNameWithoutJr({ full_name: name, suffix: "Sr." }), null);
  assert.equal(canonicalProjectNameWithoutJr({ full_name: "Juan Miguel Antonio Dela Cruz", suffix: "Jr." }), null);
  assert.equal(canonicalProjectNameWithoutJr({ full_name: "Juan Miguel Antonio Dela Cruz Jr. Extra", suffix: "Jr." }), null);
});

test("historical workbook recognizes the Jr. canonical name and its authorized original name", async () => {
  const account = { full_name: "Juan Miguel Antonio Dela Cruz Jr.", suffix: "Jr." };
  const expected = subjectContext("CP2");
  expected.expected[0] = { ...expected.expected[0], studentName: account.full_name,
    studentSuffix: account.suffix,
    studentNameWithoutSuffix: canonicalProjectNameWithoutJr(account) };

  for (const workbookName of [account.full_name, "Juan Miguel Antonio Dela Cruz"]) {
    const matrix = matrixFor("CP2");
    matrix[1][1] = workbookName;
    const preview = validateProjectGradeRows(
      await parseProjectGradeSource(workbookFile(matrix, "CP2")), BLOCK, expected);
    assert.equal(preview.invalidRows, 0, workbookName);
    assert.equal(preview.alreadyPresentRows, 12, workbookName);
    assert.equal(preview.rows[0].validationStatus, "ALREADY_PRESENT");
  }
});

test("Jr. exception never relaxes mismatched surnames or other student identities", async () => {
  const account = { full_name: "Juan Miguel Antonio Dela Cruz Jr.", suffix: "Jr." };
  const expected = subjectContext("CP2");
  const target = { ...expected.expected[0], studentName: account.full_name,
    studentSuffix: account.suffix,
    studentNameWithoutSuffix: canonicalProjectNameWithoutJr(account) };
  expected.expected[0] = target;

  for (const workbookName of ["Juan Miguel Antonio Santos", "Juan Miguel Dela Cruz",
    "Juan Miguel Antonio Dela Cruz Sr."]) {
    const matrix = matrixFor("CP2");
    matrix[1][1] = workbookName;
    const preview = validateProjectGradeRows(
      await parseProjectGradeSource(workbookFile(matrix, "CP2")), BLOCK, expected);
    assert.equal(preview.invalidRows, 1, workbookName);
    assert.ok(preview.rows[0].issues.some((issue) => issue.code === "STUDENT_NAME_CONFLICT"));
  }

  // Even if an alias were supplied for another student, the verified suffix
  // must separately authorize accepting it.
  const withoutSuffix = { ...expected, expected: [{ ...target, studentSuffix: null },
    ...expected.expected.slice(1)] };
  const matrix = matrixFor("CP2");
  matrix[1][1] = "Juan Miguel Antonio Dela Cruz";
  const preview = validateProjectGradeRows(
    await parseProjectGradeSource(workbookFile(matrix, "CP2")), BLOCK, withoutSuffix);
  assert.equal(preview.invalidRows, 1);
  assert.ok(preview.rows[0].issues.some((issue) => issue.code === "STUDENT_NAME_CONFLICT"));
});

test("three failed historical grade sources are previewed as conflicts, not rewritten or invalidated", async () => {
  let conflicts = 0;
  let matches = 0;
  for (const { code, conflictStudent } of SUBJECTS) {
    const parsed = await parseProjectGradeSource(workbookFile(matrixFor(code, conflictStudent), code));
    const preview = validateProjectGradeRows(parsed, BLOCK, subjectContext(code));
    assert.equal(preview.rowCount, 12);
    assert.equal(preview.missingStudents.length, 0);
    assert.equal(preview.invalidRows, 0);
    assert.equal(preview.conflictRows, 1);
    assert.equal(preview.alreadyPresentRows, 11);
    const mismatch = preview.rows.find((row) => row.studentNumber === conflictStudent);
    assert.equal(mismatch.validationStatus, "CONFLICT");
    assert.equal(mismatch.gradeValue, "5");
    assert.equal(mismatch.completionStatus, "FAILED");
    assert.equal(mismatch.previousGrade, 2);
    assert.ok(mismatch.issues.some((issue) => issue.code === "CANONICAL_RESULT_CONFLICT"));
    conflicts += preview.conflictRows;
    matches += preview.alreadyPresentRows;
  }
  assert.equal(conflicts, 3);
  assert.equal(matches, 33);
});

test("CSV import matches XLSX precheck and preserves provenance placeholders", async () => {
  const parsed = await parseProjectGradeSource(csvFile(matrixFor("CP2", "25-50004"), "CP2"));
  const preview = validateProjectGradeRows(parsed, BLOCK, subjectContext("CP2"));
  assert.equal(parsed.records.length, 12);
  assert.equal(parsed.records[0].previous_subject_professor, "NOT_VERIFIED_IN_SOURCE");
  assert.equal(preview.conflictRows, 1);
  assert.equal(preview.alreadyPresentRows, 11);
  assert.equal(preview.invalidRows, 0);
});

test("no professor assignment is inferred: arbitrary professor names fail source precheck", async () => {
  const matrix = matrixFor("CP2");
  matrix[1][10] = "Prof. Fabricated";
  const parsed = await parseProjectGradeSource(workbookFile(matrix, "CP2"));
  const preview = validateProjectGradeRows(parsed, BLOCK, subjectContext("CP2"));
  assert.equal(preview.invalidRows, 1);
  assert.ok(preview.rows[0].issues.some((issue) => issue.code === "PROFESSOR_ASSIGNMENT_MISMATCH"));
});

test("exact assigned PROJECT_ONLY fictional professor is accepted without certifying historical source", async () => {
  const matrix = matrixFor("CP2");
  for (const row of matrix.slice(1)) row[10] = "Prof. Adrian Velasco";
  const parsed = await parseProjectGradeSource(workbookFile(matrix, "CP2"));
  const subject = { ...subjectContext("CP2"), previousProfessor: {
    name: "Prof. Adrian Velasco", provenance: "PROJECT_FICTIONAL_ASSIGNMENT",
  } };
  const preview = validateProjectGradeRows(parsed, BLOCK, subject);
  assert.equal(preview.invalidRows, 0);
  assert.equal(preview.alreadyPresentRows, 12);
  assert.equal(parsed.records[0].previous_subject_professor, "Prof. Adrian Velasco");
  assert.equal(preview.rows[0].previousSubjectProfessor, "Prof. Adrian Velasco");
  const wrong = matrixFor("CP2");
  wrong[1][10] = "Prof. Random Name";
  const mismatch = validateProjectGradeRows(await parseProjectGradeSource(workbookFile(wrong, "CP2")), BLOCK, subject);
  assert.equal(mismatch.invalidRows, 1);
  assert.ok(mismatch.rows[0].issues.some((issue) => issue.code === "PROFESSOR_ASSIGNMENT_MISMATCH"));
  const placeholder = validateProjectGradeRows(await parseProjectGradeSource(workbookFile(matrixFor("CP2"), "CP2")), BLOCK, subject);
  assert.equal(placeholder.invalidRows, 0, "already staged placeholder-based source remains valid");
});

test("wrong historical section/term and duplicate roster are detected before staging", async () => {
  const matrix = matrixFor("CP2");
  matrix[1][5] = "BSIT-2A"; // current block, not the prior source group
  matrix[2][3] = "2026-2027"; // not TERM-2025-2
  matrix[3][0] = matrix[4][0]; // duplicate student ID
  const parsed = await parseProjectGradeSource(csvFile(matrix, "CP2"));
  const preview = validateProjectGradeRows(parsed, BLOCK, subjectContext("CP2"));
  assert.ok(preview.rows[0].issues.some((issue) => issue.code === "SECTION_MISMATCH"));
  assert.ok(preview.rows[1].issues.some((issue) => issue.code === "TERM_MISMATCH"));
  assert.ok(preview.rows[2].issues.some((issue) => issue.code === "DUPLICATE_STUDENT"));
  assert.equal(preview.missingStudents.length, 1);
});

test("XLSX rejects formula cells and an incorrectly named first sheet", async () => {
  const matrix = matrixFor("CP2");
  await assert.rejects(parseProjectGradeSource(workbookFile(matrix, "CP2", { formula: true })), /formulas/);
  await assert.rejects(parseProjectGradeSource(workbookFile(matrix, "CP2", { firstSheet: "Wrong" })), /first sheet named Grades/);
});

test("CSV rejects duplicate/extra headers and unlabeled values", async () => {
  const duplicate = matrixFor("CP2");
  duplicate[0][10] = "student_number";
  await assert.rejects(parseProjectGradeSource(csvFile(duplicate, "CP2")), /eleven recognized headers/);
  const extra = matrixFor("CP2");
  extra[1].push("unlabeled data");
  // Papa Parse may pad the header to the widest CSV row, which rejects as an
  // unknown empty header before the parser's unlabeled-row-value guard.
  await assert.rejects(parseProjectGradeSource(csvFile(extra, "CP2")),
    /unlabeled extra values|eleven recognized headers/);
});

test("canonical reconciliation matches preview and never treats null historical grade as zero", () => {
  assert.equal(matchesProjectCanonicalGrade("2.00", "COMPLETED", 2, "COMPLETED"), true);
  assert.equal(matchesProjectCanonicalGrade("5.00", "FAILED", 2, "COMPLETED"), false);
  assert.equal(matchesProjectCanonicalGrade("INC", "INCOMPLETE", null, "INCOMPLETE"), true);
  assert.equal(matchesProjectCanonicalGrade("0", "INCOMPLETE", null, "INCOMPLETE"), false);
  assert.equal(matchesProjectCanonicalGrade("", "INCOMPLETE", null, "INCOMPLETE"), false);
});
