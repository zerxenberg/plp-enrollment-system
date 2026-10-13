// Run with: node scripts/test-grade-import.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { File } from "node:buffer";
import { webcrypto } from "node:crypto";
import {
  GRADE_IMPORT_EMPTY, GRADE_IMPORT_SCOPE, GRADE_IMPORT_HEADERS,
  parseGradeFile, createGradeBatch, validateGradeBatch, replaceGradeBatch,
  verifyGradeBatch, publishGradeBatch, amendGradeResult, cancelGradeBatch,
  getStudentAcademicRecords, readGradeStore, saveGradeStore, GRADE_IMPORT_STORAGE_KEY,
} from "../src/features/grade-import/grade-import-service.js";

globalThis.crypto ||= webcrypto;
const registrar = JSON.parse(fs.readFileSync("src/data/mock/registrar.json", "utf8"));
const fixture = (name) => new File([fs.readFileSync(path.join("tests/grade-import", name))], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const valid = await parseGradeFile(fixture("PLP_Mock_Official_Student_Grades_Valid.xlsx"));
assert.equal(valid.rows.length, 3);
assert.deepEqual(Object.keys(valid.rows[0]), GRADE_IMPORT_HEADERS);
assert.equal(valid.rows[0].student_number, "2024-00123");
assert.equal(valid.rows[1].grade_value, "5.00");
assert.equal(valid.rows[2].completion_status, "INCOMPLETE");

const invalid = await parseGradeFile(fixture("PLP_Mock_Official_Student_Grades_Invalid.xlsx"));
assert.equal(invalid.rows.length, 7);
let store = structuredClone(GRADE_IMPORT_EMPTY);
const scope = { ...GRADE_IMPORT_SCOPE, sourceReference: "DEMO-FACULTY-REF-001" };
let result = createGradeBatch(store, { scope, ...valid });
assert.equal(result.ok, true);
store = result.next;
const batchId = result.batch.id;
assert.equal(result.batch.status, "UPLOADED");
assert.equal(store.publications.length, 0, "Upload must not publish");

result = validateGradeBatch(store, batchId, registrar.students);
assert.equal(result.ok, true);
assert.equal(result.batch.status, "VALIDATED");
assert.deepEqual(result.batch.counts, { totalRows: 3, validRows: 3, warningRows: 3, invalidRows: 0, duplicateRows: 0, conflictingRows: 0 });
store = result.next;
assert.equal(verifyGradeBatch(store, batchId, { method: "Demo attestation", confirmed: false }).ok, false);
assert.equal(publishGradeBatch(store, batchId, registrar.students).ok, false, "Missing verification must block publication");
result = verifyGradeBatch(store, batchId, { method: "Simulated faculty source check", confirmed: true });
assert.equal(result.ok, true);
store = result.next;
assert.equal(store.batches[0].status, "READY_TO_PUBLISH");
result = publishGradeBatch(store, batchId, registrar.students);
assert.equal(result.ok, true);
store = result.next;
assert.equal(store.publications.length, 3);
assert.equal(store.notifications.length, 6);
assert.equal(store.batches[0].status, "PUBLISHED");
assert.equal(publishGradeBatch(store, batchId, registrar.students).ok, false, "Repeat publication must be blocked");
assert.equal(getStudentAcademicRecords(store, "2024-00123")[0].grade, "1.75");
assert.equal(getStudentAcademicRecords(store, "2024-00123")[0].status, "COMPLETED");
assert.equal(getStudentAcademicRecords(store, "2026-01896")[0].status, "FAILED");
assert.equal(getStudentAcademicRecords(store, "2026-00108")[0].status, "INCOMPLETE");
assert.equal(getStudentAcademicRecords(store, "2024-02211").length, 0, "Unrelated student's records must be excluded");

const collision = createGradeBatch(store, { scope: { ...scope, sourceReference: "SECOND-SOURCE" }, filename: "second.xlsx", rows: valid.rows, checksum: "new-unique-file-checksum" });
assert.equal(collision.ok, true);
const collisionValidation = validateGradeBatch(collision.next, collision.batch.id, registrar.students);
assert.equal(collisionValidation.ok, false);
assert.equal(collisionValidation.batch.counts.conflictingRows, 3);

const invalidCreated = createGradeBatch(structuredClone(GRADE_IMPORT_EMPTY), { scope, ...invalid });
assert.equal(invalidCreated.ok, true);
const invalidResult = validateGradeBatch(invalidCreated.next, invalidCreated.batch.id, registrar.students);
assert.equal(invalidResult.ok, false);
assert.equal(invalidResult.batch.status, "NEEDS_CORRECTION");
assert.ok(invalidResult.batch.counts.invalidRows >= 5);
assert.ok(invalidResult.batch.counts.duplicateRows >= 1);
const codes = new Set(invalidResult.batch.rows.flatMap((row) => row.issues.map((entry) => entry.code)));
for (const code of ["GI01", "GI03", "GI04", "GI05", "GI06", "GI08"]) assert.ok(codes.has(code), `Missing expected validation rule ${code}`);
assert.equal(verifyGradeBatch(invalidResult.next, invalidCreated.batch.id, { method: "Mock", confirmed: true }).ok, false);
assert.equal(publishGradeBatch(invalidResult.next, invalidCreated.batch.id, registrar.students).ok, false);
const replaced = replaceGradeBatch(invalidResult.next, invalidCreated.batch.id, valid);
assert.equal(replaced.ok, true);
assert.equal(replaced.next.batches[0].validatedChecksum, null, "Replacement must invalidate old validation");
assert.equal(publishGradeBatch(replaced.next, invalidCreated.batch.id, registrar.students).ok, false);
assert.equal(validateGradeBatch(replaced.next, invalidCreated.batch.id, registrar.students).ok, true);

const amended = amendGradeResult(store, {
  batchId, studentNumber: "2024-00123", gradeValue: "1.50", completionStatus: "COMPLETED",
  sourceReference: "CORRECTED-SOURCE-NEW", reason: "Corrected demo faculty record",
  method: "Simulated amended source verification", confirmed: true,
});
assert.equal(amended.ok, true);
assert.equal(getStudentAcademicRecords(amended.next, "2024-00123")[0].grade, "1.50");
assert.equal(amended.next.revisions.length, 1);
assert.equal(getStudentAcademicRecords(store, "2024-00123")[0].grade, "1.75", "Original snapshot must be preserved");
assert.equal(cancelGradeBatch(store, batchId, "testing").ok, false, "Published batch must be retained");

// Verify browser-local persistence semantics with a tiny browser storage stub.
const values = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  },
  dispatchEvent: () => {},
};
saveGradeStore(amended.next);
assert.equal(readGradeStore().publications.length, 3);
assert.equal(readGradeStore().revisions.length, 1);
assert.ok(values.has(GRADE_IMPORT_STORAGE_KEY));
saveGradeStore(structuredClone(GRADE_IMPORT_EMPTY));
assert.equal(readGradeStore().publications.length, 0, "Feature reset removes only import data");

const csv = [
  GRADE_IMPORT_HEADERS.join(","),
  GRADE_IMPORT_HEADERS.map((key) => valid.rows[0][key]).join(","),
].join("\n");
const csvFile = new File([csv], "demo.csv", { type: "text/csv" });
assert.equal((await parseGradeFile(csvFile)).rows.length, 1);
await assert.rejects(parseGradeFile(new File(["not an xlsx file"], "broken.xlsx")), /signature/);
console.log("PASS: XLSX and CSV parsing, 14-rule-compatible blocking checks, valid publication, conflicts, amendments, student isolation, reset, and persistence.");
