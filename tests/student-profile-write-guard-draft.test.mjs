import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const text = readFileSync(new URL(
  "../docs/database-normalization/security-drafts/REVIEW_ONLY_20261022_student_profile_column_allowlist.sql",
  import.meta.url), "utf8");

test("Student Profile guard draft requires exact existing live trigger and postgres owner", () => {
  assert.match(text, /session_user <> 'postgres'/);
  assert.match(text, /trg_protect_student_profile_update/);
  assert.match(text, /student_profiles_student_or_registrar_update/);
  assert.match(text, /CREATE OR REPLACE FUNCTION public\.protect_student_profile_update\(\)/);
  assert.match(text, /SET search_path TO 'pg_catalog', 'public', 'auth'/);
});

test("Student may update only four self-service contact fields", () => {
  const allowlisted = text.match(/to_jsonb\(NEW\) - ARRAY\[([\s\S]*?)\]::text\[\]/)?.[1];
  assert.ok(allowlisted);
  const fields = [...allowlisted.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(fields, [
    "contact_number", "address", "emergency_contact_name",
    "emergency_contact_number", "updated_at",
  ]);
  assert.match(text, /IS DISTINCT FROM \(/);
  assert.match(text, /ERRCODE='42501'/);
  for (const forbidden of [
    "id", "user_id", "student_number", "record_kind",
    "project_cohort_id", "institutional_verified_at", "is_synthetic_demo",
    "student_status", "current_curriculum_code", "created_at",
  ]) assert.equal(fields.includes(forbidden), false);
});
