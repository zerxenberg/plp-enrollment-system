import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  currentProjectEnrollmentSubjects,
  hasVerifiedProjectCor,
  projectEnrollmentDisplayStatus,
  verifiedRegistrarSelectedSubjects,
} from "./registrar-project-enrollment-view.mjs";

test("Registrar current-semester subject view ignores stale stored eligibility and other years", () => {
  const subjects = [
    { subject_code: "P8F26-BSIT-T02-M1", eligibility: "RESTRICTED" },
    { subject_code: "P8F26-BSIT-T03-M1", eligibility: "ELIGIBLE", reason: "Stale generated eligibility" },
    { subject_code: "P8F26-BSIT-T03-M2", eligibility: "RESTRICTED" },
  ];
  const decisions = new Map([
    ["P8F26-BSIT-T03-M1", { eligibility: "RESTRICTED", reason: "Published prerequisite was failed" }],
    ["P8F26-BSIT-T03-M2", { eligibility: "ELIGIBLE", reason: null }],
  ]);
  const output = currentProjectEnrollmentSubjects(subjects,
    new Set(["P8F26-BSIT-T03-M1", "P8F26-BSIT-T03-M2"]), decisions);
  assert.deepEqual(output.map((row) => row.subject_code),
    ["P8F26-BSIT-T03-M1", "P8F26-BSIT-T03-M2"]);
  assert.equal(output[0].eligibility, "RESTRICTED");
  assert.equal(output[0].reason, "Published prerequisite was failed");
  assert.equal(output[1].eligibility, "ELIGIBLE");
  assert.equal(subjects[1].eligibility, "ELIGIBLE", "source snapshot is unchanged");
});

test("Missing current semester subjects or published decisions fail closed", () => {
  assert.throws(() => currentProjectEnrollmentSubjects(
    [{ subject_code: "A" }], new Set(["A", "B"]), new Map([["A", { eligibility: "ELIGIBLE" }]])),
  /incomplete/);
  assert.throws(() => currentProjectEnrollmentSubjects(
    [{ subject_code: "A" }, { subject_code: "A" }], new Set(["A", "B"]), new Map()),
  /incomplete/);
});

test("Legacy confirmed simulation with no subject evidence is not a COR", () => {
  const sim = { id: "simulation-1", status: "CONFIRMED_SIMULATION", confirmed_at: "2026-10-24T04:16:04Z" };
  const valid = {
    simulation_id: sim.id, confirmed_at: sim.confirmed_at, simulation_only: true,
    official: false, certificate_of_official_registration: false,
    registration_snapshot_complete: true,
    registered_subjects: [{ subject_code: "A" }],
    registered_schedule: [{ subject_code: "A" }],
  };
  assert.equal(hasVerifiedProjectCor(sim, null), false);
  assert.equal(hasVerifiedProjectCor(sim, { ...valid, registered_subjects: [] }), false);
  assert.equal(hasVerifiedProjectCor(sim, { ...valid, confirmed_at: null }), false);
  assert.equal(hasVerifiedProjectCor(sim, { ...valid, registration_snapshot_complete: false }), false);
  assert.equal(hasVerifiedProjectCor(sim, valid), true);
  assert.equal(projectEnrollmentDisplayStatus(sim, false), "Confirmed legacy simulation (COR unavailable)");
  assert.equal(projectEnrollmentDisplayStatus(sim), "Confirmed simulation");
  assert.equal(projectEnrollmentDisplayStatus(sim, true), "Confirmed project registration");
});

test("Registrar reads actual current semester SUBMITTED subject selections, not historical restrictions", () => {
  const student = "student-one";
  const simulation = { id: "simulation-one", status: "SUBMITTED" };
  const codes = new Set(["P8F26-GE-T03-1", "P8F26-BSIT-T03-M1"]);
  const decisions = new Map([...codes].map((code) => [code, { eligibility: "ELIGIBLE", reason: null }]));
  const saved = {
    fictional_only: true, verified_institutionally: false, student_id: student,
    term_id: "TERM-2026-1", simulation_id: simulation.id,
    status: simulation.status, selected_count: 2, selected_units: 6,
    subjects: [...codes].map((code) => ({
      subject_code: code, subject_name: code, academic_units: 3,
      section_code: "BSIT-2A", section_id: `section-${code}`,
      registered_schedule: [{ day_of_week: 1, start_time: "08:00", end_time: "09:00" }],
    })),
  };
  const selected = verifiedRegistrarSelectedSubjects(saved, student, simulation, codes, decisions);
  assert.equal(selected.length, 2);
  assert.equal(selected.reduce((total, item) => total + Number(item.academic_units), 0), 6);
  assert.ok(selected.every((item) => item.currentEligibility === "ELIGIBLE"));
  assert.deepEqual(saved.subjects.map((item) => item.subject_code), [...codes], "snapshot evidence is not rewritten");
});

