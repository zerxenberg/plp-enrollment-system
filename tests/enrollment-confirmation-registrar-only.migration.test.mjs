import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL(
  "../supabase/migrations/20261022045200_enrollment_confirmation_registrar_only.sql",
  import.meta.url), "utf8");

test("final confirmation requires real signed Registrar and VALIDATED status", () => {
  const guard = script.split("AS $guard$")[1]?.split("$guard$;")[0] || "";
  assert.ok(guard);
  assert.match(script, /IF NEW\.status = 'CONFIRMED' THEN/);
  assert.match(script, /v_request_role IS DISTINCT FROM 'authenticated'/);
  assert.match(script, /v_actor_code IS DISTINCT FROM 'REGISTRAR'/);
  assert.match(script, /OLD\.status IS DISTINCT FROM 'VALIDATED'/);
  assert.match(script, /auth\.uid\(\) IS NULL/);
  assert.doesNotMatch(guard, /current_user IN \(/);
});

test("technical sessions may only execute explicit SYSTEM transitions", () => {
  assert.match(script, /v_request_role = 'service_role'/);
  assert.match(script, /t\.actor_code='SYSTEM'/);
  assert.match(script, /System execution is not authorized/);
  assert.match(script, /t\.actor_code=v_actor_code/);
  assert.match(script, /trg_validate_enrollment_status_transition/);
  assert.match(script, /ERRCODE='42501'/);
});
