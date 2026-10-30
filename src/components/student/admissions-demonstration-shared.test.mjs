import test from "node:test";
import assert from "node:assert/strict";
import { admissionsDemonstrationSharedData } from "./admissions-demonstration-shared.mjs";
import { resolveClassScheduleView } from "./student-class-schedule-view.mjs";

const subject = {
  code: "IT 101", name: "Introduction to Computing", units: 3,
  section: "BSIT-1A", sectionId: "section-1", sectionStatus: "OPEN",
  eligibility: "ELIGIBLE_FOR_DEMONSTRATION", feeEstimate: 300,
  meetings: [{ day: "Monday", start: "08:00", end: "09:30",
    room: "BSIT ROOM 201", instructor: "Professor Demo" }],
};

function liveData(overrides = {}) {
  return {
    kind: "ready",
    student: { name: "MANGGI MIGUELITO JR.", number: "26-50604", type: "NEW_STUDENT",
      program: "BSIT", yearLevel: 1, classification: "PENDING_EVALUATION" },
    enrollment: { status: "NOT_STARTED" },
    term: { label: "First Semester 2026 to 2027", semester: "First Semester",
      academicYear: "2026 to 2027" },
    academic: { results: [], credits: [] },
    demonstration: {
      kind: "ready", projectOnly: true, verifiedInstitutionally: false,
      provenance: "PROJECT_ONLY_FICTIONAL", id: "demo-id", status: "PROPOSED",
      term: { label: "First Semester 2026 to 2027" },
      curriculum: { code: "P8F26-BSIT-V1", label: "Information Technology Curriculum 2026 - Version 1" },
      homeBlock: { code: "BSIT-1A" }, subjects: [subject],
      feeEstimate: { estimatedAmount: 300, totalUnits: 3, currency: "PHP",
        missingRateCount: 0, verifiedRateCount: 1 },
      canSubmit: true, blockingReasons: [],
    }, ...overrides,
  };
}

test("Admissions demonstration shares the existing student interface without rewriting identity or provenance", () => {
  const result = admissionsDemonstrationSharedData(liveData());
  assert.equal(result.enrollment.student.number, "26-50604");
  assert.equal(result.enrollment.student.curriculum, "Information Technology Curriculum 2026 - Version 1");
  assert.equal(result.enrollment.student.curriculumCode, "P8F26-BSIT-V1");
  assert.equal(result.enrollment.homeBlock, "BSIT-1A");
  assert.equal(result.enrollment.simulation.status, "PROPOSED");
  assert.equal(result.enrollment.officialStatus, "NOT_CONFIRMED");
  assert.equal(result.enrollment.proposedUnits, 3);
  assert.equal(result.enrollment.projectFeeEstimate.ratePerUnit, 100);
  assert.equal(result.enrollment.subjects[0].eligibility, "ELIGIBLE_FOR_DEMONSTRATION");
  assert.equal(result.proposedSchedule.source, "VERIFIED_PROJECT_PROPOSED_TIMETABLE");
  assert.equal(result.proposedSchedule.items[0].room, "BSIT ROOM 201");
  assert.equal(resolveClassScheduleView({ mode: "project",
    proposedSchedule: result.proposedSchedule }).kind, "proposed");
  assert.equal(result.registrationUrl, null);
});

test("Unverified demonstration sources are never adapted into project enrollment", () => {
  const data = liveData();
  data.demonstration.verifiedInstitutionally = true;
  assert.equal(admissionsDemonstrationSharedData(data), null);
  data.demonstration.verifiedInstitutionally = false;
  data.demonstration.provenance = "INSTITUTIONAL";
  assert.equal(admissionsDemonstrationSharedData(data), null);
});

test("No synthetic transfer credit or confirmed registration is inferred from a proposal", () => {
  const data = liveData();
  data.student.type = "TRANSFEREE";
  data.student.yearLevel = null;
  data.demonstration.kind = "blocked";
  data.demonstration.status = "UNASSIGNED";
  data.demonstration.subjects = [];
  data.demonstration.canSubmit = false;
  const result = admissionsDemonstrationSharedData(data);
  assert.equal(result.academic.transferCredits.length, 0);
  assert.equal(result.academic.previousResults.length, 0);
  assert.equal(result.projectSchedule, null);
  assert.equal(result.registrationUrl, null);
  assert.equal(result.enrollment.canSubmit, false);
});

test("Incomplete source meetings cannot be presented as a verified proposed timetable", () => {
  const data = liveData();
  data.demonstration.subjects[0] = {
    ...subject, meetings: [{ ...subject.meetings[0], room: null }],
  };
  data.demonstration.kind = "blocked";
  data.demonstration.blockingReasons = ["Phase 8 timetable has an incomplete room."];
  assert.equal(admissionsDemonstrationSharedData(data).proposedSchedule, null);
});

test("Academic Records uses the complete database curriculum without expanding current enrollment", () => {
  const data = liveData();
  data.demonstration.curriculumPlan = [
    { code: "IT 101", name: "Introduction to Computing", units: 3, yearLevel: 1, semester: "First Semester" },
    { code: "IT 201", name: "Data Structures", units: 3, yearLevel: 2, semester: "First Semester" },
  ];
  const result = admissionsDemonstrationSharedData(data);
  assert.equal(result.academic.curriculum.length, 2);
  assert.equal(result.academic.curriculum[1].yearLevel, 2);
  assert.equal(result.enrollment.subjects.length, 1);
  assert.equal(result.enrollment.proposedUnits, 3);
  assert.equal(result.enrollment.projectFeeEstimate.estimatedAmount, 300);
});

test("Only a fully verified confirmed snapshot provides registered subjects and the demo PDF", () => {
  const data = liveData();
  data.demonstration.status = "CONFIRMED_SIMULATION";
  data.demonstration.registration = {
    id: "demo-id", source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
    registrationSnapshotComplete: true, reference: "DEMO-REG",
    confirmedAt: "2026-10-30T00:00:00Z", units: 3,
    subjects: [{ ...subject }],
    items: [{ subject_code: "IT 101", day: "Monday", start: "08:00", end: "09:30" }],
    feeEstimate: { simulation_only: true, official: false, currency: "PHP",
      missingRateCount: 0, verifiedRateCount: 1, totalUnits: 3, estimatedAmount: 450 },
  };
  const result = admissionsDemonstrationSharedData(data);
  assert.equal(result.enrollment.confirmedRegistration.subjects.length, 1);
  assert.equal(result.projectSchedule.source, "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT");
  assert.equal(resolveClassScheduleView({ mode: "project",
    projectSchedule: result.projectSchedule }).kind, "registered");
  assert.equal(result.proposedSchedule, null);
  assert.equal(result.registrationUrl, "/api/student/admissions-demo-cor/demo-id");
  assert.equal(result.enrollment.confirmedRegistration.projectFeeEstimate.estimatedAmount, 450,
    "historical tuition must use the persisted confirmation, not today's 300-peso estimate");
  // Some saved snapshots keep meetings only in the top-level items array.
  // They remain fully registered when those items are verified by the server.
  data.demonstration.registration.subjects[0].meetings = [];
  const itemsOnly = admissionsDemonstrationSharedData(data);
  assert.equal(itemsOnly.projectSchedule.items.length, 1);
  assert.equal(itemsOnly.enrollment.confirmedRegistration.subjects[0].meetings.length, 1);
  data.demonstration.registration.subjects[0].section = null;
  assert.equal(admissionsDemonstrationSharedData(data).registrationUrl, null);
});
