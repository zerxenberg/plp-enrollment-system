import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scopeCoordinatorPhase8Records } from "../src/features/academic/coordinator-phase8-scope.mjs";

// Deterministic, invented examples with real database column names. The helper
// must derive membership from the authorized project block-roster RPC, not
// from locally guessed account origin or fixed production totals.
function makeFixture() {
  const termId = "TERM-TEST-P";
  const projectCurricula = ["P8F26-TEST-IT", "P8F26-TEST-CS"];
  const projectBlocks = ["block-p-it", "block-p-cs"];
  const projectSections = ["section-p-101", "section-p-102", "section-p-201"];
  const projectSubjectCodes = ["P8F26-TST101", "P8F26-TST102", "P8F26-TST201"];
  const projectStudentIds = ["student-p-01", "student-p-02", "student-p-03"];
  const oldBlocks = ["block-old-it", "block-old-cs"];
  const oldSections = ["section-old-101", "section-old-102"];
  const oldSubjectCodes = ["LEGACY101", "PLP101"];
  const oldStudentIds = ["student-old-01", "student-old-02"];
  const persons = projectStudentIds.map((id, i) => ({
    id,
    student_number: `project-number-${i}`,
    full_name: `Fictional Student ${i}`,
  }));
  const raw = {
    curricula: [
      ...projectCurricula.map((code, i) => ({
        code, program_code: i === 0 ? "BSIT" : "BSCS", status: "Draft",
      })),
      { code: "CUR-DEMO-IT", program_code: "BSIT", status: "Draft" },
      { code: "CUR-ORDINARY-IT", program_code: "BSIT", status: "Active" },
    ],
    subjects: [...projectSubjectCodes, ...oldSubjectCodes].map((code) => ({
      code, name: code, status: "Active",
    })),
    placements: [
      ...projectSubjectCodes.map((subject_code, i) => ({
        curriculum_code: projectCurricula[i === 2 ? 1 : 0],
        subject_code, year_level: "1st Year",
        semester: i === 1 ? "Second Semester" : "First Semester",
      })),
      { curriculum_code: "CUR-DEMO-IT", subject_code: oldSubjectCodes[0] },
      { curriculum_code: "CUR-ORDINARY-IT", subject_code: oldSubjectCodes[1] },
    ],
    prerequisites: [
      { curriculum_code: projectCurricula[0], subject_code: projectSubjectCodes[1],
        prerequisite_subject_code: projectSubjectCodes[0], is_active: true },
      { curriculum_code: "CUR-DEMO-IT", subject_code: oldSubjectCodes[0],
        prerequisite_subject_code: oldSubjectCodes[1], is_active: true },
    ],
    blocks: [
      ...projectBlocks.map((id, i) => ({
        id, code: `BLOCK-P-${i}`, curriculum_code: projectCurricula[i],
        term_id: termId, program_code: i === 0 ? "BSIT" : "BSCS",
        program_track_code: null, year_level: 1,
        is_synthetic_demo: true, planning_status: "DRAFT",
      })),
      ...oldBlocks.map((id, i) => ({
        id, code: `BLOCK-OLD-${i}`, curriculum_code: "CUR-DEMO-IT",
        term_id: termId, program_code: "BSIT",
        is_synthetic_demo: true, planning_status: "DRAFT",
      })),
    ],
    joins: [
      { block_id: projectBlocks[0], section_id: projectSections[0] },
      { block_id: projectBlocks[0], section_id: projectSections[1] },
      { block_id: projectBlocks[1], section_id: projectSections[2] },
      { block_id: oldBlocks[0], section_id: oldSections[0] },
      { block_id: oldBlocks[1], section_id: oldSections[1] },
    ],
    sections: [
      ...projectSections.map((id, i) => ({
        id, subject_code: projectSubjectCodes[i], term_id: termId,
        schedule_status: "DRAFT", is_synthetic_demo: true,
      })),
      ...oldSections.map((id, i) => ({
        id, subject_code: oldSubjectCodes[i], term_id: termId,
        schedule_status: "DRAFT", is_synthetic_demo: true,
      })),
    ],
    meetings: [
      ...projectSections.map((section_id, i) => ({
        id: `meeting-p-${i}`, section_id,
        room_id: `room-p-${i}`, meeting_status: "ACTIVE",
      })),
      ...oldSections.map((section_id, i) => ({
        id: `meeting-old-${i}`, section_id,
        room_id: "room-old", meeting_status: "ACTIVE",
      })),
    ],
    sectionInstructors: [
      ...projectSections.map((section_id, i) => ({
        section_id, instructor_id: `prof-p-${i}`,
      })),
      { section_id: oldSections[0], instructor_id: "prof-old" },
    ],
    instructors: [
      ...projectSections.map((_, i) => ({ id: `prof-p-${i}` })),
      { id: "prof-old" },
    ],
    rooms: [
      ...projectSections.map((_, i) => ({ id: `room-p-${i}` })),
      { id: "room-old" },
    ],
    terms: [{ id: termId, status: "Open" }, { id: "TERM-OLD", status: "Closed" }],
    students: [
      ...persons,
      ...oldStudentIds.map((id, i) => ({
        id, student_number: `legacy-number-${i}`, full_name: "Historical synthetic person",
      })),
    ],
    roster: [
      ...projectStudentIds.map((student_id, i) => ({
        id: `roster-p-${i}`, student_id,
        block_id: projectBlocks[i === 2 ? 1 : 0], term_id: termId,
        status: "PROPOSED", is_synthetic_demo: true,
      })),
      ...oldStudentIds.map((student_id, i) => ({
        id: `roster-old-${i}`, student_id,
        block_id: oldBlocks[i], term_id: termId,
        status: "CANCELLED", is_synthetic_demo: true,
      })),
    ],
    enrollments: [
      { id: "enrollment-old", student_id: oldStudentIds[0],
        curriculum_code: "CUR-DEMO-IT", status: "CONFIRMED" },
      { id: "enrollment-cross", student_id: projectStudentIds[0],
        curriculum_code: "CUR-ORDINARY-IT", status: "CONFIRMED" },
    ],
    enrollmentSubjects: [
      { enrollment_id: "enrollment-old", subject_code: oldSubjectCodes[0] },
      { enrollment_id: "enrollment-cross", subject_code: oldSubjectCodes[1] },
    ],
    reviews: [
      { id: "review-old", enrollment_id: "enrollment-old", review_status: "PENDING" },
      { id: "review-cross", enrollment_id: "enrollment-cross", review_status: "PENDING" },
    ],
    offerings: [
      { curriculum_code: projectCurricula[0], subject_code: projectSubjectCodes[0] },
      { curriculum_code: "CUR-DEMO-IT", subject_code: oldSubjectCodes[0] },
    ],
    history: [
      { id: "hist-project", record_reference: projectCurricula[0], action: "INSERT" },
      { id: "hist-old", record_reference: "CUR-DEMO-IT",
        reason: `This string mentions ${projectCurricula[0]}` },
    ],
    prices: [
      { subject_code: projectSubjectCodes[0], rate_per_unit: 50 },
      { subject_code: oldSubjectCodes[0], rate_per_unit: 100 },
    ],
    curriculumRates: [
      { curriculum_code: projectCurricula[0], subject_code: projectSubjectCodes[0], rate_per_unit: 50 },
      { curriculum_code: "CUR-DEMO-IT", subject_code: oldSubjectCodes[0], rate_per_unit: 100 },
    ],
    estimates: [
      { curriculum_code: projectCurricula[0], is_complete: false },
      { curriculum_code: "CUR-DEMO-IT", is_complete: false },
    ],
  };
  const provenance = [
    ...projectCurricula.map((curriculumCode) => ({
      curriculumCode, sourceType: "PROJECT_ONLY_FICTIONAL", isOfficial: false,
    })),
    { curriculumCode: "CUR-DEMO-IT", sourceType: "LEGACY_DEMO", isOfficial: true },
  ];
  const rosterSnapshots = projectBlocks.map((blockId, index) => ({
    blockId,
    students: persons.filter((person, i) => (i === persons.length - 1 ? 1 : 0) === index)
      .map((person) => ({
        student_id: person.id, student_number: person.student_number,
        full_name: person.full_name, year_level: 1,
      })),
  }));
  return {
    raw, provenance, rosterSnapshots, projectCurricula, projectSubjectCodes,
    projectStudentIds, projectBlocks, projectSections, oldBlocks, oldSections,
    oldStudentIds,
  };
}

