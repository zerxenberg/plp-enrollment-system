import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  admissionsPhase8CandidatesForBlock,
  admissionsPhase8RosterForBlock,
  admissionsPhase8TransferTargets,
  admissionsPhase8ReservationsByBlock,
  combinedPhase8Occupied,
  combinedPhase8Available,
  isAdmissionsPhase8Transferable,
  isAdmissionsPhase8Block,
} from "./coordinator-admissions-phase8-roster.mjs";
import { summarizeBlockOccupancy } from "./sections-schedules-live-summary.mjs";

const curricula = [
  { id: "P8F26-BSIT", isProjectOnly: true, provenance: "PROJECT_ONLY_FICTIONAL" },
  { id: "PLP-BSIT", isProjectOnly: false },
];
const block = { id: "phase8-a", code: "BSIT-1A", programCode: "BSIT", yearLevel: "1st Year",
  curriculumId: "P8F26-BSIT", termId: "TERM-2026-1", major: "", status: "PUBLISHED" };
const admissions = [
  { id: "admitted-1", name: "Admissions Student", programCode: "BSIT", yearLevel: 1,
    active: true, assignedBlockCode: "BSIT-1A" },
  { id: "admitted-2", name: "Transferee", programCode: "BSIT", yearLevel: "1st Year",
    active: true, assignedBlockCode: "BSIT-1B" },
  { id: "admitted-3", programCode: "BSIT", yearLevel: null, active: true },
  { id: "admitted-4", programCode: "BSCS", yearLevel: 1, active: true },
  { id: "admitted-5", programCode: "BSIT", yearLevel: "2nd Year", active: true },
];

test("Only provenance-certified Phase8 blocks support Admissions demonstration assignment", () => {
  assert.equal(isAdmissionsPhase8Block(block, curricula), true);
  assert.equal(isAdmissionsPhase8Block({ ...block, curriculumId: "PLP-BSIT" }, curricula), false);
  assert.equal(isAdmissionsPhase8Block({ ...block, curriculumId: "UNKNOWN" }, curricula), false);
});

test("Admissions candidates and joined roster are scoped by actual program and year", () => {
  assert.deepEqual(admissionsPhase8CandidatesForBlock(admissions, block).map((row) => row.id),
    ["admitted-1", "admitted-2"]);
  assert.deepEqual(admissionsPhase8RosterForBlock(admissions, block).map((row) => row.id),
    ["admitted-1"]);
  assert.deepEqual(admissionsPhase8RosterForBlock(
    [{ ...admissions[0], assignedBlockId: "other-block" }], block), []);
  assert.deepEqual(admissionsPhase8RosterForBlock(
    [{ ...admissions[0], yearLevel: 2 }], block).map((row) => row.id),
  ["admitted-1"], "an existing placement remains visible if source year changes");
});

test("Admissions transfer targets preserve protected project term, curriculum, program and year", () => {
  const target = { ...block, id: "phase8-b", code: "BSIT-1B" };
  const variants = [
    target,
    { ...target, id: "wrong-term", termId: "TERM-2025-2" },
    { ...target, id: "wrong-year", yearLevel: "2nd Year" },
    { ...target, id: "wrong-curriculum", curriculumId: "PLP-BSIT" },
    { ...target, id: "archived", status: "ARCHIVED" },
    { ...target, id: "draft", status: "DRAFT" },
  ];
  assert.deepEqual(admissionsPhase8TransferTargets([block, ...variants], block, curricula)
    .map((row) => row.id), ["phase8-b"]);
});

test("Registrar validated and confirmed demonstration placements are not manually transferable", () => {
  assert.equal(isAdmissionsPhase8Transferable({ active: true, assignedStatus: "PROPOSED" }), true);
  assert.equal(isAdmissionsPhase8Transferable({ active: true, assignedStatus: "RETURNED" }), true);
  assert.equal(isAdmissionsPhase8Transferable({ active: true, assignedStatus: "SUBMITTED" }), false);
  assert.equal(isAdmissionsPhase8Transferable({ active: true, assignedStatus: "VALIDATED" }), false);
  assert.equal(isAdmissionsPhase8Transferable({ active: true, assignedStatus: "CONFIRMED_SIMULATION" }), false);
});

test("Admissions reservations include active demonstration lifecycle states only", () => {
  const variants = ["PROPOSED", "SUBMITTED", "VALIDATED", "RETURNED", "CONFIRMED_SIMULATION",
    "CANCELLED", "REJECTED", "ARCHIVED", null];
  const people = variants.map((assignedStatus, i) => ({
    id: `student-${i}`, assignedBlockId: block.id, assignedStatus,
    active: i !== 0,
  }));
  const byBlock = admissionsPhase8ReservationsByBlock(people, [block], curricula);
  assert.equal(byBlock.get(block.id), 5,
    "a disabled student account does not erase a still-reserved demonstration seat");
  assert.equal(people.length, variants.length, "the original Admissions rows are unchanged");
});

test("Admissions seat count deduplicates students and uses explicit block UUID before code", () => {
  const second = { ...block, id: "phase8-b", code: "BSIT-1B" };
  const people = [
    { id: "admission-1", assignedStatus: "PROPOSED", assignedBlockId: second.id,
      assignedBlockCode: block.code },
    { id: "admission-1", assignedStatus: "SUBMITTED", assignedBlockId: second.id },
    { id: "admission-2", assignedStatus: "RETURNED", assignedBlockCode: block.code },
    { id: "admission-3", assignedStatus: "PROPOSED", assignedBlockId: "official-block" },
  ];
  const counts = admissionsPhase8ReservationsByBlock(people, [block, second], curricula);
  assert.equal(counts.get(block.id), 1);
  assert.equal(counts.get(second.id), 1);
  assert.equal(people[0].assignedBlockCode, block.code);
});

