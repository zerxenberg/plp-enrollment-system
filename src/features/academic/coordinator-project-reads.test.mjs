import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProjectAcademicReviewRows, paginateProjectAcademicHistory,
  scopeCoordinatorProjectPreview,
} from "./coordinator-project-reads.mjs";

test("project review scope excludes official nonproject review without hiding cohort cases", () => {
  const rows = [
    { id: "old", enrollments: { student_id: "original-student" } },
    { id: "project-a", enrollments: { student_id: "project-student" } },
    { id: "project-b", enrollments: { student_id: "project-student" } },
  ];
  assert.deepEqual(filterProjectAcademicReviewRows(rows, ["project-student"]).map((r) => r.id),
    ["project-a", "project-b"]);
  assert.deepEqual(filterProjectAcademicReviewRows(rows.slice(0, 1), ["project-student"]), []);
  assert.deepEqual(filterProjectAcademicReviewRows(rows, []), []);
});

test("project academic history counts and paging cannot include old UUID-keyed records", () => {
  const rows = [
    ...Array.from({ length: 34 }, (_, i) => ({ id: `p${i}`, module: i % 2 ? "Academic Setup" : "Sections & Schedules",
      record_reference: i % 2 ? "P8F26-BSIT-V1" : "project-section-uuid", action: "INSERT",
      occurred_at: "2026-10-23T04:00:00Z" })),
    { id: "legacy", module: "Sections & Schedules", record_reference: "legacy-section-uuid",
      action: "INSERT", occurred_at: "2026-10-24T04:00:00Z" },
    { id: "not-academic", module: "Admin", record_reference: "project-section-uuid",
      action: "INSERT", occurred_at: "2026-10-24T04:00:00Z" },
  ];
  const refs = new Set(["P8F26-BSIT-V1", "project-section-uuid"]);
  const pageOne = paginateProjectAcademicHistory(rows, refs, { page: 1 });
  const pageTwo = paginateProjectAcademicHistory(rows, refs, { page: 2 });
  assert.equal(pageOne.total, 34);
  assert.equal(pageOne.rows.length, 25);
  assert.equal(pageTwo.rows.length, 9);
  assert.ok([...pageOne.rows, ...pageTwo.rows].every((r) => r.id !== "legacy"));
  assert.deepEqual(pageOne.byModule, {
    "Academic Setup": 17, "Sections & Schedules": 17, "Academic Review": 0,
  });
  const found = paginateProjectAcademicHistory(rows, refs, { search: "BSIT", page: 1 });
  assert.equal(found.total, 17);
  assert.equal(found.byModule["Academic Setup"], 17);
  assert.equal(found.byModule["Sections & Schedules"], 0);
  assert.deepEqual(paginateProjectAcademicHistory(rows, new Set()).rows, []);
  assert.throws(() => paginateProjectAcademicHistory(rows, refs, { page: 0 }), /Invalid academic history page/);
});

test("Dashboard preview retains positive project audit references but never old alerts", () => {
  const input = {
    catalog: { subjects: [
      { code: "P8F26-S1", isProjectOnly: true },
      { code: "LEGACY-S1", isProjectOnly: false },
    ] },
    academicCoordinatorData: {
      curricula: [{ id: "P8F26-C1", isProjectOnly: true }, { id: "LEGACY-C1" }],
      history: [
        { id: "1", record: "P8F26-C1" }, { id: "2", record: "P8F26-S1" },
        { id: "3", record: "project-block" }, { id: "4", record: "project-section" },
        { id: "5", record: "project-meeting" }, { id: "6", record: "project-roster" },
        { id: "7", record: "legacy-section" },
      ],
    },
    blockPlanning: {
      blockSections: [
        { id: "project-block", termId: "TERM-2026-1", curriculumId: "P8F26-C1" },
        { id: "legacy-block", termId: "TERM-2026-1", curriculumId: "LEGACY-C1" },
      ],
      students: [{ id: "project-student", curriculumId: "P8F26-C1" }],
      subjectClasses: [
        { id: "project-block:project-section", sectionId: "project-block" },
        { id: "legacy-block:legacy-section", sectionId: "legacy-block" },
      ],
      classMeetings: [{ id: "project-meeting:project-block", subjectClassId: "project-block:project-section" }],
      assignments: [{ id: "project-roster", studentId: "project-student", sectionId: "project-block" }],
    },
    notifications: { "academic-coordinator": [
      { id: "legacy", title: "Old exception" },
      { id: "project", isProjectOnly: true, dataOrigin: "GENERATED_PROJECT" },
    ] },
  };
  const result = scopeCoordinatorProjectPreview(input);
  assert.deepEqual(result.academicCoordinatorData.history.map((row) => row.id),
    ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(result.notifications["academic-coordinator"].map((row) => row.id), ["project"]);
  assert.equal(input.academicCoordinatorData.history.length, 7);
  assert.equal(input.notifications["academic-coordinator"].length, 2);
});
