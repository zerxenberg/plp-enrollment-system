import readXlsxFile from "read-excel-file/browser";
import Papa from "papaparse";
import { unzipSync, strFromU8 } from "fflate";

// These values describe synthetic historical attempts, never inferred enrollments.
export const GRADE_IMPORT_SCOPE = Object.freeze({
  academicYear: "2025 to 2026",
  semester: "Second Semester",
  department: "CCSIT",
  program: "BSIT",
  subjectCode: "IT204",
  subjectName: "Object Oriented Programming",
  sectionCode: "BSIT-2A",
  facultyMember: "Prof. R. Mendoza",
});

export const GRADE_IMPORT_HEADERS = Object.freeze([
  "student_number", "student_full_name", "subject_code", "academic_year",
  "semester", "section_code", "grade_value", "completion_status",
  "source_record_reference", "Subject_name",
]);

export const GRADE_IMPORT_STATUSES = Object.freeze({
  UPLOADED: "UPLOADED", VALIDATING: "VALIDATING", NEEDS_CORRECTION: "NEEDS_CORRECTION",
  VALIDATED: "VALIDATED", READY_TO_PUBLISH: "READY_TO_PUBLISH",
  PUBLISHING: "PUBLISHING", PUBLISHED: "PUBLISHED", FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});
export const GRADE_IMPORT_STORAGE_KEY = "plp-demo-grade-imports-v1";
export const GRADE_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const GRADE_IMPORT_EMPTY = Object.freeze({ batches: [], publications: [], revisions: [], notifications: [] });

// Verified historical fixtures added explicitly for this demo. Current-term
// unconfirmed enrollment submissions cannot be treated as past attempts.
export const MOCK_CONFIRMED_ATTEMPTS = Object.freeze([
  { studentNumber: "2024-00123", academicYear: "2025 to 2026", semester: "Second Semester", subjectCode: "IT204", sectionCode: "BSIT-2A", status: "CONFIRMED" },
  { studentNumber: "2026-01896", academicYear: "2025 to 2026", semester: "Second Semester", subjectCode: "IT204", sectionCode: "BSIT-2A", status: "CONFIRMED" },
  { studentNumber: "2026-00108", academicYear: "2025 to 2026", semester: "Second Semester", subjectCode: "IT204", sectionCode: "BSIT-2A", status: "CONFIRMED" },
]);

const text = (value) => String(value ?? "").trim();
const now = () => new Date().toISOString();
const identifier = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
export const attemptKey = (row) => [row.student_number ?? row.studentNumber, row.academic_year ?? row.academicYear, row.semester, row.subject_code ?? row.subjectCode, row.section_code ?? row.sectionCode].map(text).join("|");

export function readGradeStore() {
  if (typeof window === "undefined") return structuredClone(GRADE_IMPORT_EMPTY);
  try {
    const value = JSON.parse(window.localStorage.getItem(GRADE_IMPORT_STORAGE_KEY) || "null");
    if (!value || !Array.isArray(value.batches) || !Array.isArray(value.publications)) return structuredClone(GRADE_IMPORT_EMPTY);
    return {
      batches: value.batches,
      publications: value.publications,
      revisions: Array.isArray(value.revisions) ? value.revisions : [],
      notifications: Array.isArray(value.notifications) ? value.notifications : [],
    };
  } catch {
    return structuredClone(GRADE_IMPORT_EMPTY);
  }
}

export function saveGradeStore(next) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(GRADE_IMPORT_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("plp-grade-imports-changed"));
  }
  return next;
}

function move(batch, status) {
  if (batch.status === status) return batch;
  return { ...batch, status, statusHistory: [...(batch.statusHistory || []), { status, at: now() }] };
}

function isSafeGrade(value) {
  return /^(?:\d+(?:\.\d{1,2})?|INC)$/i.test(text(value));
}

