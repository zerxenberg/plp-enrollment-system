import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  admissionsPhase8ReservationsByBlock,
  admissionsPhase8RosterForBlock,
} from "../academic/coordinator-admissions-phase8-roster.mjs";

const action = readFileSync(new URL("./admissions-phase8-demo-actions.js", import.meta.url), "utf8");
const loader = action.split("export async function listAdmissionsPhase8Candidates")[1]
  .split("export async function assignAdmissionsPhase8Demo")[0];
const registrarLoader = action.split("export async function listRegistrarAdmissionsPhase8Demo")[1]
  .split("export async function reviewRegistrarAdmissionsPhase8Demo")[0];

test("Admissions roster does not fetch the first 1,000 unrelated project profiles or accounts", () => {
  assert.match(loader, /\.eq\("source_name", "PLP Admissions"\)/);
  assert.match(loader, /\.eq\("admission_status", "ACCEPTED"\)/);
  assert.match(loader, /\.eq\("synchronization_status", "Successful"\)/);
  assert.match(loader, /const studentIds = \[\.\.\.new Set/);
  assert.match(loader, /admin\.from\("student_profiles"\)[\s\S]*?\.in\("id", studentIds\)/);
  assert.match(loader, /admin\.from\("app_users"\)[\s\S]*?\.in\("id", accountIds\)/);
  assert.match(loader, /admin\.from\("admissions_phase8_demo_enrollments"\)[\s\S]*?\.in\("student_id", studentIds\)/);
  assert.match(loader, /admin\.from\("block_sections"\)[\s\S]*?\.in\("id", blockIds\)/);
});

test("a scoped real Admissions identity shows its pre-existing Phase 8 reservation", () => {
  const block = {
    id: "phase8-bsit-1a", code: "BSIT-1A", curriculumId: "P8F26-BSIT-V1",
    programCode: "BSIT", yearLevel: "1st Year",
  };
  const curricula = [{
    id: "P8F26-BSIT-V1", isProjectOnly: true, provenance: "PROJECT_ONLY_FICTIONAL",
  }];
  const manggi = {
    id: "real-admissions-student", studentNumber: "26-50604",
    programCode: "BSIT", yearLevel: 1, active: true,
    assignedBlockId: block.id, assignedBlockCode: "BSIT-1A", assignedStatus: "PROPOSED",
  };
  const scope = [manggi];
  assert.deepEqual(admissionsPhase8RosterForBlock(scope, block), [manggi]);
  assert.equal(admissionsPhase8ReservationsByBlock(scope, [block], curricula).get(block.id), 1);
});

test("Registrar Admissions lookup scopes each join to the private ledger instead of the first 1,000 unrelated profiles", () => {
  assert.match(registrarLoader, /\.eq\("source_kind", "ADMISSIONS_PHASE8_DEMONSTRATION"\)/);
  assert.match(registrarLoader, /\.eq\("simulation_only", true\)\.eq\("is_official", false\)/);
  assert.match(registrarLoader, /\.limit\(201\)/);
  assert.match(registrarLoader, /rows\.data\.length > 200/);
  assert.match(registrarLoader, /\.from\("student_profiles"\)[\s\S]*?\.in\("id", studentIds\)/);
  assert.match(registrarLoader, /\.from\("admission_handoffs"\)[\s\S]*?\.in\("student_id", studentIds\)/);
  assert.match(registrarLoader, /\.from\("block_sections"\)[\s\S]*?\.in\("id", blockIds\)/);
  assert.match(registrarLoader, /\.from\("app_users"\)[\s\S]*?\.in\("id", accountIds\)/);
  assert.match(registrarLoader, /account\.role_code !== "student"/);
  assert.match(registrarLoader, /handoff\.approved_program_code !== profile\.program_code/);
});
