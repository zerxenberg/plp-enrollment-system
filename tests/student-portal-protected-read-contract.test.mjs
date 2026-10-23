import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const sql = source("supabase/migrations/20261023115000_student_portal_protected_reads.sql");
const fix = source("supabase/migrations/20261023115100_student_portal_cohort_uuid_fix.sql");
const enrollment = source("src/features/students/student-enrollment-server.js");
const academic = source("src/features/students/student-academic-server.js");
const profile = source("src/features/students/student-profile-server.js");
const actions = source("src/features/students/student-portal-actions.js");
const registrar = source("src/features/academic/registrar-project-simulations.js");

test("PROJECT_ONLY simulation and fictional curriculum tables retain denied direct service queries", () => {
  for (const file of [enrollment, academic, profile, actions, registrar]) {
    assert.doesNotMatch(file, /\.from\(["']project_phase8_enrollment_simulations["']\)/);
    assert.doesNotMatch(file, /\.from\(["']project_phase8_enrollment_simulation_events["']\)/);
    assert.doesNotMatch(file, /\.from\(["']phase8_fictional_curriculum_provenance["']\)/);
  }
  assert.match(enrollment, /project_phase8_student_portal_status_v1/);
  assert.match(academic, /project_phase8_student_portal_status_v1/);
  assert.match(profile, /project_phase8_student_portal_status_v1/);
  assert.match(actions, /project_phase8_student_portal_status_v1/);
  assert.match(registrar, /project_phase8_registrar_simulation_queue_v1/);
});

test("Student read RPC enforces ownership, activation, rotation and fictional curriculum", () => {
  assert.match(sql, /l\.auth_user_id = auth\.uid\(\)/);
  assert.match(sql, /l\.student_id = p_student_id/);
  assert.match(sql, /l\.state = 'ACTIVE'/);
  assert.match(sql, /l\.initial_password_changed_at IS NOT NULL/);
  assert.match(sql, /s\.record_kind = 'PROJECT_ONLY'/);
  assert.match(sql, /f\.is_official IS FALSE/);
  assert.match(sql, /'curriculum_is_official', false/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.project_phase8_student_portal_status_v1\(uuid\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.project_phase8_student_portal_status_v1\(uuid\)\s+TO authenticated/);
  assert.match(fix, /l\.cohort_id IS NOT NULL/);
  assert.doesNotMatch(fix, /l\.cohort_id = 'PLP_PROJECT_600_2026_1'/);
});

test("Registrar queue RPC requires an active Registrar and returns project rows only", () => {
  assert.match(sql, /a\.role_code = 'registrar'/);
  assert.match(sql, /a\.account_status = 'Active' AND a\.login_enabled/);
  assert.match(sql, /sim\.source_provenance = 'GENERATED_PROJECT'/);
  assert.match(sql, /sim\.verified_institutionally IS FALSE/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.project_phase8_registrar_simulation_queue_v1\(\)\s+TO authenticated/);
});
