import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

const migration = read("../supabase/migrations/20261023102000_project_student_simulation_security_gates.sql");
const original = read("../supabase/migrations/20261022100100_project_phase8_simulated_enrollment_cor.sql");

function functionBody(sql, name) {
  const declaration = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;`,
  );
  const match = sql.match(declaration);
  assert.ok(match, `Missing complete SQL definition for ${name}`);
  return match[1];
}

const actionName = "project_phase8_simulated_enrollment_action_v1";
const corName = "project_phase8_demonstration_cor_v1";
const action = functionBody(migration, actionName);
const cor = functionBody(migration, corName);

const enrollmentWindowGuard = /\n -- Enrollment dates restrict Student OPEN\/SUBMIT,[\s\S]*?\n END IF;/;
const corOwnershipGuard = /\n -- A student must own this fictional record AND have completed first login[\s\S]*?\n \) THEN RAISE EXCEPTION 'Another student COR is not accessible' USING ERRCODE='42501'; END IF;/;
const originalCorOwnershipGuard = [
  "\n IF v_role='student' AND NOT EXISTS (",
  "  SELECT 1 FROM public.student_profiles WHERE id=v_sim.student_id AND user_id=v_actor",
  " ) THEN RAISE EXCEPTION 'Another student COR is not accessible' USING ERRCODE='42501'; END IF;",
].join("\n");

test("a student must OPEN or SUBMIT within the configured term window", () => {
  const match = action.match(enrollmentWindowGuard);
  assert.ok(match, "Missing student enrollment date guard");
  const guard = match[0];
  assert.match(guard, /IF v_role='student' AND v_action IN \('OPEN','SUBMIT'\) AND NOT EXISTS \(/);
  assert.match(guard, /FROM public\.academic_terms t/);
  assert.match(guard, /t\.id=v_placement\.term_id/);
  assert.match(guard, /t\.status='Open'/);
  assert.match(guard, /\(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date\s+BETWEEN t\.enrollment_start AND t\.enrollment_end/);
  assert.doesNotMatch(guard, /\bCURRENT_DATE\b/);
  assert.match(guard, /USING ERRCODE='42501'/);

  const roleCheck = action.indexOf("v_action NOT IN ('OPEN','SUBMIT')");
  const guardOffset = action.indexOf(match[0]);
  const firstLock = action.indexOf("FOR UPDATE");
  assert.ok(roleCheck >= 0 && roleCheck < guardOffset && guardOffset < firstLock,
    "The date gate must run after role authorization and before enrollment access or mutation");
  assert.doesNotMatch(guard.replace(/^\s*--.*$/gm, ""),
    /v_role='registrar'|VALIDATE|RETURN|CONFIRM/);
});

test("Registrar lifecycle, approved student access, and simulation records are unchanged", () => {
  assert.equal(action.replace(enrollmentWindowGuard, ""), functionBody(original, actionName),
    "The action RPC must differ from the installed baseline only by the enrollment window guard");
  assert.match(action, /v_role='registrar' AND v_action NOT IN \('VALIDATE','RETURN','CONFIRM'\)/);
  assert.match(action, /initial_password_changed_at IS NOT NULL/);
  assert.match(action, /v_action IN \('RETURN','CONFIRM'\) AND btrim/);
  assert.match(action, /'fictional_only',true,'verified_institutionally',false/);
});

test("student demonstration COR requires ownership and an activated rotated link", () => {
  const match = cor.match(corOwnershipGuard);
  assert.ok(match, "Missing project student COR authentication guard");
  const guard = match[0];
  assert.match(guard, /IF v_role='student' AND NOT EXISTS \(/);
  assert.match(guard, /FROM public\.student_profiles sp/);
  assert.match(guard, /JOIN public\.project_auth_student_links l ON l\.student_id=sp\.id/);
  assert.match(guard, /sp\.id=v_sim\.student_id AND sp\.user_id=v_actor/);
  assert.match(guard, /sp\.record_kind='PROJECT_ONLY'/);
  assert.match(guard, /sp\.project_cohort_id='PLP_PROJECT_600_2026_1'/);
  assert.match(guard, /l\.app_user_id=v_actor AND l\.auth_user_id=auth\.uid\(\)/);
  assert.match(guard, /l\.state='ACTIVE' AND l\.initial_password_changed_at IS NOT NULL/);
  assert.match(guard, /USING ERRCODE='42501'/);
  assert.doesNotMatch(guard, /v_role='registrar'/);

  assert.equal(cor.replace(corOwnershipGuard, originalCorOwnershipGuard),
    functionBody(original, corName),
    "COR must differ from the installed baseline only by the student ownership and rotation guard");
});

test("migration maintains signature, execute grants, and fictional COR provenance", () => {
  const functions = [...migration.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)]
    .map((match) => match[1]);
  assert.deepEqual(functions, [actionName, corName]);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(migration, /SECURITY DEFINER SET search_path=''/g);
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC,anon,authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*?TO authenticated;/);
  for (const signature of [
    "project_phase8_simulated_enrollment_action_v1(uuid,text,text)",
    "project_phase8_demonstration_cor_v1(uuid)",
  ]) {
    assert.equal(migration.split(signature).length - 1, 2,
      `Both the REVOKE and GRANT must retain ${signature}`);
  }
  assert.match(cor, /'simulation_only',true,'official',false/);
  assert.match(cor, /'certificate_of_official_registration',false/);
  assert.match(cor, /status='CONFIRMED_SIMULATION'/);
  assert.doesNotMatch(migration, /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\.(?:enrollments|academic_results|student_profiles)\b/i);
  assert.doesNotMatch(migration, /\b(?:ALTER TABLE|DROP FUNCTION|DROP TABLE|CREATE TABLE)\b/i);
});
