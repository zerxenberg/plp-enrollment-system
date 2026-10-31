import test from "node:test";
import assert from "node:assert/strict";
import { resolveAdmissionsEnrollmentStatus as map } from "./admissions-enrollment-status.mjs";

const demo = (status, confirmed_at = null) => ({
  status, confirmed_at, updated_at: "2026-10-30T15:00:00Z",
  source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION", simulation_only: true, is_official: false,
});
const official = (status, confirmed_at = null) => ({
  status, confirmed_at, updated_at: "2026-10-30T16:00:00Z",
});

test("newly transferred applicant has not enrolled", () => {
  assert.deepEqual(map(), {
    enrollment_status: "pending_enrollment", enrollment_source: "none",
    stage: "student", cor_available: false,
  });
});
test("demonstration statuses are not official confirmation", () => {
  assert.equal(map({ demonstration: demo("PROPOSED") }).enrollment_status, "pending_enrollment");
  assert.equal(map({ demonstration: demo("SUBMITTED") }).enrollment_status, "pending_registrar_enrollment");
  assert.equal(map({ demonstration: demo("VALIDATED") }).enrollment_status, "pending_registrar_enrollment");
  assert.equal(map({ demonstration: demo("RETURNED") }).enrollment_status, "returned_for_correction");
  assert.equal(map({ demonstration: demo("CONFIRMED_SIMULATION") }).cor_available, false);
  const confirmed = map({ demonstration: demo("CONFIRMED_SIMULATION", "2026-10-30T14:00:00Z") });
  assert.equal(confirmed.enrollment_status, "confirmed_demonstration");
  assert.equal(confirmed.stage, "student");
  assert.equal(confirmed.cor_available, true);
});
test("official confirmation requires a completed Registrar transaction", () => {
  assert.equal(map({ official: official("SUBMITTED") }).enrollment_status, "pending_registrar_enrollment");
  assert.equal(map({ official: official("FOR_VALIDATION") }).enrollment_status, "pending_registrar_enrollment");
  assert.equal(map({ official: official("REQUIRES_CORRECTION") }).enrollment_status, "returned_for_correction");
  assert.equal(map({ official: official("CONFIRMED") }).cor_available, false);
  assert.deepEqual(map({ official: official("CONFIRMED", "2026-10-30T14:00:00Z") }), {
    enrollment_status: "officially_enrolled", enrollment_source: "official",
    stage: "enrolled", cor_available: true,
  });
});
test("ignore unauthoritative demonstrations and choose the most recently updated transaction", () => {
  const forged = { ...demo("CONFIRMED_SIMULATION", "2026-10-30T14:00:00Z"), is_official: true };
  assert.equal(map({ demonstration: forged }).enrollment_status, "pending_enrollment");
  const later = demo("RETURNED");
  later.updated_at = "2026-10-31T15:00:00Z";
  assert.equal(map({ official: official("CONFIRMED", "2026-10-30"), demonstration: later }).enrollment_status, "returned_for_correction");
});
