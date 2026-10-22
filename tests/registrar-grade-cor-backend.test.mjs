import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const base = read("../supabase/migrations/20261022083000_registrar_grades_official_cor_backend.sql");
const corrections = read("../supabase/migrations/20261022083100_registrar_grade_revisions_transfer_workflows.sql");
const sync = read("../supabase/migrations/20261022091000_academic_eligibility_and_complete_cor.sql");
const actions = read("../src/features/grade-import/registrar-grade-actions.js");

test("only a signed Registrar stages, validates, attests and publishes official grades", () => {
  for (const name of [
    "registrar_stage_grade_batch_v1",
    "registrar_validate_grade_batch_v1",
    "registrar_verify_grade_batch_v1",
    "registrar_publish_grade_batch_v1",
  ]) {
    assert.match(base, new RegExp(`FUNCTION public\\.${name}\\(`));
  }
  assert.ok((base.match(/current_role_code\(\) IS DISTINCT FROM 'registrar'/g) || []).length >= 4);
  assert.match(base, /auth\.uid\(\) IS NULL/);
  assert.match(base, /source_checksum/);
  assert.match(base, /verified_checksum_sha256/);
});

test("failed academic grades are valid outcomes independent of technical failures", () => {
  assert.match(base, /'COMPLETED','FAILED','INCOMPLETE','CREDITED'/);
  assert.match(base, /v_status='CREDITED'/);
  assert.doesNotMatch(base, /v_status='FAILED'\s+THEN\s+v_issue/);
});

test("grade publication locks, rechecks authoritative attempts and is idempotent", () => {
  assert.match(base, /FOR UPDATE/);
  assert.match(base, /e\.status='CONFIRMED'/);
  assert.match(base, /es\.registration_status='CONFIRMED'/);
  assert.match(base, /IF v_batch\.status='PUBLISHED'/);
  assert.match(base, /idempotent',true/);
  assert.match(base, /OFFICIAL_RESULT_ALREADY_EXISTS/);
});

test("historical corrections use append-only revisions and separate transfer decisions", () => {
  assert.match(corrections, /INSERT INTO public\.academic_result_revisions/);
  assert.match(corrections, /revision_number/);
  assert.match(corrections, /coordinator_decide_transfer_evaluation_v1/);
  assert.match(corrections, /p_decision_status='CREDITED'/);
  assert.match(corrections, /record_kind IS DISTINCT FROM 'PROJECT_ONLY'/);
});

test("eligibility updates derive prerequisites and avoid replacing other official sources", () => {
  assert.match(sync, /REGISTRAR_PUBLICATION_V1/);
  assert.match(sync, /public\.student_subject_eligibility\.source_name='REGISTRAR_PUBLICATION_V1'/);
  assert.match(sync, /'PREREQUISITE_NOT_YET_COMPLETED'/);
  assert.match(sync, /'FAILED_SUBJECT_RETAKE'/);
});

test("COR uses a CONFIRMED enrollment and FINALIZED sections, never draft schedules", () => {
  assert.match(sync, /WHERE id=p_enrollment_id AND status='CONFIRMED'/);
  assert.match(sync, /s\.schedule_status='FINALIZED'/);
  assert.match(sync, /a\.status='CONFIRMED' AND b\.planning_status='PUBLISHED'/);
  assert.match(sync, /schedule_complete/);
  assert.match(sync, /ready_to_print/);
  assert.match(actions, /requireRole\("registrar"\)/);
  assert.match(actions, /client\.rpc\("official_enrollment_cor_v1"/);
  assert.doesNotMatch(actions, /createAdminClient|SERVICE_ROLE_KEY|localStorage/);
});