export function createGradeBatch(store, { scope, filename, rows, checksum }) {
  const info = { ...GRADE_IMPORT_SCOPE, ...scope };
  if (!filename || !checksum || !Array.isArray(rows) || !rows.length) return { ok: false, message: "Choose a valid, nonempty grade file." };
  if (rows.length > 1500) return { ok: false, message: "This demo supports at most 1,500 grade rows per file." };
  if (!text(info.sourceReference) || !text(info.facultyMember)) return { ok: false, message: "Faculty source and source verification reference are required." };
  if (store.batches.some((b) => b.checksum === checksum && b.status !== "CANCELLED")) return { ok: false, message: "This file already has an import batch. Open its existing review." };
  const at = now();
  const batch = {
    id: identifier("GIB"), reference: identifier("IMP"), scope: info, filename,
    checksum, rows: rows.map((row, index) => ({ ...row, rowNumber: index + 2, issues: [] })),
    status: GRADE_IMPORT_STATUSES.UPLOADED, statusHistory: [{ status: "UPLOADED", at }],
    createdAt: at, uploadedBy: "Registrar demo account", verified: null,
    validatedChecksum: null, validatedAt: null, counts: null,
    publishedAt: null, publicationReference: null,
  };
  return { ok: true, batch, next: { ...store, batches: [batch, ...store.batches] } };
}

const issue = (code, message, severity = "BLOCK") => ({ code, message, severity });

export function validateGradeBatch(store, batchId, students, attempts = MOCK_CONFIRMED_ATTEMPTS) {
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch || !["UPLOADED", "NEEDS_CORRECTION", "VALIDATED", "READY_TO_PUBLISH"].includes(batch.status)) return { ok: false, message: "This import cannot be validated in its current state." };
  const latestPublished = new Set(store.publications.map((p) => attemptKey(p)));
  const seen = new Set();
  let duplicateRows = 0; let conflictingRows = 0;
  const knownStudents = new Map(students.map((person) => [text(person.studentNumber), person]));
  const rows = batch.rows.map((row) => {
    const issues = [];
    const values = Object.fromEntries(GRADE_IMPORT_HEADERS.map((header) => [header, text(row[header])]));
    for (const header of GRADE_IMPORT_HEADERS) {
      if (!values[header]) issues.push(issue("GI01", `Missing required field: ${header}`));
      if (/^[=+@]/.test(values[header])) issues.push(issue("GI01", `Unsafe spreadsheet expression in ${header}`));
    }
    const studentId = values.student_number;
    if (!/^[0-9][0-9-]*$/.test(studentId)) issues.push(issue("GI03", "Student number format is invalid."));
    const student = knownStudents.get(studentId);
    if (!student) issues.push(issue("GI03", "Student number was not found in demo student records."));
    if (student?.studentStatus !== "ACTIVE") issues.push(issue("GI03", "Student record is not active."));
    if (student && text(student.fullName).toLowerCase() !== values.student_full_name.toLowerCase())
      issues.push(issue("GI12", `Name differs from student record: ${student.fullName}`, "WARN"));
    if (values.subject_code !== batch.scope.subjectCode || values.academic_year !== batch.scope.academicYear ||
        values.semester !== batch.scope.semester || values.section_code !== batch.scope.sectionCode ||
        values.Subject_name !== batch.scope.subjectName) issues.push(issue("GI05", "Subject, term, section or subject name differs from selected batch scope."));
    if (batch.scope.academicYear !== GRADE_IMPORT_SCOPE.academicYear || batch.scope.semester !== GRADE_IMPORT_SCOPE.semester ||
        batch.scope.subjectCode !== GRADE_IMPORT_SCOPE.subjectCode || batch.scope.sectionCode !== GRADE_IMPORT_SCOPE.sectionCode ||
        batch.scope.program !== GRADE_IMPORT_SCOPE.program) issues.push(issue("GI02", "Batch scope has no configured historical offering."));
    if (student && student.program !== batch.scope.program) issues.push(issue("GI02", "Student program differs from import offering."));
    const attempt = attempts.find((entry) => entry.studentNumber === studentId && entry.academicYear === values.academic_year &&
      entry.semester === values.semester && entry.subjectCode === values.subject_code && entry.sectionCode === values.section_code && entry.status === "CONFIRMED");
    if (!attempt) issues.push(issue("GI04", "No matching explicitly confirmed enrollment subject attempt was found."));
    if (!["COMPLETED", "FAILED", "INCOMPLETE"].includes(values.completion_status)) issues.push(issue("GI06", "Completion status must be COMPLETED, FAILED or INCOMPLETE."));
    if (!isSafeGrade(values.grade_value)) issues.push(issue("GI07", "Grade must use a source grade string (example: 1.75 or INC); no pass threshold is inferred."));
    const key = attemptKey(row);
    if (seen.has(key)) { duplicateRows++; issues.push(issue("GI08", "Duplicate student subject attempt within this file.")); }
    seen.add(key);
    if (latestPublished.has(key)) { conflictingRows++; issues.push(issue("GI09", "A published result exists for this attempt. Use a controlled amendment.")); }
    if (batch.scope.semester === "Second Semester" && batch.scope.academicYear === "2025 to 2026")
      issues.push(issue("GI13", "Historical batch for demonstration; confirm local policy before genuine institutional use.", "WARN"));
    return { ...row, ...values, issues };
  });
  const blocking = rows.filter((row) => row.issues.some((entry) => entry.severity === "BLOCK")).length;
  const warnings = rows.filter((row) => row.issues.some((entry) => entry.severity === "WARN")).length;
  const counts = { totalRows: rows.length, validRows: rows.length - blocking, warningRows: warnings, invalidRows: blocking, duplicateRows, conflictingRows };
  const intermediate = move(batch, "VALIDATING");
  let updated = move({ ...intermediate, rows, counts, validatedChecksum: batch.checksum, validatedAt: now(), verified: null }, blocking ? "NEEDS_CORRECTION" : "VALIDATED");
  const next = { ...store, batches: store.batches.map((b) => b.id === batchId ? updated : b) };
  return { ok: blocking === 0, batch: updated, next, message: blocking ? `${blocking} row(s) contain blocking validation issues.` : `Validated ${rows.length} row(s). Review warnings and confirm the simulated source.` };
}