test("Registrar selected subjects refuse cross-account, stale status and missing or duplicate evidence", () => {
  const simulation = { id: "sim", status: "SUBMITTED" };
  const row = { subject_code: "A", subject_name: "Current Subject", academic_units: 3,
    section_id: "section-A", section_code: "BSIT-2A", registered_schedule: [{ day_of_week: 2 }] };
  const correct = { fictional_only: true, verified_institutionally: false,
    student_id: "student-one", term_id: "TERM-2026-1", simulation_id: simulation.id,
    status: simulation.status, selected_count: 1, selected_units: 3, subjects: [row] };
  const codes = new Set(["A"]);
  const decisions = new Map([["A", { eligibility: "ELIGIBLE" }]]);
  const check = (value) => verifiedRegistrarSelectedSubjects(value, "student-one", simulation, codes, decisions);
  assert.throws(() => check({ ...correct, student_id: "student-two" }), /could not be verified/);
  assert.throws(() => check({ ...correct, status: "DRAFT" }), /could not be verified/);
  assert.throws(() => check({ ...correct, selected_count: 0, selected_units: 0, subjects: [] }), /no saved registered subjects/);
  assert.throws(() => check({ ...correct, selected_count: 2, selected_units: 6, subjects: [row, row] }), /do not match/);
  assert.throws(() => check({ ...correct, subjects: [{ ...row, subject_code: "OLD" }] }), /do not match/);
  assert.throws(() => check({ ...correct, subjects: [{ ...row, registered_schedule: [] }] }), /do not match/);
  assert.throws(() => check({ ...correct, selected_units: 6 }), /units do not reconcile/);
});

test("legacy confirmed project simulation with no subjects stays viewable for audited recovery", () => {
  const simulation = { id: "legacy", status: "CONFIRMED_SIMULATION" };
  const result = { fictional_only: true, verified_institutionally: false,
    student_id: "student-one", term_id: "TERM-2026-1",
    simulation_id: "legacy", status: "CONFIRMED_SIMULATION",
    selected_count: 0, selected_units: 0, subjects: [] };
  assert.deepEqual(verifiedRegistrarSelectedSubjects(result, "student-one", simulation,
    new Set(["A"]), new Map([["A", { eligibility: "ELIGIBLE" }]])), []);
});

test("Registrar route remains role-gated and does not fabricate subject snapshots", () => {
  const query = readFileSync(new URL("./registrar-queries.js", import.meta.url), "utf8");
  const component = readFileSync(new URL("../../components/registrar/RegistrarEnrollment.js", import.meta.url), "utf8");
  const debug = readFileSync(new URL("./registrar-client-utils.js", import.meta.url), "utf8");
  const detail = query.slice(query.indexOf("export async function getRegistrarProjectEnrollmentDetail("));
  assert.match(detail, /await requireRole\("registrar"\)/);
  assert.match(detail, /project_phase8_student_snapshot_v2/);
  assert.match(detail, /project_phase8_registrar_simulation_queue_v1/);
  assert.match(detail, /project_phase8_registrar_selected_subjects_v1/);
  assert.match(detail, /verifiedRegistrarSelectedSubjects/);
  assert.match(detail, /loadStudentPublishedReadiness/);
  assert.match(detail, /project_phase8_demonstration_cor_v1/);
  assert.match(component, /projectDetail\?\.corReady === true/);
  assert.match(component, /older project simulation was confirmed before registered subjects were saved/);
  assert.doesNotMatch(component, /Current Semester Subject Eligibility/);
  assert.match(component, /projectDetail\?\.selectedSubjects \|\| \[\]/);
  assert.match(component, /Student Submitted Subject Registration/);
  assert.match(component, /projectDetail\?\.selectedSubjectCount > 0/);
  assert.doesNotMatch(component, /Enrolled \(Project\)/);
  assert.match(debug, /const level = result\.ok \? "info" : "warn"/);
  assert.doesNotMatch(detail, /\.insert\(|\.update\(|\.upsert\(/,
    "Registrar detail remains read only");
});
