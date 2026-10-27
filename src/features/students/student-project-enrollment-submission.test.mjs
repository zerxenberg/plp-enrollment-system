import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Run the real server action in an isolated VM with mocked RPCs. Next.js
// server-only dependencies cannot be imported directly by node:test.
const actionSource = readFileSync(new URL("./student-portal-actions.js", import.meta.url), "utf8")
  .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*$/gm, "")
  .replace(/^export\s+(?=(?:async\s+)?function\s+)/gm, "");

const studentId = "student-uuid";
const simulationId = "simulation-uuid";
const subjectCodes = ["P8F26-BSIT-T01-M1", "P8F26-GE-T01-1"];

function setup({ existing = null, overrides = {}, selected = subjectCodes } = {}) {
  const calls = [];
  const proposedSubjects = selected.map((code) => ({
    code, units: 3, eligibility: "ELIGIBLE", section: "BSIT-1A",
    sectionStatus: "OPEN", meetings: [{ day: 1, start: "08:00:00", end: "09:00:00" }],
  }));
  const responseFor = (name, args) => {
    if (name === "project_phase8_student_portal_status_v1") {
      return { data: {
        project_only: true, verified_institutionally: false,
        curriculum_is_official: false, curriculum_code: "P8F26-BSIT-V1",
        simulation: existing,
      } };
    }
    if (name === "project_phase8_register_prepared_subjects_v1") {
      return { data: {
        simulation_id: simulationId,
        fictional_only: true, ready_to_submit: true,
        selected_subject_count: selected.length,
      } };
    }
    if (name === "project_phase8_simulated_enrollment_action_v1") {
      return args.p_action === "OPEN"
        ? { data: { simulation_id: simulationId, status: "DRAFT", fictional_only: true } }
        : { data: { status: "SUBMITTED" } };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  };
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return typeof overrides[name] === "function"
        ? overrides[name](args) : overrides[name] ?? responseFor(name, args);
    },
  };
  const context = { studentId, client };
  const sandbox = {
    assertCanSubmitProjectEnrollment: async () => ({
      context, proposedSubjects, termId: "TERM-2026-1",
      curriculumCode: "P8F26-BSIT-V1",
    }),
    requireStudentContext: async () => context,
    revalidatePath: () => {},
    loadVerifiedProjectSubjectPrices: () => [],
    estimateProjectSelectedSubjects: () => ({}),
  };
  runInNewContext(`${actionSource}\nthis.submit = submitPreparedProjectEnrollment;`, sandbox);
  return { submit: sandbox.submit, calls };
}

test("new draft OPENs, registers exactly server-selected codes, then SUBMITs", async () => {
  const { submit, calls } = setup();
  const result = await submit();
  assert.equal(result.status, "SUBMITTED");
  assert.equal(result.simulationOnly, true);
  assert.deepEqual(calls.map((call) => [call.name, call.args.p_action ?? null]), [
    ["project_phase8_student_portal_status_v1", null],
    ["project_phase8_simulated_enrollment_action_v1", "OPEN"],
    ["project_phase8_register_prepared_subjects_v1", null],
    ["project_phase8_simulated_enrollment_action_v1", "SUBMIT"],
  ]);
  assert.equal(calls[2].args.p_student_id, studentId);
  assert.deepEqual([...calls[2].args.p_subject_codes], subjectCodes);
});

test("returned draft registers a fresh server-verified selection before resubmission", async () => {
  const { submit, calls } = setup({
    existing: { id: simulationId, status: "RETURNED", term_id: "TERM-2026-1" },
    selected: [subjectCodes[1]],
  });
  await submit();
  assert.deepEqual(calls.map((call) => call.name), [
    "project_phase8_student_portal_status_v1",
    "project_phase8_register_prepared_subjects_v1",
    "project_phase8_simulated_enrollment_action_v1",
  ]);
  assert.deepEqual([...calls[1].args.p_subject_codes], [subjectCodes[1]]);
});

test("missing RPC, incomplete count, changed simulation, and nonready registration block SUBMIT", async () => {
  const failures = [
    { error: { message: "Could not find the function" }, data: null },
    { data: null },
    undefined,
    { data: {
      simulation_id: simulationId, fictional_only: true,
      ready_to_submit: true, selected_subject_count: 1,
    } },
    { data: {
      simulation_id: "different-simulation", fictional_only: true,
      ready_to_submit: true, selected_subject_count: 2,
    } },
    { data: {
      simulation_id: simulationId, fictional_only: true,
      ready_to_submit: false, selected_subject_count: 2,
    } },
  ];
  for (const response of failures) {
    const { submit, calls } = setup({ overrides: {
      project_phase8_register_prepared_subjects_v1: () => response,
    } });
    await assert.rejects(submit(), /prepared subjects could not be registered/i);
    assert.equal(calls.some((call) => call.args.p_action === "SUBMIT"), false);
  }
});

test("registration RPC exception is reported safely and never submits", async () => {
  const { submit, calls } = setup({ overrides: {
    project_phase8_register_prepared_subjects_v1: () => {
      throw new Error("database internal connection details");
    },
  } });
  await assert.rejects(submit(), (error) =>
    /prepared subjects could not be registered/i.test(error.message) &&
    !error.message.includes("database internal"));
  assert.equal(calls.some((call) => call.args.p_action === "SUBMIT"), false);
});

test("invalid previously submitted status prevents mutation before registration", async () => {
  const { submit, calls } = setup({
    existing: { id: simulationId, status: "CONFIRMED_SIMULATION", term_id: "TERM-2026-1" },
  });
  await assert.rejects(submit(), /could not verify current enrollment status/i);
  assert.equal(calls.length, 1);
});