export function replaceGradeBatch(store, batchId, { filename, rows, checksum }) {
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch || !["UPLOADED", "NEEDS_CORRECTION", "VALIDATED", "READY_TO_PUBLISH", "FAILED"].includes(batch.status))
    return { ok: false, message: "Published and cancelled imports cannot have their files replaced." };
  if (!rows?.length || !checksum || rows.length > 1500) return { ok: false, message: "Select a nonempty grade file within the 1,500 row demo limit." };
  const updated = move({ ...batch, filename, checksum, rows: rows.map((row, index) => ({ ...row, rowNumber: index + 2, issues: [] })), validatedChecksum: null, validatedAt: null, counts: null, verified: null }, "UPLOADED");
  return { ok: true, next: { ...store, batches: store.batches.map((b) => b.id === batchId ? updated : b) }, message: "File replaced. Validation and simulated source verification must be repeated." };
}

export function verifyGradeBatch(store, batchId, { method, confirmed }) {
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch || batch.status !== "VALIDATED" || !batch.counts || batch.counts.invalidRows || batch.validatedChecksum !== batch.checksum)
    return { ok: false, message: "First complete successful validation for the current file." };
  if (!confirmed || !text(method) || !text(batch.scope.sourceReference) || !text(batch.scope.facultyMember))
    return { ok: false, message: "Enter a verification method and confirm the demo source attestation." };
  const verified = { method: text(method), confirmed: true, facultyMember: batch.scope.facultyMember, sourceReference: batch.scope.sourceReference, verifiedAt: now(), demo: true };
  const updated = move({ ...batch, verified }, "READY_TO_PUBLISH");
  return { ok: true, next: { ...store, batches: store.batches.map((b) => b.id === batchId ? updated : b) }, message: "Simulated source verification recorded. Batch is ready for review." };
}

