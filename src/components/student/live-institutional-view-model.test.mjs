import assert from "node:assert/strict";
import test from "node:test";
import {
  getInstitutionalAcademicHistory, getInstitutionalNextAction,
  getInstitutionalSchedule, isOfficiallyConfirmed,
  getAuthorizedDemonstration, getDemonstrationFee, getDemonstrationNextAction,
  getDemonstrationSchedule, getDemonstrationSubjects, isConfirmedDemonstrationRegistration,
  hasUnavailableDemonstration,
} from "./live-institutional-view-model.mjs";

const studentData = {
  kind: "ready",
  student: { number: "REAL-STUDENT", program: "BSIT" },
  term: { label: "2026 Academic Term" },
  academic: { isOfficialCurriculum: true, results: [], credits: [] },
  enrollment: { status: "IN_PROGRESS", subjects: [] },
  schedule: { kind: "awaiting", items: [] },
};

test("official enrollment requires a recorded Registrar confirmation date", () => {
  assert.equal(isOfficiallyConfirmed({ status: "CONFIRMED" }), false);
  assert.equal(isOfficiallyConfirmed({ status: "VALIDATED", confirmedAt: "2026-10-30" }), false);
  assert.equal(isOfficiallyConfirmed({ status: "CONFIRMED", confirmedAt: "2026-10-30" }), true);
});

test("a fictional reference curriculum prevents preparation or submission guidance", () => {
  const view = {
    ...studentData,
    student: { ...studentData.student, curriculumProvenance: "PROJECT_ONLY_FICTIONAL" },
    canSubmit: true,
    canPrepare: true,
    academic: { isOfficialCurriculum: false },
    enrollment: { status: "IN_PROGRESS", canSubmit: true },
  };
  assert.match(getInstitutionalNextAction(view).title, /curriculum approval/i);
  assert.match(getInstitutionalNextAction({
    ...view, student: { ...view.student, curriculumProvenance: "INSTITUTIONAL_CANDIDATE" },
  }).title, /academic validation/i);
});

test("proposed verified institutional meetings never become registered classes", () => {
  const data = {
    ...studentData,
    enrollment: { status: "SUBMITTED", subjects: [{ code: "IT101", name: "Programming", section: "BSIT-1M" }] },
    schedule: { kind: "proposed", items: [
      { subject_code: "IT101", day: 1, start: "08:00", end: "09:30", room: "R201" },
    ] },
  };
  const schedule = getInstitutionalSchedule(data);
  assert.equal(schedule.kind, "proposed");
  assert.equal(schedule.meetings.length, 1);
  assert.equal(schedule.meetings[0].section, "BSIT-1M");
  assert.equal(schedule.meetings[0].day, "Monday");
  assert.equal(schedule.meetings[0].start, "8:00 AM");
});

test("missing confirmation evidence prevents promotion of confirmed schedule", () => {
  const data = {
    ...studentData,
    enrollment: { status: "CONFIRMED" },
    schedule: { kind: "confirmed", items: [
      { subject_code: "IT101", day: 2, start: "10:00", end: "11:00" },
    ] },
  };
  assert.equal(getInstitutionalSchedule(data).kind, "awaiting");
  assert.equal(getInstitutionalSchedule({ ...data, enrollment: {
    status: "CONFIRMED", confirmedAt: "2026-10-30T11:00:00+08:00",
  } }).kind, "registered");
});

test("project-only schedules, meetings, and academic records are excluded", () => {
  const data = {
    ...studentData,
    enrollment: { status: "SUBMITTED" },
    schedule: { kind: "proposed", provenance: "GENERATED_PROJECT",
      items: [{ subject_code: "P8-IT101", day: 1, start: "08:00", end: "10:00" }] },
  };
  assert.deepEqual(getInstitutionalSchedule(data), { kind: "awaiting", meetings: [] });
  assert.deepEqual(getInstitutionalAcademicHistory({
    results: [{ code: "OFFICIAL", term: "2026-1", result: "COMPLETED", grade: "1.5" },
      { code: "FICTIONAL", source: "PROJECT_ONLY", result: "COMPLETED" }],
    credits: [{ target_subject: "MATH101", decision_status: "CREDITED" }],
  }).map((row) => row.code), ["OFFICIAL", "MATH101"]);
});

const demo = {
  kind: "ready",
  provenance: "PROJECT_ONLY_FICTIONAL",
  projectOnly: true,
  verifiedInstitutionally: false,
  curriculum: { code: "P8F26-BSIT-V1" },
  term: { id: "TERM-2026-1", label: "2026 First Semester" },
  homeBlock: { code: "BSIT-1A", status: "PUBLISHED" },
  status: "PROPOSED",
  subjects: [
    { code: "P8F26-IT101", name: "Fictional Programming", units: 3,
      section: "BSIT-1A", eligibility: "ELIGIBLE", sectionStatus: "OPEN",
      meetings: [{ day: 1, start: "08:00", end: "09:30", room: "LAB-1", instructor: "Fictional Faculty" }] },
  ],
  feeEstimate: { currency: "PHP", estimatedAmount: 4200, totalUnits: 3,
    verifiedRateCount: 1, missingRateCount: 0 },
  blockingReasons: [],
  canPrepare: false, canSubmit: true, canReopen: false,
};

