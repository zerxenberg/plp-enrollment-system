# Admissions Institutional Academic Readiness

## Verified current state, October 30, 2026

Four accepted Admissions applicants have institutional student numbers and successful handoffs. Their Student accounts are not Phase 8 fictional student records. They are still ADMITTED, without verified curriculum, active term assignment, official enrollment, confirmed home block, approved subject eligibility, or official schedule. Three Freshmen have First Year recorded. The Transferee year level has not been evaluated.

TERM-2026-1 is Open from October 1 through November 30, 2026. P8F26-BSIT-V1 and its published BSIT-1A block belong to the Phase 8 fictional dataset and are explicitly NOT official. The nonsynthetic BSIT-1M block remains DRAFT, with seven unfinalized sections and incomplete meetings, so it cannot be used as an approved student placement. Older BSIT-2024 has no complete, finalized institutionally approved first-year class plan. A real student must not be enrolled in a fictional project section.

## Implemented local integration

The institutional Student Dashboard, Enrollment, Academic Records and Class Schedule now use a guarded student-scoped data loader, a shared visual design, and real-source-only readiness checks. Reference fictional curricula are clearly identified and cannot activate the official enrollment actions. Existing recorded institutional grades and approved transfer decisions are read independently from generated Phase 8 grade sources. The official COR link requires confirmed enrollment and a verified printable COR.

Student registration actions recheck identity and academic readiness on the server. The student cannot supply an arbitrary student, block or section ID, and cannot issue Registrar confirmation. Current unapproved academic configurations result in actionable reasons, not fabricated class schedules or tuition rates.

## Direct Supabase database safety hardening

On October 30, 2026, narrowly scoped and verified SQL transactions hardened three existing Enrollment official lifecycle RPCs without creating migration files. The official selector rejects fictional or non-OPEN sections and fictional offerings. The official submitter and Registrar confirmer reject fictional, non-OPEN or unfinalized sections. The function ownership and SECURITY DEFINER attributes were verified. All 11 existing enrollment rows remain unchanged. No Admissions student profile, block assignment, academic eligibility, official enrollment or historical grades were modified.

Two additional trusted PostgreSQL functions now support the future institutional workflow, available to the service role only, never to anonymous or ordinary authenticated callers:

* system_prepare_verified_admissions_student_v1(uuid) checks the authenticated student source and protected Admissions history, active term, one genuine published block, unique real final sections, original room/faculty source, capacity and all academic eligibility; only a fully successful transaction records the current term, curriculum, ACTIVE academic clearance and a PROPOSED block and logs an audit event. A missing/fictional dataset rejects the entire transaction. This is initiated by a verified student preparation action after the Academic Coordinator authorizes actual source configurations, not on a page GET.
* system_queue_verified_enrollment_v1(uuid) verifies a submitted live institutional enrollment, real selected sections and source eligibility, then transitions SUBMITTED to FOR_VALIDATION with an audit history record. It cannot skip Registrar validation or issue COR.
* registrar_review_verified_admissions_enrollment_v1(uuid,text,text) is available only to an authenticated and active Registrar. It verifies genuine selected sections before moving FOR_VALIDATION to VALIDATED, or records an authorized REQUIRES_CORRECTION review reason. Both outcomes append transactional status history, separately from final confirmation.
* student_reopen_admissions_correction_v1(uuid) is available only to the student who owns the returned real enrollment. It records REQUIRES_CORRECTION to IN_PROGRESS and allows correction or resubmission without creating another enrollment row.

The user-facing preparation action invokes the guarded placement function and then re-reads the approved subjects before opening an enrollment and selecting them through existing student-owned RPCs. The applicant must still explicitly submit for Registrar validation; the Registrar alone confirms the official enrollment.

## Pending authorizations

1. Academic Coordinator: approve a genuinely institutional curriculum and complete required subjects for the open term. Do not change the fictional provenance of the Phase 8 curriculum merely to pass testing.
2. Academic Coordinator: publish nonsynthetic ACTIVE offerings, OPEN sections, FINALIZED schedules and real room/professor assignments, respecting capacities and current publication guards. The draft BSIT-1M block is not ready.
3. Academic Coordinator and Registrar: evaluate the Transferee year level; a missing transfer credit cannot be fabricated or classified as CREDITED.
4. Registrar: after genuine academic readiness, authorize student curriculum, term and compatible block placement, perform official eligibility initialization, and validate submitted enrollment before confirmation. The present official Registrar review UI does not yet implement the complete SUBMITTED to VALIDATED workflow.
5. Student: review verified section, unit and fee information, submit, and obtain a COR only after Registrar confirmation.

End-to-end live assignment, submission, Registrar validation and COR tests remain blocked until these academic approvals and authentic published schedules exist. Do not claim the Phase 8-only schedule as an institutional one.