export function publishGradeBatch(store, batchId, students, attempts = MOCK_CONFIRMED_ATTEMPTS) {
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch || batch.status !== "READY_TO_PUBLISH" || !batch.verified?.confirmed || !batch.counts ||
      batch.validatedChecksum !== batch.checksum || batch.counts.invalidRows || !batch.rows.length)
    return { ok: false, message: "Publish blocked: validation, checksum or simulated source verification is missing." };
  const check = validateGradeBatch(
    { ...store, batches: store.batches.map((b) => b.id === batchId ? { ...b, status: "VALIDATED" } : b) },
    batchId, students, attempts,
  );
  if (!check.ok || check.batch.counts.invalidRows) return { ok: false, message: "Batch data changed or a published result conflicts. Revalidate before trying again." };
  const at = now();
  const reference = identifier("PUB");
  const staging = move(batch, "PUBLISHING");
  const published = move({ ...staging, publicationReference: reference, publishedAt: at }, "PUBLISHED");
  const publications = batch.rows.map((row) => ({
    id: identifier("GRADE"), batchId, publicationReference: reference, studentNumber: row.student_number,
    studentName: row.student_full_name, academicYear: row.academic_year, semester: row.semester,
    subjectCode: row.subject_code, subjectName: row.Subject_name, sectionCode: row.section_code,
    gradeValue: text(row.grade_value), completionStatus: row.completion_status, sourceRecordReference: row.source_record_reference,
    publishedAt: at, version: 1, current: true,
  }));
  const notices = [...new Set(publications.map((item) => item.studentNumber))].flatMap((studentNumber) => [
    { id: identifier("GN"), studentNumber, batchId, title: "Official Academic Results Available", message: "Your demo academic results are available in Academic Records.", date: at, category: "Academic", read: false, relatedHref: "/student/academic-records" },
    { id: identifier("GN"), studentNumber, batchId, title: "Academic Eligibility Updated", message: "Your demo academic eligibility has been recalculated using published completion statuses.", date: at, category: "Academic", read: false, relatedHref: "/student/enrollment" },
  ]);
  return { ok: true, publicationReference: reference, message: `Published ${publications.length} simulated academic result(s) to matched students.`,
    next: { ...store, batches: store.batches.map((b) => b.id === batchId ? published : b), publications: [...store.publications, ...publications], notifications: [...notices, ...store.notifications] } };
}

export function cancelGradeBatch(store, batchId, reason) {
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch || ["PUBLISHED", "CANCELLED", "PUBLISHING"].includes(batch.status) || !text(reason))
    return { ok: false, message: "This batch cannot be cancelled, or a cancellation reason is missing." };
  const updated = move({ ...batch, cancellationReason: text(reason) }, "CANCELLED");
  return { ok: true, next: { ...store, batches: store.batches.map((b) => b.id === batchId ? updated : b) }, message: "Unpublished import cancelled and retained in history." };
}

export function amendGradeResult(store, details) {
  const { batchId, studentNumber, gradeValue, completionStatus, sourceReference, reason, method, confirmed } = details;
  const batch = store.batches.find((b) => b.id === batchId);
  const previous = store.publications.find((item) => item.batchId === batchId && item.studentNumber === studentNumber);
  if (!batch || batch.status !== "PUBLISHED" || !previous || !confirmed || !text(reason) || !text(method) ||
      !text(sourceReference) || !isSafeGrade(gradeValue) || !["COMPLETED", "FAILED", "INCOMPLETE"].includes(completionStatus) ||
      sourceReference === previous.sourceRecordReference) return { ok: false, message: "Valid corrected source evidence, reason and changed source reference are required." };
  const at = now();
  const revised = { ...previous, gradeValue: text(gradeValue), completionStatus, sourceRecordReference: text(sourceReference), version: previous.version + 1, amendedAt: at };
  const revision = { id: identifier("REV"), batchId, studentNumber, previousValue: previous.gradeValue, previousStatus: previous.completionStatus, newValue: revised.gradeValue, newStatus: revised.completionStatus, sourceReference, reason, method, at };
  const notice = { id: identifier("GN"), batchId, studentNumber, title: "Published Academic Result Corrected", message: "An authorized demo academic correction is now reflected in your Academic Records.", date: at, category: "Academic", read: false, relatedHref: "/student/academic-records" };
  return { ok: true, message: "Mock published result amended with revision history.", next: { ...store,
    publications: store.publications.map((item) => item.id === previous.id ? revised : item), revisions: [revision, ...store.revisions], notifications: [notice, ...store.notifications] } };
}