function scope(fixture) {
  return scopeCoordinatorPhase8Records(
    fixture.raw, fixture.provenance, fixture.rosterSnapshots,
  );
}

function keys(rows, key) {
  return new Set(rows.map((row) => row[key]));
}

function sameSet(actual, expected) {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

test("only explicitly sourced fictional curricula and their subject masters are selected", () => {
  const fixture = makeFixture();
  const result = scope(fixture);
  sameSet(keys(result.curricula, "code"), new Set(fixture.projectCurricula));
  sameSet(keys(result.subjects, "code"), new Set(fixture.projectSubjectCodes));
  sameSet(keys(result.placements, "curriculum_code"), new Set(fixture.projectCurricula));
  const placed = new Set(result.placements
    .map((row) => `${row.curriculum_code}:${row.subject_code}`));
  assert.ok(result.prerequisites.every((row) =>
    placed.has(`${row.curriculum_code}:${row.subject_code}`) &&
    placed.has(`${row.curriculum_code}:${row.prerequisite_subject_code}`)));
  assert.equal(result.prerequisites.some((row) => row.curriculum_code === "CUR-DEMO-IT"), false);
  assert.deepEqual(result.offerings.map((row) => row.subject_code),
    [fixture.projectSubjectCodes[0]]);
  assert.deepEqual(result.history.map((row) => row.id), ["hist-project"]);
  assert.ok(result.prices.every((row) => keys(result.subjects, "code").has(row.subject_code)));
});

test("old synthetic rows do not enter Phase 8 blocks, meetings, instructors, or current rosters", () => {
  const fixture = makeFixture();
  const result = scope(fixture);
  assert.ok(fixture.raw.blocks.every((row) => row.is_synthetic_demo),
    "the same synthetic flag marks both current and historical planning");
  sameSet(keys(result.blocks, "id"), new Set(fixture.projectBlocks));
  sameSet(keys(result.sections, "id"), new Set(fixture.projectSections));
  sameSet(keys(result.students, "id"), new Set(fixture.projectStudentIds));
  const blockIds = keys(result.blocks, "id");
  const sectionIds = keys(result.sections, "id");
  const studentIds = keys(result.students, "id");
  assert.ok(result.joins.every((row) =>
    blockIds.has(row.block_id) && sectionIds.has(row.section_id)));
  assert.ok(result.meetings.every((row) => sectionIds.has(row.section_id)));
  assert.ok(result.sectionInstructors.every((row) => sectionIds.has(row.section_id)));
  assert.ok(result.instructors.every((row) =>
    keys(result.sectionInstructors, "instructor_id").has(row.id)));
  assert.ok(result.rooms.every((row) => keys(result.meetings, "room_id").has(row.id)));
  assert.ok(result.assignments.every((row) =>
    row.status === "PROPOSED" && blockIds.has(row.block_id) &&
    studentIds.has(row.student_id)));
  sameSet(keys(result.assignments, "student_id"), studentIds);
  for (const id of [...fixture.oldBlocks, ...fixture.oldSections, ...fixture.oldStudentIds]) {
    assert.equal(blockIds.has(id) || sectionIds.has(id) || studentIds.has(id), false);
  }
});

test("authoritative roster snapshots determine student identity, not student demo flags", () => {
  const fixture = makeFixture();
  const result = scope(fixture);
  assert.equal(result.memberById.size, fixture.projectStudentIds.length);
  for (const student of result.students) {
    const member = result.memberById.get(student.id);
    assert.equal(student.student_number, member.student_number);
    assert.ok(fixture.projectBlocks.includes(member.blockId));
    assert.ok(fixture.projectCurricula.includes(member.curriculumCode));
  }
  const inconsistent = makeFixture();
  inconsistent.raw.roster[0].block_id = inconsistent.oldBlocks[0];
  assert.throws(() => scope(inconsistent), /roster|placement|block|student/i);

  const forged = makeFixture();
  forged.rosterSnapshots[0].students.push({
    student_id: forged.oldStudentIds[0],
    student_number: "legacy-number-0", full_name: "Old planning student",
  });
  assert.throws(() => scope(forged), /roster|placement|student/i);
});

test("missing source provenance, incomplete curriculum subjects, and unauthorized rosters fail closed", () => {
  const missingProvenance = makeFixture();
  missingProvenance.provenance = [];
  assert.throws(() => scope(missingProvenance), /provenance/i);

  const missingSubject = makeFixture();
  missingSubject.raw.subjects = missingSubject.raw.subjects
    .filter((row) => row.code !== missingSubject.projectSubjectCodes[0]);
  assert.throws(() => scope(missingSubject), /subjects? (?:are|is) incomplete|project subjects/i);

  const unauthorizedBlock = makeFixture();
  unauthorizedBlock.rosterSnapshots[0].blockId = unauthorizedBlock.oldBlocks[0];
  assert.throws(() => scope(unauthorizedBlock), /unauthorized.*roster/i);

  const duplicatePerson = makeFixture();
  duplicatePerson.rosterSnapshots[1].students.push({
    ...duplicatePerson.rosterSnapshots[0].students[0],
  });
  assert.throws(() => scope(duplicatePerson), /overlapping block placements/i);
});

test("P8F26-looking identifiers without verified provenance are not trusted", () => {
  const fixture = makeFixture();
  const decoyCode = "P8F26-UNVERIFIED";
  const decoySubject = "P8F26-UNVERIFIED-101";
  fixture.raw.curricula.push({ code: decoyCode, status: "Draft" });
  fixture.raw.subjects.push({ code: decoySubject, status: "Active" });
  fixture.raw.placements.push({
    curriculum_code: decoyCode, subject_code: decoySubject,
  });
  fixture.raw.blocks.push({
    id: "block-unverified", curriculum_code: decoyCode,
    term_id: "TERM-TEST-P", is_synthetic_demo: true,
  });
  const result = scope(fixture);
  assert.equal(keys(result.curricula, "code").has(decoyCode), false);
  assert.equal(keys(result.subjects, "code").has(decoySubject), false);
  assert.equal(keys(result.blocks, "id").has("block-unverified"), false);
});

test("a project block pointing to an unrelated section fails closed instead of mixing schedules", () => {
  const fixture = makeFixture();
  fixture.raw.joins.push({
    block_id: fixture.projectBlocks[0], section_id: fixture.oldSections[0],
  });
  assert.throws(() => scope(fixture), /schedule links are incomplete/i);
});

test("the project view does not inherit official confirmed enrollments or unrelated reviews", () => {
  const result = scope(makeFixture());
  assert.deepEqual(result.enrollments, []);
  assert.deepEqual(result.enrollmentSubjects, []);
  assert.deepEqual(result.reviews, []);
});

test("project scoping is pure; Coordinator role gate remains and other portals are not wired to it", () => {
  const fixture = makeFixture();
  const originals = structuredClone({
    raw: fixture.raw,
    provenance: fixture.provenance,
    rosterSnapshots: fixture.rosterSnapshots,
  });
  scope(fixture);
  assert.deepEqual({
    raw: fixture.raw,
    provenance: fixture.provenance,
    rosterSnapshots: fixture.rosterSnapshots,
  }, originals, "shared source data must remain unchanged");

  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
  const loader = fs.readFileSync(
    path.join(root, "features/academic/live-academic-data.js"), "utf8");
  assert.match(loader, /getLiveSession\(\)/);
  assert.match(loader, /role !== "academic-coordinator"/);
  for (const portal of ["registrar", "student", "system-administrator"]) {
    const layout = fs.readFileSync(
      path.join(root, "app/(portal)", portal, "layout.js"), "utf8");
    assert.doesNotMatch(layout, /coordinator-phase8-scope/);
  }
});
