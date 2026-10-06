---
name: plp-enrollment-domain
description: Apply PLP Enrollment System lifecycle, canonical status, admission handoff, continuing student, enrollment transaction, and correction rules when implementing or reviewing enrollment behavior.
---

# PLP Enrollment Domain

Use this skill for student lifecycle logic, admission handoff, enrollment state changes, continuing student processing, enrollment submission, correction, confirmation, and status dependent behavior.

## Source authority

Follow the finalized PLP project decisions. When project sources conflict, prefer the four finalized role GUI documents, then the Unified Student Portal Workflow interpreted with the newer Student GUI, then the finalized planning references. Do not revive the obsolete combined Registrar Administrator role.

When an exact institutional policy value is not finalized, keep it configurable and do not present a guessed value as official PLP policy.

## Core lifecycle invariants

1. Preserve one permanent student identity across Admission and Enrollment. A continuing student never creates a second account and never repeats Admission.
2. Admission remains an external business owner. The Enrollment System may expose only the minimal Admission Status bridge and read only Admission Record needed for transition and history.
3. Admission to Enrollment handoff requires Admission Status `COMPLETED`, an accepted applicant, approved program, stable applicant reference, linkable permanent identity, Student ID assignment or readiness, transferee credit results when applicable, and duplicate safe transfer processing.
4. Admission completion enables handoff. It does not automatically mean the student is eligible for the active enrollment term.
5. Enrollment owns eligibility, subject registration, validation, Registrar processing, confirmation, and enrollment history after handoff.

## Canonical dimensions

Keep unrelated status dimensions separate. Use canonical code values from shared constants or controlled database values, never freeform strings.

Student type: `NEW_STUDENT`, `TRANSFEREE`, `CONTINUING_STUDENT`.

Student status: `APPLICANT`, `ADMITTED`, `ACTIVE`, `INACTIVE`, `GRADUATED`.

Academic classification: `REGULAR`, `IRREGULAR`.

Academic progression: `ELIGIBLE_NORMAL`, `ELIGIBLE_WITH_DEFICIENCIES`, `LIMITED_PROGRESSION`, `TEMPORARILY_RESTRICTED`.

Enrollment status: `NOT_ELIGIBLE`, `ELIGIBLE`, `IN_PROGRESS`, `SUBMITTED`, `FOR_VALIDATION`, `NEEDS_ACADEMIC_REVIEW`, `REQUIRES_CORRECTION`, `VALIDATED`, `CONFIRMED`, `CANCELLED`.

Do not introduce `Pending Validation`, `Approved Enrollment`, or a generic `Pending Enrollment` status. `CONFIRMED` is the canonical final enrollment status.

## Enrollment state rules

1. `NOT_ELIGIBLE` may become `ELIGIBLE` only when its blocking condition is resolved.
2. `ELIGIBLE` may become `IN_PROGRESS` when the student starts enrollment.
3. `IN_PROGRESS` may become `SUBMITTED`, `NEEDS_ACADEMIC_REVIEW`, or `CANCELLED` as permitted by the workflow.
4. `SUBMITTED` moves to `FOR_VALIDATION` or `NEEDS_ACADEMIC_REVIEW` after current validation.
5. `FOR_VALIDATION` may become `VALIDATED`, `REQUIRES_CORRECTION`, or `NEEDS_ACADEMIC_REVIEW`.
6. `NEEDS_ACADEMIC_REVIEW` is resolved by Academic Coordinator workflow and returns to `FOR_VALIDATION` or `REQUIRES_CORRECTION`.
7. `REQUIRES_CORRECTION` returns to `IN_PROGRESS`, then must be resubmitted.
8. Only the Registrar can move a valid transaction to `VALIDATED`, then to `CONFIRMED`.
9. Student submission is not official enrollment approval. Official completion occurs only at Registrar confirmation.
10. A confirmed transaction is not ordinarily editable or deletable. Corrections must be authorized, traceable, and history preserving.

## Student pathways

New Student and Transferee initial enrollment starts only after completed Admission handoff. Transferee accreditation is not repeated inside Enrollment. Consume approved credited and deficiency results.

Continuing Regular students receive the normal eligible curriculum set for the active term.

Continuing Irregular students are still evaluated subject by subject. Show retake, eligible, restricted, and not offered subjects with reasons. Do not treat Irregular as automatic enrollment rejection.

Limited Progression means only an allowed subset or reduced load may be selected. Do not force whole year repetition unless a configured institutional rule explicitly requires it.

## Implementation expectations

Make state transitions explicit and guarded. Revalidate current data before submission and again during Registrar processing or confirmation. Record important transitions, corrections, academic decisions, confirmations, and integration events in audit history.
