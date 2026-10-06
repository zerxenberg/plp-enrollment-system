---
name: plp-academic-validation
description: Apply PLP academic eligibility, curriculum, prerequisite, subject, unit, section, schedule, regular and irregular classification, progression, and academic review rules.
---

# PLP Academic Validation

Use this skill when implementing enrollment eligibility, academic classification, subject filtering, prerequisite checks, curriculum rules, sections, schedules, unit validation, or Academic Review.

## Rule ownership

The Academic Coordinator owns academic setup and defined exception decisions. The Enrollment System applies those rules automatically. The Registrar owns official enrollment processing after validation.

Official grade computation is outside Enrollment scope. Consume authoritative subject completion results such as `COMPLETED`, `FAILED`, `INCOMPLETE`, and `CREDITED`.

## Eligibility sequence

Evaluate at least the following before final submission and recheck current data during Registrar processing:

1. Active authenticated account and active Student record.
2. Completed Admission handoff when applicable.
3. Active academic term and open enrollment period.
4. Program and assigned curriculum compatibility.
5. Availability of authoritative academic results for continuing students.
6. Subject active status and current term offering.
7. Duplicate subject selection.
8. Previously completed or credited subject rules.
9. Prerequisite completion.
10. Configured unit load rules.
11. Section `OPEN` state and current capacity.
12. Schedule conflict checking.
13. Defined academic review requirements.

## Subject level rules

Evaluate eligibility individually. A failed prerequisite blocks the dependent subject, not the whole enrollment, unless a configured institutional rule explicitly says otherwise.

Use subject eligibility values such as `ELIGIBLE`, `RETAKE`, `RESTRICTED`, and `NOT_OFFERED`. Keep restricted subjects visible when useful and show the reason.

`COMPLETED` and applicable `CREDITED` results satisfy curriculum requirements and prerequisites. `FAILED` identifies retake need. `INCOMPLETE` is a deficiency and is not treated as completed for prerequisite purposes by the current project standard unless future institutional policy changes it.

Do not allow duplicate selections. Do not silently repeat an already completed or credited subject unless a configured repeat rule or approved exception permits it.

## Curriculum and prerequisite integrity

Preserve a student's assigned curriculum version. Do not silently replace it with a newer curriculum version.

Prerequisite rules are scoped to the relevant curriculum and effective term. Reject duplicate, invalid, or circular prerequisite relationships.

Corequisites are not part of the first version because the current project sources do not define a separate corequisite model. Add them only after a project decision, preferably as another academic rule type rather than a duplicate management module.

## Classification and progression

`REGULAR` means the student follows the expected curriculum sequence with no unresolved condition that makes the current enrollment irregular.

`IRREGULAR` covers deficiencies, retake needs, transfer differences, incomplete requirements, or valid off sequence plans. Irregular does not mean rejected.

Progression values are `ELIGIBLE_NORMAL`, `ELIGIBLE_WITH_DEFICIENCIES`, `LIMITED_PROGRESSION`, and `TEMPORARILY_RESTRICTED`.

Do not infer Regular status only from year level. Do not force whole year repetition automatically. Determine the allowed subject set from curriculum, completion results, prerequisites, offerings, and configured rules.

## Units, sections, and schedules

Exact numeric PLP unit limits are not finalized. Keep them configurable. Until confirmed, use the normal curriculum load for the active term as the default self service maximum and require Academic Review for permitted overload rather than silently accepting it.

Only `OPEN` sections with remaining capacity are selectable. Recheck capacity at submission and Registrar validation because availability can change.

Block overlapping class schedules and identify the conflicting sections so the student can correct the plan.

## Academic Review

Use academic review only for defined exceptions that require human academic judgment. Scope a decision to the identified student, enrollment transaction, subject when applicable, failed rule, reason, and decision record.

Canonical review states are `PENDING`, `RETURNED_FOR_CLARIFICATION`, `APPROVED`, `REJECTED`, and `APPLIED`.

An approved exception affects only its documented scope. It must not become a global bypass unless the academic rule itself is deliberately changed through Academic Setup.
