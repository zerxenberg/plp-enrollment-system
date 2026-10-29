import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProjectGradeBatches, filterProjectGradeReleases, paginateProjectGradeHistory,
  projectGradeBatchDisplayStatus,
} from "./project-grade-history.mjs";

const batches = [
  { id: "batch-a", file_name: "CP2_history.xlsx", subject_code: "CP2", source_system: "PROJECT_ONLY",
    source_reference: "FILE-2025-CP2", issuer: "Registrar", status: "CONFLICT_REVIEW" },
  { id: "batch-b", file_name: "Discrete.csv", subject_code: "DISCRETE", source_system: "PROJECT_ONLY",
    source_reference: "FILE-2025-DISCRETE", issuer: "Coordinator", status: "READY_FOR_REVIEW" },
  { id: "batch-c", file_name: "CN1_grades.xlsx", subject_code: "CN1", source_system: "PROJECT_ONLY",
    source_reference: "FILE-2025-CN1", issuer: "Registrar", status: "PUBLISHED_PROJECT",
    publication_reference: "PROJECT-GRADES-9" },
];

test("verified historical source is clearly labelled but remains unpublished until block release", () => {
  assert.deepEqual(projectGradeBatchDisplayStatus({ status: "READY_FOR_REVIEW", verified_at: "2026-10-26T12:10:33Z" }), {
    value: "VALIDATED", label: "Verified", detail: "Awaiting block publication",
  });
  assert.deepEqual(projectGradeBatchDisplayStatus({ status: "READY_FOR_REVIEW", verified_at: null }), {
    value: "READY_FOR_REVIEW", label: "Ready for verification", detail: "Evidence verification pending",
  });
  assert.deepEqual(projectGradeBatchDisplayStatus({ status: "CONFLICT_REVIEW", verified_at: null }), {
    value: "CONFLICT_REVIEW", label: "CONFLICT REVIEW", detail: null,
  });
  assert.deepEqual(projectGradeBatchDisplayStatus({ status: "PUBLISHED_PROJECT", verified_at: "2026-10-26T12:10:33Z" }), {
    value: "PUBLISHED_PROJECT", label: "PUBLISHED PROJECT", detail: null,
  });
  assert.deepEqual(projectGradeBatchDisplayStatus(null), {
    value: "NOT_STARTED", label: "NOT STARTED", detail: null,
  });
});

test("batch search covers file, ID, subject, source, reference, issuer and status case-insensitively", () => {
  assert.deepEqual(filterProjectGradeBatches(batches, "  "), batches);
  assert.deepEqual(filterProjectGradeBatches(batches, "  cp2_HIST  ").map((b) => b.id), ["batch-a"]);
  assert.deepEqual(filterProjectGradeBatches(batches, "batch-b").map((b) => b.id), ["batch-b"]);
  assert.deepEqual(filterProjectGradeBatches(batches, "file-2025-cn1").map((b) => b.id), ["batch-c"]);
  assert.deepEqual(filterProjectGradeBatches(batches, "CONFLICT_review").map((b) => b.id), ["batch-a"]);
  assert.deepEqual(filterProjectGradeBatches(batches, "coordinator").map((b) => b.id), ["batch-b"]);
  assert.equal(filterProjectGradeBatches(batches, "project_only").length, 3);
  assert.deepEqual(filterProjectGradeBatches(batches, "no match"), []);
});

test("historical grade batch search accepts academic display codes while retaining database identities", () => {
  const actual = [
    { id: "c", subject_code: "P8F26-BSCS-T02-M1", status: "UPLOADED" },
    { id: "i", subject_code: "P8F26-BSIT-T03-M1", status: "UPLOADED" },
    { id: "g", subject_code: "P8F26-GE-T02-1", status: "UPLOADED" },
  ];
  assert.deepEqual(filterProjectGradeBatches(actual, "CS 151"), [actual[0]]);
  assert.deepEqual(filterProjectGradeBatches(actual, "IT 201"), [actual[1]]);
  assert.deepEqual(filterProjectGradeBatches(actual, "GE 151"), [actual[2]]);
  assert.equal(actual[0].subject_code, "P8F26-BSCS-T02-M1");
});

test("batch search finds the displayed verified state without treating it as published", () => {
  const verified = { ...batches[1], verified_at: "2026-10-26T12:10:33Z" };
  assert.deepEqual(filterProjectGradeBatches([batches[0], verified], "verified"), [verified]);
  assert.deepEqual(filterProjectGradeBatches([verified], "awaiting block publication"), [verified]);
  assert.deepEqual(filterProjectGradeBatches([verified], "published"), []);
});

test("publication history search covers reference, status, block and batch IDs", () => {
  const releases = [
    { id: "r1", block_id: "block-a", term_id: "TERM-2025-2",
      publication_reference: "PROJECT-GRADES-ALPHA", status: "PUBLISHED_PROJECT", batch_ids: ["batch-a", "batch-b"] },
    { id: "r2", block_id: "block-b", term_id: "TERM-2026-1",
      publication_reference: "PROJECT-GRADES-BETA", status: "PUBLISHED_PROJECT", batch_ids: ["batch-c"] },
  ];
  assert.deepEqual(filterProjectGradeReleases(releases, "ALPHA").map((r) => r.id), ["r1"]);
  assert.deepEqual(filterProjectGradeReleases(releases, "batch-c").map((r) => r.id), ["r2"]);
  assert.deepEqual(filterProjectGradeReleases(releases, "block-a").map((r) => r.id), ["r1"]);
  assert.equal(filterProjectGradeReleases(releases, "published_project").length, 2);
  assert.deepEqual(filterProjectGradeReleases(releases, "missing"), []);
});

test("local pagination stays in bounds, preserves order, handles zero rows and partial last page", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
  assert.deepEqual(paginateProjectGradeHistory(rows, 1).items.map((row) => row.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(paginateProjectGradeHistory(rows, 2).items.map((row) => row.id), [9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(paginateProjectGradeHistory(rows, 3).items.map((row) => row.id), [17, 18, 19, 20]);
  assert.deepEqual(paginateProjectGradeHistory(rows, 300), {
    items: rows.slice(16), page: 3, totalPages: 3, totalItems: 20, start: 17, end: 20,
  });
  assert.equal(paginateProjectGradeHistory(rows, -2).page, 1);
  assert.deepEqual(paginateProjectGradeHistory([], 8), {
    items: [], page: 1, totalPages: 1, totalItems: 0, start: 0, end: 0,
  });
});

test("filter first, then paginate: page 1 shows only matching authorized records", () => {
  const permitted = Array.from({ length: 24 }, (_, index) => ({
    ...batches[index % batches.length], id: `batch-${index}`,
  }));
  const matches = filterProjectGradeBatches(permitted, "CONFLICT_REVIEW");
  const first = paginateProjectGradeHistory(matches, 1);
  assert.equal(first.totalItems, 8);
  assert.ok(first.items.every((batch) => batch.status === "CONFLICT_REVIEW"));
  assert.equal(paginateProjectGradeHistory(matches, 2).page, 1);
});