export function getStudentAcademicRecords(store, studentNumber) {
  return store.publications.filter((item) => item.studentNumber === studentNumber).map((item) => ({
    code: item.subjectCode, name: item.subjectName, term: `${item.semester} ${item.academicYear}`,
    academicYear: item.academicYear, semester: item.semester,
    status: item.completionStatus, grade: item.gradeValue, resultId: item.id,
    publicationReference: item.publicationReference, publishedAt: item.publishedAt, amendedAt: item.amendedAt,
  }));
}

export async function parseGradeFile(file) {
  if (!file || !/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Only .xlsx and .csv grade files are supported.");
  if (file.size > GRADE_IMPORT_MAX_FILE_BYTES) throw new Error("The demo grade file limit is 2 MB.");
  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes.slice(0, 4));
  let table;
  if (/\.xlsx$/i.test(file.name)) {
    if (!(signature[0] === 80 && signature[1] === 75 && signature[2] === 3 && signature[3] === 4))
      throw new Error("Invalid .xlsx file signature. Provide a genuine Excel workbook.");
    // Reject formulas before interpreting displayed cached values. The demo
    // deliberately accepts only a single static grading worksheet.
    const archive = unzipSync(new Uint8Array(bytes));
    const workbookXml = archive["xl/workbook.xml"];
    if (!workbookXml || (strFromU8(workbookXml).match(/<sheet\s/g) || []).length !== 1)
      throw new Error("Use a workbook containing exactly one grading sheet.");
    for (const [entryName, entry] of Object.entries(archive)) {
      if (entryName.startsWith("xl/worksheets/") && entryName.endsWith(".xml") &&
          /<(?:\w+:)?f(?:\s|>)/i.test(strFromU8(entry)))
        throw new Error("Spreadsheet formulas are not permitted in an official grade import.");
    }
    const sheets = await readXlsxFile(file);
    table = Array.isArray(sheets?.[0]?.data) ? sheets[0].data : sheets;
  } else {
    const contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    const parsed = Papa.parse(contents, { skipEmptyLines: "greedy" });
    if (parsed.errors.length) throw new Error(`Invalid CSV file: ${parsed.errors[0].message}`);
    table = parsed.data;
  }
  if (!table?.length) throw new Error("The grading sheet is empty.");
  const columns = (table[0] || []).map(text);
  const missing = GRADE_IMPORT_HEADERS.filter((header) => !columns.includes(header));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  if (new Set(columns).size !== columns.length) throw new Error("Duplicate spreadsheet headers are not allowed.");
  if (columns.length !== GRADE_IMPORT_HEADERS.length) throw new Error("Use exactly the ten specified import columns.");
  const rows = table.slice(1).filter((cells) => cells.some((value) => text(value))).map((cells) =>
    Object.fromEntries(GRADE_IMPORT_HEADERS.map((header) => [header, text(cells[columns.indexOf(header)])])));
  if (!rows.length) throw new Error("There are no grade records in this file.");
  if (rows.length > 1500) throw new Error("The demo supports at most 1,500 grade records.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { filename: file.name, rows, checksum };
}

export function downloadGradeTemplate() {
  const link = document.createElement("a");
  link.href = "/grade-import/PLP_Official_Grades_Import_Template.xlsx";
  link.download = "PLP_Official_Grades_Import_Template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
