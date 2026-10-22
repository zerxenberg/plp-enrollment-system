import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = file("../supabase/migrations/20261022095000_project_phase8_simulation_foundation.sql");
const validation = file("../supabase/migrations/20261022095100_phase8_project_schedule_validation.sql");
const contacts = file("../supabase/migrations/20261022095500_project_phase8_contact_hour_verification.sql");
const roster = file("../supabase/migrations/20261022095200_phase8_reversible_old_proposal_retirement.sql");
const snapshot = file("../supabase/migrations/20261022100000_project_phase8_role_scoped_academic_snapshot.sql");
const passwordGate = file("../supabase/migrations/20261022100300_project_phase8_first_login_snapshot_gate.sql");
const enrollment = file("../supabase/migrations/20261022100100_project_phase8_simulated_enrollment_cor.sql");
const actions = file("../src/features/academic/project-phase8-actions.js");

test("immutable PROJECT_ONLY provenance is required for every simulated student sidecar", () => {
  assert.match(schema, /phase8_verify_simulated_student_v1/);
  assert.match(schema, /sp.record_kind='PROJECT_ONLY'/);
  assert.match(schema, /l.state='ACTIVE'/);
  assert.match(schema, /verified_institutionally/);
  assert.match(schema, /'GENERATED_PROJECT'/);
  assert.doesNotMatch(schema, /ALTER TABLE public.student_profiles DISABLE TRIGGER/);
});
test("project only simulation tables retain RLS without direct browser grant", () => {
  assert.match(schema, /ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /FROM PUBLIC,anon,authenticated/);
  assert.match(enrollment, /REVOKE ALL ON public.project_phase8_enrollment_simulations/);
  assert.doesNotMatch(enrollment, /GRANT .*ON TABLE .* TO authenticated/);
});
test("project READY schedules require five days and resource collision prevention", () => {
  assert.match(validation, /v_days=5/);
  assert.match(validation, /v_resource_conflicts=0/);
  assert.match(validation, /v_self_conflicts=0/);
  assert.match(validation, /v_students BETWEEN 1 AND LEAST\(v_block.capacity,40\)/);
  assert.match(contacts, /meeting_contact_minutes/);
  assert.match(contacts, /contact_hour_mismatches/);
});
test("obsolete proposals are archived before a narrow CANCELLED status transition", () => {
  assert.match(roster, /INSERT INTO public.phase8_retired_proposal_archive/);
  assert.match(roster, /to_jsonb\(a\)/);
  assert.match(roster, /v_old<>1915/);
  assert.match(roster, /project_phase8_schedule_validations/);
  assert.match(roster, /status='CANCELLED'/);
  assert.doesNotMatch(roster, /DELETE FROM public.student_profiles|TRUNCATE/);
});
test("signed role snapshot permits own student or authorized academic staff only", () => {
  assert.match(snapshot, /auth\.uid\(\) IS NULL/);
  assert.match(snapshot, /v_role='student' AND v_profile.user_id<>v_actor/);
  assert.match(snapshot, /'student','registrar','academic-coordinator'/);
  assert.match(snapshot, /verified_institutionally',false/);
  assert.match(snapshot, /official_enrollment_status','NOT_CONFIRMED'/);
  assert.match(passwordGate, /initial_password_changed_at IS NOT NULL/);
  assert.match(passwordGate, /REVOKE ALL ON FUNCTION public.project_phase8_student_snapshot_v1/);
});
test("project demo confirmation requires Registrar, and cannot issue an official COR", () => {
  assert.match(enrollment, /v_role='registrar' AND v_action NOT IN/);
  assert.match(enrollment, /v_old='VALIDATED'/);
  assert.match(enrollment, /'CONFIRMED_SIMULATION'/);
  assert.match(enrollment, /initial_password_changed_at IS NOT NULL/);
  assert.match(enrollment, /'certificate_of_official_registration',false/);
  assert.doesNotMatch(enrollment, /INSERT INTO public.enrollments|UPDATE public.enrollments/);
  assert.doesNotMatch(enrollment, /INSERT INTO public.academic_results/);
});
test("Next.js academic adapter uses signed role and no exposed service credential", () => {
  assert.match(actions, /requireRole\(role\)/);
  assert.match(actions, /requireRole\(role\)/);
  assert.match(actions, /project_phase8_student_snapshot_v2/);
  assert.match(actions, /project_phase8_demonstration_cor_v1/);
  assert.doesNotMatch(actions, /createAdminClient|SERVICE_ROLE_KEY|localStorage/);
});
