import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildMockAcademicReferences } from "../academic/academic-reference.js";
import { buildBlockPlanningSeed } from "../block-planning/block-planning-seed.js";
import {
  buildAcademicReviewSummary, buildCapacityRows, buildProgramCurriculumRows,
  buildScheduleRows, buildSubjectPrerequisiteRows,
} from "./academic-reports.js";

function setup() {
  const catalog = JSON.parse(readFileSync(new URL("../../data/mock/catalog.json", import.meta.url), "utf8"));
  const references = buildMockAcademicReferences(catalog.subjects, catalog.programs);
  const plan = buildBlockPlanningSeed(references, references.curricula);
  return { references, plan };
}

test("capacity subtracts both proposed and confirmed once and preserves distinct registrar demand", () => {
  const { plan } = setup();
  const section = plan.blockSections.find((entry) => entry.termId === "2026-27-1");
  const sectionAssignments = plan.assignments.filter((item) => item.sectionId === section.id);
  assert.ok(sectionAssignments.length > 1);
  const promoted = new Set(sectionAssignments.slice(0, 2).map((item) => item.id));
  const modified = { ...plan, assignments: plan.assignments.map((item) =>
    promoted.has(item.id) ? { ...item, status: "CONFIRMED" } : item) };
  const capacity = buildCapacityRows(modified, { enrollments: [] }, "section")
    .find((entry) => entry.section === section.code && entry.termId === section.termId);
  assert.equal(capacity.confirmed, 2);
  assert.equal(capacity.proposed, sectionAssignments.length - 2);
  assert.equal(capacity.available, section.capacity - sectionAssignments.length);

  const subject = plan.subjectClasses.find((entry) => entry.sectionId === section.id).subjectCode;
  const demand = buildCapacityRows(modified, { enrollments: [
    { studentNumber: "s1", program: section.programCode, subjects: [{ code: subject }] },
    { studentNumber: "s1", program: section.programCode, subjects: [{ code: subject }] },
    { studentNumber: "s2", program: section.programCode, subjects: [{ code: subject }] },
  ] }, "subject").find((entry) => entry.termId === section.termId &&
    entry.program === section.programCode && entry.subject === subject);
  assert.equal(demand.registrarRequests, 2);
  assert.equal(demand.capacity, demand.proposed + demand.confirmed + demand.available);
});

test("program and subject reports use curriculum-specific prerequisite assignments", () => {
  const { references } = setup();
  const data = { curricula: references.curricula, offerings: [] };
  const programRows = buildProgramCurriculumRows(references, data);
  const curriculumRows = buildProgramCurriculumRows(references, data, "curriculum");
  const subjectRows = buildSubjectPrerequisiteRows(references, data);
  assert.equal(programRows.length, references.programs.length);
  assert.equal(curriculumRows.length, references.curricula.length);
  for (const curriculum of references.curricula) {
    const assigned = subjectRows.filter((item) => item.curriculum === curriculum.version);
    assert.equal(assigned.length, curriculum.assignments.length);
    assert.equal(assigned[0].prerequisites,
      curriculum.assignments[0].prerequisites?.join(", ") || "None");
  }
});

test("schedule report distinguishes published proposals, unscheduled drafts, and actual meeting conflicts", () => {
  const { plan } = setup();
  const rows = buildScheduleRows(plan);
  assert.ok(rows.some((entry) => entry.scheduleStatus === "Published proposal" &&
    entry.conflictStatus === "No detected conflicts"));
  assert.ok(rows.some((entry) => entry.scheduleStatus === "Draft" && entry.conflictStatus === "Unscheduled"));
  const first = plan.classMeetings[0];
  const second = plan.classMeetings.find((item) => item.id !== first.id);
  const altered = { ...plan, classMeetings: [...plan.classMeetings,
    { ...second, id: "DEMO-CONFLICT", subjectClassId: second.subjectClassId,
      roomId: first.roomId, day: first.day, start: first.start, end: first.end }] };
  const conflictedRows = buildScheduleRows(altered);
  const firstClass = plan.subjectClasses.find((item) => item.id === first.subjectClassId);
  const firstSection = plan.blockSections.find((item) => item.id === firstClass.sectionId);
  assert.ok(conflictedRows.some((item) => item.section === firstSection.code &&
    item.termId === firstSection.termId && item.subject === firstClass.subjectCode &&
    item.conflictDetails.includes("Room overlap")));
});

test("returned reviews stay pending, applied is counted only when recorded", () => {
  const enrollments = [
    { program: "BSIT", status: "NEEDS_ACADEMIC_REVIEW" },
    { program: "BSIT", status: "NEEDS_ACADEMIC_REVIEW", academicReviewDecision: "RETURNED_FOR_CLARIFICATION" },
    { program: "BSIT", status: "FOR_VALIDATION", academicReviewDecision: "APPROVED" },
    { program: "BSIT", status: "REQUIRES_CORRECTION", academicReviewDecision: "REJECTED" },
    { program: "BSIT", status: "FOR_VALIDATION", academicReviewDecision: "APPLIED" },
  ];
  const [summary] = buildAcademicReviewSummary(enrollments);
  assert.deepEqual([summary.pending, summary.returned, summary.approved,
    summary.rejected, summary.applied, summary.total], [2, 1, 1, 1, 1, 5]);
  assert.equal(summary.pending + summary.approved + summary.rejected + summary.applied, summary.total);
});
