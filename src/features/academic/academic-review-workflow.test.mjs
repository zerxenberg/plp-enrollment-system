import test from "node:test";
import assert from "node:assert/strict";
import {
  canDecideAcademicReview, isPendingAcademicReview,
  academicReviewOutcome, demoValidationOutcome,
} from "./academic-review-workflow.js";

const pending = { reference: "ENR-1", status: "NEEDS_ACADEMIC_REVIEW", validationPreset: "review" };

test("academic reasons and allowed decisions are required", () => {
  assert.equal(academicReviewOutcome(pending, "APPROVED", " ").ok, false);
  assert.equal(academicReviewOutcome(pending, "OTHER", "reason").ok, false);
  assert.deepEqual(academicReviewOutcome(pending, "APPROVED", "Verified condition"), {
    ok: true, nextStatus: "FOR_VALIDATION",
  });
  assert.equal(academicReviewOutcome(pending, "REJECTED", "Failed requirement").nextStatus, "REQUIRES_CORRECTION");
  assert.equal(academicReviewOutcome(pending, "RETURNED_FOR_CLARIFICATION", "More details needed").nextStatus, "NEEDS_ACADEMIC_REVIEW");
});

test("returned cases remain pending but locked until authorized clarification", () => {
  const returned = { ...pending, academicReviewDecision: "RETURNED_FOR_CLARIFICATION" };
  assert.equal(isPendingAcademicReview(returned), true);
  assert.equal(canDecideAcademicReview(returned), false);
  assert.equal(academicReviewOutcome(returned, "APPROVED", "Second decision").ok, false);
  assert.equal(canDecideAcademicReview({ ...returned, academicReviewDecision: "PENDING" }), true);
});

test("approved, rejected, and applied decisions cannot be overwritten", () => {
  for (const status of ["APPROVED", "REJECTED", "APPLIED"]) {
    const reviewed = { ...pending, academicReviewDecision: status };
    assert.equal(canDecideAcademicReview(reviewed), false);
    assert.equal(academicReviewOutcome(reviewed, "APPROVED", "Retry").ok, false);
  }
});

test("Registrar demo validation consumes an approved exception without automatically confirming", () => {
  assert.equal(demoValidationOutcome(pending), "NEEDS_ACADEMIC_REVIEW");
  assert.equal(demoValidationOutcome({ ...pending, academicReviewDecision: "APPROVED" }), "VALIDATED");
  assert.equal(demoValidationOutcome({ ...pending, academicReviewDecision: "APPLIED" }), "VALIDATED");
  assert.equal(demoValidationOutcome({ ...pending, validationPreset: "correction" }), "REQUIRES_CORRECTION");
});