test("Project capacity counts never include unknown or ambiguous legacy block codes", () => {
  const duplicateCode = { ...block, id: "phase8-other-term" };
  const official = { ...block, id: "official", curriculumId: "PLP-BSIT" };
  const records = [{ id: "student-1", assignedStatus: "VALIDATED", assignedBlockCode: block.code }];
  const counts = admissionsPhase8ReservationsByBlock(records, [block, duplicateCode, official], curricula);
  assert.equal(counts.get(block.id), 0);
  assert.equal(counts.get(duplicateCode.id), 0);
  assert.equal(counts.has(official.id), false);
});

test("40-seat P8F26 block with 12 fictional proposals plus one Admissions reservation has 27 available", () => {
  const admissionsReservations = admissionsPhase8ReservationsByBlock([
    { id: "admitted-1", assignedStatus: "PROPOSED", assignedBlockId: block.id },
  ], [block], curricula).get(block.id);
  const occupied = combinedPhase8Occupied(12, admissionsReservations);
  assert.equal(admissionsReservations, 1);
  assert.equal(occupied, 13);
  assert.equal(combinedPhase8Available(40, occupied), 27);
  assert.equal(combinedPhase8Available(40, combinedPhase8Occupied(12, 0)), 28);
});

test("A confirmed Admissions demonstration keeps a separate seat from twelve original Phase8 proposals", () => {
  const projectStudents = Array.from({ length: 12 }, (_, index) => ({
    id: `fictional-${index}`, studentNumber: `26-500${index + 37}`,
  }));
  const projectAssignments = projectStudents.map((person) => ({
    studentId: person.id, sectionId: block.id, status: "PROPOSED",
  }));
  projectAssignments.push({
    studentId: "transferred-fictional-student", sectionId: block.id, status: "TRANSFERRED",
  });
  const original = summarizeBlockOccupancy(
    [{ ...block, capacity: 40 }], projectAssignments, projectStudents, []);
  const confirmedDemo = {
    id: "admissions-student", studentNumber: "DEMO-ADMISSIONS-01", programCode: "BSIT",
    yearLevel: 1, assignedBlockId: block.id, assignedStatus: "CONFIRMED_SIMULATION",
    active: true,
  };
  const admissionsRows = [confirmedDemo, {
    ...confirmedDemo, id: "cancelled-admissions", assignedBlockId: null,
    assignedStatus: "CANCELLED",
  }];
  const admissionsCount = admissionsPhase8ReservationsByBlock(admissionsRows, [block], curricula);
  const occupied = combinedPhase8Occupied(original.get(block.id).occupied, admissionsCount.get(block.id));
  assert.deepEqual(original.get(block.id), {
    proposed: 12, confirmed: 0, occupied: 12, available: 28,
  });
  assert.deepEqual(admissionsPhase8RosterForBlock(admissionsRows, block).map((row) => row.studentNumber),
    ["DEMO-ADMISSIONS-01"],
    "the roster remains an independently labeled Admissions source");
  assert.equal(admissionsCount.get(block.id), 1,
    "only the confirmed Admissions demonstration reserves a seat");
  assert.equal(occupied, 13);
  assert.equal(combinedPhase8Available(40, occupied), 27);
  assert.equal(isAdmissionsPhase8Transferable(confirmedDemo), false);
  assert.equal(combinedPhase8Occupied(12, null), null,
    "no dashboard may show an optimistic capacity while the Admissions source is unavailable");
});

test("Unknown reservations never default to zero or advertise available places", () => {
  assert.equal(combinedPhase8Occupied(12, null), null);
  assert.equal(combinedPhase8Occupied(12, undefined), null);
  assert.equal(combinedPhase8Available(40, null), null);
  assert.equal(combinedPhase8Available(40, combinedPhase8Occupied(12, 50)), 0);
});

test("Coordinator UI wires verified Admissions actions without touching synthetic preview", () => {
  const component = readFileSync(new URL("../../components/academic-coordinator/AcademicCoordinatorSectionsSchedules.js",
    import.meta.url), "utf8");
  assert.match(component, /listAdmissionsPhase8Candidates/);
  assert.match(component, /assignAdmissionsPhase8Demo/);
  assert.match(component, /isAdmissionsPhase8Block/);
  assert.match(component, /Admissions demonstration roster/);
  assert.match(component, /const admissionsDetailRoster = admissionsVisible && Array\.isArray\(admissionsCapacityStudents\)/);
  assert.match(component, /Admissions Demonstration Roster/);
  assert.match(component, /label: "Demonstration Status"/);
  assert.match(component, /Original Project Roster/);
  assert.match(component, /Original confirmed/);
  assert.match(component, /Assign Admissions Student/);
  assert.match(component, /Transfer Admissions Student/);
  assert.match(component, /isLive && !isSyntheticDemo/);
  assert.match(component, /assignBlockStudents\(\{ sectionId, studentIds \}\)/);
  assert.match(component, /transferBlockStudent\(\{ studentId: transferId/);
  const dashboard = readFileSync(new URL("../../components/academic-coordinator/AcademicCoordinatorDashboard.js",
    import.meta.url), "utf8");
  assert.match(dashboard, /listAdmissionsPhase8Candidates\(\)/);
  assert.match(dashboard, /admissionsPhase8ReservationsByBlock\(admissionsStudents, planningSections, curricula\)/);
  assert.match(dashboard, /combinedPhase8Occupied\(original, admissionsReservations\?\.get\(item\.id\) \?\? null\)/);
  assert.match(dashboard, /capacityPending \? capacityLabel : value/);
});