test("project demonstration is rendered only from the exact isolated server provenance contract", () => {
  assert.equal(getAuthorizedDemonstration({ demonstration: demo }), demo);
  assert.equal(getAuthorizedDemonstration({ demonstration: { ...demo, projectOnly: false } }), null);
  assert.equal(getAuthorizedDemonstration({ demonstration: { ...demo, verifiedInstitutionally: true } }), null);
  assert.equal(getAuthorizedDemonstration({ demonstration: { ...demo, provenance: "INSTITUTIONAL" } }), null);
  assert.equal(getAuthorizedDemonstration({ demonstration: { ...demo, kind: "unavailable" } }), null);
  assert.equal(hasUnavailableDemonstration({ demonstration: { ...demo, kind: "unavailable" } }), true);
  assert.equal(hasUnavailableDemonstration({ demonstration: {
    ...demo, kind: "unavailable", provenance: "INSTITUTIONAL",
  } }), false);
  assert.equal(getAuthorizedDemonstration({ ...studentData, student: {
    ...studentData.student, curriculumProvenance: "PROJECT_ONLY_FICTIONAL",
  } }), null);
});

test("published Phase 8 block meetings remain proposed until saved project confirmation", () => {
  const schedule = getDemonstrationSchedule(demo);
  assert.equal(schedule.kind, "proposed");
  assert.equal(schedule.meetings.length, 1);
  assert.equal(schedule.meetings[0].room, "LAB ROOM 1");
  assert.equal(schedule.meetings[0].instructor, "Fictional Faculty");
  assert.equal(getDemonstrationSubjects(demo)[0].code, "P8F26-IT101");
  assert.match(getDemonstrationNextAction(demo).title, /review prepared/i);
  assert.equal(getInstitutionalSchedule({ ...studentData, demonstration: demo }).kind, "awaiting");
});

test("blocked project review remains readable and supports the server-authorized assignment step", () => {
  const readOnly = { ...demo, kind: "blocked", status: "PROPOSED",
    subjects: demo.subjects.map((item) => ({
      ...item, eligibility: "ELIGIBLE_FOR_DEMONSTRATION",
    })), blockingReasons: ["Enrollment period is closed."], canSubmit: false };
  assert.equal(getDemonstrationSubjects(readOnly).length, 1);
  assert.equal(getDemonstrationSchedule(readOnly).kind, "proposed");
  assert.equal(getAuthorizedDemonstration({ demonstration: readOnly }), readOnly);
  assert.match(getDemonstrationNextAction({
    ...readOnly, status: "UNASSIGNED", canPrepare: true,
  }).title, /prepare demonstration/i);
});

test("demonstration tuition is only displayed when the backend supplies a complete verified estimate", () => {
  assert.deepEqual(getDemonstrationFee(demo).available, true);
  assert.equal(getDemonstrationFee(demo).amount, 4200);
  assert.equal(getDemonstrationFee({ ...demo, feeEstimate: {
    ...demo.feeEstimate, missingRateCount: 1,
  } }).available, false);
  assert.equal(getDemonstrationFee({ ...demo, feeEstimate: {
    ...demo.feeEstimate, estimatedAmount: null,
  } }).available, false);
  assert.equal(getDemonstrationFee({ ...demo, feeEstimate: {
    ...demo.feeEstimate, currency: "USD",
  } }).available, false);
});

test("recorded project confirmation without complete registration snapshot shows no registered timetable", () => {
  const partial = {
    ...demo, status: "CONFIRMED_SIMULATION",
    registration: {
      source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
      registrationSnapshotComplete: false,
      reference: "DEMO-123", confirmedAt: "2026-10-30T11:00:00Z",
      subjects: demo.subjects, items: [],
    },
  };
  assert.equal(isConfirmedDemonstrationRegistration(partial), false);
  assert.equal(getDemonstrationSchedule(partial).kind, "awaiting");
  assert.match(getDemonstrationNextAction(partial).title, /needs verification/i);
});

test("only complete Registrar confirmed project snapshot unlocks registered DEMO schedule", () => {
  const confirmed = {
    ...demo, status: "CONFIRMED_SIMULATION",
    registration: {
      source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
      registrationSnapshotComplete: true,
      reference: "DEMO-123", confirmedAt: "2026-10-30T11:00:00Z",
      units: 3, subjects: [{ code: "P8F26-IT101", name: "Fictional Programming",
        section: "BSIT-1A", units: 3 }],
      items: [{ subject_code: "P8F26-IT101", day: 3,
        start: "10:00", end: "12:00", room: "LAB-2" }],
    },
  };
  assert.equal(isConfirmedDemonstrationRegistration(confirmed), true);
  const schedule = getDemonstrationSchedule(confirmed);
  assert.equal(schedule.kind, "registered");
  assert.equal(schedule.reference, "DEMO-123");
  assert.equal(schedule.meetings[0].day, "Wednesday");
  assert.match(getDemonstrationNextAction(confirmed).title, /confirmed classroom/i);
  assert.equal(isOfficiallyConfirmed({ status: confirmed.status,
    confirmedAt: confirmed.registration.confirmedAt }), false);
  assert.equal(isConfirmedDemonstrationRegistration({
    ...confirmed,
    registration: { ...confirmed.registration, subjects: [
      ...confirmed.registration.subjects, { code: "MISSING", section: "BSIT-1A", units: 3 },
    ] },
  }), false);
  assert.equal(isConfirmedDemonstrationRegistration({
    ...confirmed,
    registration: { ...confirmed.registration, subjects: [{
      code: "P8F26-IT101", name: "Fictional Programming", units: 3,
    }] },
  }), false);
});
