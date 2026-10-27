# Phase 8 Registrar Grade and Enrollment Integration

**Implementation report:** 2026-10-26

**Repository:** `plp-enrollment-system`

**Target:** `PLP_PROJECT_600_2026_1`, current `TERM-2026-1`, prior `TERM-2025-2`

**Source of scope:** `PLP_Enrollment_System_Complete_Registrar_Grade_Import_Phase8_Enrollment_COR_Implementation_FINAL.md`

**Release status:** Local code integrated and builds successfully. End to end project enrollment and grade publication remain **blocked** pending the approvals and real records identified below. No GitHub push, main branch merge, or Vercel deployment was performed.

## 1. Verified source and live baseline

| Check | Observed |
| --- | --- |
| Updated grade source fixtures | Eight XLSX workbooks, `Grades` and `Instructions` sheets, 12 source rows per workbook |
| Historical source records | 96, comprising 93 `COMPLETED` and three intentional `FAILED` fixtures |
| Failed fixture identities | `25-50004` Computer Programming 2, `25-50013` Discrete Structures, `25-50022` Computer Networks 1 |
| Current block | `BSIT-2A`, UUID `456b850d-3241-505f-a718-f35ff3ce4be1` |
| Current block student roster | 15 PROJECT_ONLY students, 12 continuing and three transferees |
| Prior historical grouping | `BSIT-1A`, a project historical grouping; no authentic TERM-2025-2 physical block was found |
| Historical curriculum | `P8F26-BSIT-V1`, First Year, Second Semester, eight subjects |
| Current curriculum offerings | Seven subject sections, all `PLANNED` with `FINALIZED` schedules, twelve active weekly meetings |
| Existing simulated academic results | All 96 sampled prior results were `COMPLETED` in current Phase 8 canonical simulation before publication |
| Existing accepted project grades | None at latest check |
| Existing confirmed project simulations | One, the previously confirmed student `25-50001`, with zero persisted registered subjects |
| Project transfer credits | 150 for the cohort, including 100 `PROJECT_CREDITED` and 50 `PROJECT_PENDING`; BSIT-2A has six credited and three pending among its three transferees |
| Historical professor evidence | Eight project historical subject mapping slots, all without verified instructor identities |

The three supplied failing test cases are **conflicts**, because their current canonical simulated records say `COMPLETED` with passing values. The reconstructed Art Appreciation workbook is a project test fixture, not independent professor issued evidence. Neither category is automatically accepted as authoritative.

## 2. Application changes

### Registrar Grades

Added a separate PROJECT_ONLY source mode inside the existing Registrar Students grade import and history tabs while keeping the institutional grade import code intact.

The new project parser supports XLSX and CSV, named `Grades` worksheet plus optional `Instructions`, the nine required headers and two optional historical metadata headers. It rejects formulas, unsupported headers, wrong subject/term/block context, duplicate source references, duplicate students, unexpected roster members, formula-like cell values and unverified named professors.

Protected server actions provide source template generation, preview, project batch stage, stored reconciliation, source verification, block publication and grade correction requests. Historical `BSIT-1A` is correctly represented as an explicit grouping of the twelve continuing students now assigned to `BSIT-2A`; it never borrows the current term `BSIT-1A` UUID. Existing results are marked `ALREADY_PRESENT` only when grade and completion status match; contradictions are `CONFLICT`. No canonical result is silently replaced.

The project history view reads persisted batches, row errors, checksums, source references, publication records and correction requests. It includes text search, eight item pagination and a verification coverage calculation. Original XLSX binaries are **not** persisted in Supabase Storage.

### Academic eligibility, progress and transferees

Student academic history, progress and prerequisites use only individually accepted `project_grade_result_acceptances` records. Raw Phase 8 seed results do not count as published prior grades. Where acceptance has not occurred, continuing student readiness remains `PENDING_EVALUATION`.

Transferees now have a separate PROJECT_ONLY credit adapter that verifies cohort and curriculum provenance and accepts only `PROJECT_CREDITED` evidence in the fictional project pathway. `PROJECT_PENDING` remains a deficiency and does not become an official transfer credit. Student Academic Records distinguishes accepted project results from institutional grades and project transfer credits.

### Cross role timetable, enrollment and COR

The Registrar Academic and Scheduling server query now reads the same project specific block, section, instructor and meeting records as the Coordinator, through a role checked server reader. The source of the zero section mismatch was Registrar facing visibility of the synthetic planning tables. Live joins independently show the seven expected linked sections and twelve meetings; a signed in Registrar page rendering test remains pending.

Student enrollment prepares only current term, individually eligible subjects with valid **OPEN** sections, verified timetables, and configured price data. A role authorized student submission follows `OPEN → project_phase8_register_prepared_subjects_v1 → SUBMIT`. Subject selection comes from the trusted server, not browser supplied IDs. Confirmation requires stored selected subject rows.

The Student Class Schedule, confirmed enrollment summary, Registrar project COR modal, printable view and PDF endpoint all require a persisted, internally consistent confirmed subject and meeting snapshot. A previous confirmation with no registered subject rows is **not** silently populated. The project COR includes the student identity, academic term, year and semester, classification, block, subject sections, recorded meeting schedule, total units, registration reference, Registrar confirmation identity and a clear project record notice.

Registrar Reports now includes protected project grade batch history and counts. The official enrollment and student detail read models resolve permitted app user names instead of automatically rendering `Not available`.

## 3. Live Supabase work performed

The following were applied directly to the connected database through scoped transactional SQL. No separate SQL migration files were created, following the current repository live correction policy.

**New project only RLS tables**

1. `public.project_grade_import_batches`
2. `public.project_grade_import_rows`
3. `public.project_grade_result_acceptances`
4. `public.project_historical_subject_instructors`
5. `public.project_phase8_enrollment_subject_snapshots`
6. `public.project_grade_correction_requests`

All six tables have Row Level Security enabled and direct `anon` and `authenticated` privileges revoked. The eight historical subject mapping slots were inserted for the exact block and prior term, with `UNVERIFIED_SOURCE` attribution and null instructor IDs.

**Database contracts and guards**

* `registrar_project_grade_publish_block_v1(uuid,text,uuid[])`: active Registrar only; locks the named project release; requires eight distinct verified batches and 96 perfectly reconciled rows; atomically inserts accepted project evidence and publication status; never writes official grade tables.
* `registrar_project_grade_request_corrections_v1(uuid,text)`: records conflict review requests with proposed and prior values and an actor/reason; does not alter canonical grades.
* `project_phase8_register_prepared_subjects_v1(uuid,text[])`: active owning project student only; validates same student and term, project schedule, enrollment window, recorded eligibility and accepted prerequisites, OPEN sections and active meetings; records section, subject, units and meeting evidence in a controlled transaction.
* `project_phase8_require_subject_snapshot_v1()`: a registered project subject and valid current section are required for subsequent SUBMITTED, VALIDATED and CONFIRMED_SIMULATION transitions; confirms timestamp of selected rows at final confirmation.
* `project_enrollment_published_grade_gate_v1()`: protected previous academic evidence for continuing students, scoped project transfer credit evidence for transferees, role specific Registrar versus student transitions, configured failure limit.
* `project_phase8_demonstration_cor_v1(uuid)`: returns immutable registered subjects and meetings, total units, project provenance and confirming Registrar only for a confirmed role authorized record; incomplete legacy COR retrieval raises a protected error.

The previously existing project simulation and status event records are preserved. The already confirmed pilot remains in its original state, with no invented registered courses.

**Postflight evidence at last verified read**

| Table or metric | Rows |
| --- | ---: |
| Official `enrollments` | 11 |
| Official `academic_results` | 8 |
| Official `grade_import_batches` | 0 |
| New project grade batches | 0 |
| New project accepted results | 0 |
| New grade correction requests | 0 |
| Project historical subject mappings | 8 |
| Project registered subject snapshot rows | 0 |
| Previously confirmed project simulations | 1 |
| BSIT-2A subject sections | 7 |
| BSIT-2A active meetings | 12 |

Metadata probes confirmed that new project tables have RLS enabled, no direct `authenticated` SELECT or INSERT, and no anonymous function EXECUTE privilege. Limited SQL role simulations also verified denial of project grade publication to the student role, denial of legacy snapshotless COR access and refusal to replace a previously confirmed pilot's selected subjects. These are database role simulations, not an authenticated browser session.

## 4. Tests and checks

* `npm run lint`: passed.
* `npm run build`: Next.js production build passed locally, including all 31 generated route checks.
* Selected project import, fee, student submission and COR tests: passed 24/24 at integrated check.
* Final scoped `src/features` test run: **74 passed, zero failed**, using fifteen feature test files other than the older broken fixture dependent test described below.
* Project XLSX/CSV parser tests verify two sheets, all eleven accepted headers, twelve member roster, malicious inputs, wrong previous term, unverified professor metadata and all three conflicts.
* Student submission tests verify the OPEN, selected subject persistence, SUBMIT order, returned drafts, and failure on missing/incorrect persistence acknowledgement.
* COR tests verify that confirmed outputs require real selected sections, meeting evidence, consistent units and correct project provenance.
* `git diff --check`: passed.

One broad `node --test` discovery run also found preexisting or environment dependent unrelated checks that fail without authenticated browser login and an older removed academic fictional seed script. These are not evidence of a successful browser end to end run. Targeted feature suites otherwise pass; see terminal output for specific cases.

## 5. Blockers and required protected decisions

1. **Historical grade conflict approvals.** The three `FAILED` examples disagree with current canonical simulated results. A verified Registrar may stage, reconcile and request individual protected corrections. The owner must explicitly approve canonical changes with an audit trail before affected rows can be accepted and published. The remaining constructed Art Appreciation values also require comparison and independent review if they differ.
2. **Independent evidence and uploaded batches.** At the time of this report no actual Registrar authenticated source batches have been staged or verified, and the acceptance ledger remains empty. Consequently continuing student published readiness is intentionally pending.
3. **Academic Coordinator section opening.** The seven BSIT-2A subject sections are currently `PLANNED`. They need Coordinator authorization and real `OPEN` state before student registration. No section was silently opened.
4. **Existing pilot confirmation.** Student `25-50001` already has a project confirmation with zero saved subject snapshots. The owner must approve an audited protected reversal/reconciliation before a genuinely registered COR can be generated; the previous confirmation has not been rewritten.
5. **Historical professors.** Eight subject mapping slots exist, but no verified term scoped faculty attribution was available. No real professor names were invented or borrowed from current semester instructors.
6. **Authenticated acceptance tests.** No complete real student to Registrar browser flow could be performed because publication evidence, section opening and the pilot correction are still unresolved. Current positive tests use isolated valid inputs and mocked RPC responses; live SQL validates metadata and negative permission paths.
7. **Production rollout.** All code remains in the existing local working tree on the main branch, without a commit, push, merge or production deployment. Live database modifications are already applied and must remain coordinated with the current code contracts when deployment is approved.

## 6. Controlled next sequence

Use an active Registrar identity to upload the eight exact sources through PROJECT_ONLY import. Review the returned conflicts; provide owner approval for each permitted project-only correction and for the legacy pilot reconciliation. After source verification and atomic grade publication, recheck individual prerequisites, transfer credit and class eligibility. Have the Academic Coordinator open only validated project sections. Use authorized student credentials for actual prepared submission, then Registrar validate and confirm. Independently re-query the stored subject snapshot, COR and registered timetable; verify role denials and unchanged official baseline. Only then consider Git and Vercel production approval.

**Safety statement:** This implementation does not turn fictional Phase 8 grades, professors or CORs into institutional records.

## 7. October 26 live data-loading incident and scoped permission repair

The Registrar PROJECT_ONLY Grade Import workspace and the pilot Student Enrollment page displayed generic unavailable notices despite existing, verified project data. Root cause was SQL `42501` on live `service_role` reads, not invalid student Auth or missing academic records. The optional `registrar_project_grade_workspace_v1` RPC was absent, so the role-verified Registrar server action correctly chose its direct server-only workspace reader, but that reader lacked table grants.

Controlled direct live SQL repair (no migrations or record modifications):

* `GRANT SELECT, INSERT, UPDATE ON TABLE public.project_grade_import_batches, public.project_grade_import_rows TO service_role;`
* `GRANT SELECT ON TABLE public.project_grade_result_acceptances, public.project_grade_correction_requests TO service_role;`
* `GRANT SELECT ON TABLE public.project_enrollment_academic_policy TO service_role;`

These narrowly scoped grants serve the existing server-only authenticated Registrar workspace/staging implementation and Student academic policy loader. No new `anon` or `authenticated` table privileges were granted. Post-change access checks confirmed `service_role` SELECT on all five tables; INSERT/UPDATE is permitted only on the two project import staging tables, not on result acceptance or correction ledgers. Live read-only service role probes returned zero staged/accepted rows and the existing `maximum_unresolved_failed_subjects = 3` project policy. The actual Registrar fallback server client successfully reloaded the verified historical scope: 15 placed students, 12 continuing students, 96 historical canonical rows across eight subjects, and the four protected project grade tables.

Student pilot `25-50001` remains Active with password rotation completed. A transaction-scoped authenticated JWT role probe returned the correct project snapshot and confirmed simulation; live data integrity was not repaired or altered. Enrollment preparation and demonstration COR remain subject to the academic approval and immutable snapshot restrictions described in Section 5. Local source code now includes safe frontend/server diagnostics and regression checks for these lookup failures; an authenticated UI walkthrough has not been completed. No GitHub push, merge or Vercel deployment occurred.

## 8. October 26 pending grade conflict: protected review implementation

The Registrar uploaded a Computer Programming 2 source batch for BSIT-2A and validated 12 records. Its student `25-50004` source grade `5.00 FAILED` conflicts with the canonical fictional `2.00 COMPLETED`. Existing request `b611138f-0fa4-4fb5-9da7-c140096007a5` remains `REQUESTED`, the batch `37371c3f-9c4e-48ba-9330-1bf47a0d6482` remains `CONFLICT_REVIEW`; no academic grade has been changed without explicit evidence-based approval.

Added directly to the live PostgreSQL project (without migrations) two guarded SECURITY DEFINER RPCs, both not executable by `anon`:

* `academic_coordinator_project_grade_decide_v1(uuid,text,text,text)`: active `academic-coordinator` only; independent reason, evidence reference, and explicit `APPROVE_IMPORTED` or `REJECT_IMPORTED`; prohibits approving one's own request; uses project/term/cohort/subject/record snapshot comparisons, transactional advisory lock, and rejects already accepted results. An approval atomically modifies only `project_simulated_academic_results` with a preserved provenance revision, marks source row `ALREADY_PRESENT`, request `APPLIED` and batch `READY_FOR_REVIEW` when all 12 rows match; a rejection marks the request `REJECTED` with no grade mutation. Both append `audit_events`.
* `registrar_project_grade_cancel_batch_v1(uuid,text)`: active Registrar only; permits cancellation of the conflicting project source *only after* every conflicting row's review was rejected; preserves rows, workbook metadata and correction history, marks the batch `CANCELLED`, and writes an audit entry. A revised file with a new checksum can then be uploaded.

Added `project-grade-correction-review-actions.js`, and updated `registrar-project-grade-actions.js`. The Academic Coordinator's existing Academic Review gained a `Project Grade Corrections` tab with an explicit decision modal; Registrar Review Grades gained decision status, refresh, duplicate-request guard, and rejected-source replacement. These are separate role owners and no privileged browser key is exposed.

### Academic Coordinator visible queue diagnosis (October 26 follow-up)

The Academic Review screenshot displaying `Project Grade Corrections (0)` while `Pending Reviews (0)` was selected does **not** prove the backend was disconnected. The original grade correction React state initialized as empty with `loading: false` and deliberately skipped `loadProjectGradeCorrectionReviews()` unless the third tab was selected, so the initial tab counter falsely showed zero before any query. The frontend now proactively loads the AC-authorized project grade correction list on mount, displays `Loading…` and `Unavailable` when applicable instead of a fabricated zero, and provides visible error/retry feedback. The read-only project grade request action retains strict server-side role enforcement.

The **two other tabs represent a different queue**: project-only *enrollment academic exception* reviews, not grade source discrepancies. A live pending row in `academic_reviews` belongs to curriculum `BSIT-2024` and an enrollment/student lacking Phase 8 PROJECT_ONLY cohort provenance, so its exclusion from the restricted project queue is correct and must not be bypassed. The verified `PROJECT_ONLY` source has exactly one `REQUESTED` correction for student `25-50004`; current term/scope original grade remains unchanged. A direct read-only request with the app's server-side Supabase credentials recovered exactly one scoped batch, one correction request, and one linked source row, with no SQL errors. No project-only academic enrollment exception reviews currently qualify for the other two tabs. No academic decisions/grade modifications, official record changes or deployments were performed.

Verification at the time of implementation: both approval and rejection-then-cancellation were exercised using authenticated role identities **inside explicitly rolled-back transactions**; cross-role denials also passed. That historical snapshot had grade `2.00 COMPLETED`, request `REQUESTED`, batch `CONFLICT_REVIEW`, zero actual applied decisions and zero project acceptances. Subsequent live grade approval is recorded in the newer section below. The official baselines remained 11 `enrollments`, 8 `academic_results`, zero official `grade_import_batches`. Focused grade-import regression suite 38/38 PASS, lint PASS, Next.js production build PASS, `git diff --check` PASS. No authenticated multi-role browser acceptance and no Git push, merge, or Vercel deployment.

## 9. Approved failed prerequisite scenario and enrollment recheck (October 26)

**Current state supersedes the earlier pending state:** The Academic Coordinator explicitly approved the imported grade `5.00 FAILED` for student `25-50004` in Computer Programming 2 (`P8F26-BSIT-T02-M1`), historical term `TERM-2025-2`. Live correction `b611138f-0fa4-4fb5-9da7-c140096007a5` is `APPLIED`, its batch is `READY_FOR_REVIEW`, and the fictional canonical grade is `5.00 FAILED`. No official grade was changed.

The sole immediate active current-semester dependent for this BSIT student is Data Structures and Algorithms for IT (`P8F26-BSIT-T03-M1`), which requires a passing Computer Programming 2 result. The stored `project_subject_eligibility` record was still `ELIGIBLE` after the approved grade change. A guarded live transactional correction updated **only this derived PROJECT_ONLY subject row** to `RESTRICTED`, recorded the approved correction reference and exact failed-prerequisite reason in metadata, and appended a `PROJECT_ONLY_PREREQUISITE_RECALCULATED` audit event. The student's placement/classification and all other students' project results were left unchanged.

The existing `project_phase8_register_prepared_subjects_v1` function already rechecked accepted passing prerequisite evidence, so its protection remains. A further direct PostgreSQL guard was installed as `a_project_phase8_live_prerequisite_guard_v1` (before status change) invoking `project_phase8_live_prerequisite_guard_v1()`. On `SUBMITTED`, `VALIDATED` and `CONFIRMED_SIMULATION` transitions, it rechecks all saved subject selections against the current student/curriculum/year/term eligibility, previous completed or credited subjects, active prerequisite passing grades recorded in `project_grade_result_acceptances`, and project transfer credits. It blocks an old prepared subject list after a newly failed prerequisite and does not bypass existing grade-coverage, timetable or user-role guards. The trigger function has no direct `PUBLIC`, `anon` or `authenticated` EXECUTE grant.

**Live verification:** Corrected subject eligibility `RESTRICTED`, previous grade `5.00 FAILED`, zero accepted passing prerequisite evidence, zero qualifying transfer credit; both project eligibility and dynamic prerequisite SQL gate reject Data Structures. A controlled transaction temporarily created a draft and selected Data Structures, verified that a status change to `SUBMITTED` was rejected by the new prerequisite trigger, then **rolled back**. After rollback the student still has zero enrollment simulations and zero subject snapshots. Official counts remained 8 `academic_results`, 11 `enrollments`, zero `grade_import_batches`. Focused Student and prerequisite tests 23/23 PASS, ESLint PASS, production build PASS, `git diff --check` PASS.

**Remaining complete demonstration dependencies:** Student `25-50004` still has zero accepted project historical grades. The Registrar must verify this grade source and the remaining seven subject source batches and publish all eight together before the student can become academically ready; afterward one failed subject implies dynamic `IRREGULAR` readiness, but the dependent Data Structures subject remains `RESTRICTED` and unrelated eligible subjects may proceed. Its BSIT-2A current class sections remain `PLANNED` and require authorized opening. Mandatory first-login password rotation has not been completed for this student. No signed-in browser end-to-end test, Git push, merge, or Vercel deployment took place.

## 10. Fictional previous-semester professors in the historical grade import (October 26)

The user explicitly requested one **fictional demonstration professor per historical BSIT-1A subject**, displayed in the Registrar grade import workflow and, after actual grade publication, in the owning student's Academic Records. This attribution is **not evidence of university faculty employment, verified historical instruction, or a real source issuer**.

An audited transaction inserted exactly eight distinct `instructors` with `is_synthetic_demo=true`, `app_user_id=NULL`, source keys prefixed `PROJECT_ONLY_BSIT1A_TERM2025_2:` and explicit noninstitutional metadata. Each of the eight preexisting `project_historical_subject_instructors` records for cohort `PLP_PROJECT_600_2026_1`, current BSIT-2A block `456b850d-3241-505f-a718-f35ff3ce4be1`, historical BSIT-1A group and `TERM-2025-2` now links to one synthetic instructor with `assignment_provenance='PROJECT_FICTIONAL_ASSIGNMENT'` and `verified_institutionally=false`. Existing `source_reference` values were preserved. Eight `PROJECT_ONLY_FICTIONAL_HISTORICAL_PROFESSOR_ASSIGNED` audit events were recorded. The new protected reader received **service_role SELECT only** for historical mappings. `anon` and `authenticated` still have no direct SELECT.

| Previous subject code | Subject | Fictional professor |
| --- | --- | --- |
| P8F26-BSIT-T02-M1 | Computer Programming 2 | Prof. Adrian Velasco |
| P8F26-BSIT-T02-M2 | Discrete Structures | Prof. Bianca Salazar |
| P8F26-BSIT-T02-M3 | Web Systems Fundamentals | Prof. Carlo Mercado |
| P8F26-BSIT-T02-M4 | Computer Networks 1 | Prof. Diana Navarro |
| P8F26-BSIT-T02-M5 | Human-Computer Interaction | Prof. Emilio Bautista |
| P8F26-GE-T02-1 | Readings in Philippine History | Prof. Francesca Rivera |
| P8F26-GE-T02-2 | Science, Technology and Society | Prof. Gabriel Mendoza |
| P8F26-GE-T02-3 | Art Appreciation | Prof. Helena Soriano |

The protected Registrar source loader now fetches and checks mappings against synthetic-only instructor identities. The Upload page shows the selected subject's fictional professor; Review and Publish show corresponding mappings, and preview/review source rows show the **actual professor text supplied by the workbook** separately. The XLSX/CSV precheck accepts the exact mapped fictional professor in `previous_subject_professor` or the historical `NOT_VERIFIED_IN_SOURCE` placeholder; invented, mismatched or unassigned names are rejected. Neither source row, source checksum, batch verification, immutable evidence nor grade results are rewritten when mapping changes. Already uploaded source files continue to retain their original `NOT_VERIFIED_IN_SOURCE` column until an independently authorized replacement workflow occurs.

The Student Academic Records server retrieves the same scoped mapping only for accepted, published PROJECT_ONLY historical grades belonging to the authenticated continuing student and valid placement. The Academic History table and detail modal explicitly mark professors as **Fictional Demo**. An unpublished staged grade gains no student visibility or prerequisite eligibility from faculty assignment alone. Current live source state after the faculty transaction: two staged batches (Computer Programming 2 verified; Discrete Structures awaiting evidence verification), no published target-student acceptances, and unchanged official counts of eight academic results and eleven enrollments. The approved `5.00 FAILED` Computer Programming 2 result and RESTRICTED Data Structures prerequisite are preserved. No GitHub push or Vercel production deployment was performed.

Verification: live database returned all eight synthetic mappings and eight audit entries, verified `service_role` SELECT with denied `anon`/`authenticated` direct reads, and preserved grade baselines. Fifty-seven focused tests (including previously completed Student checks) passed; final post-change professor/import regression suite **34/34 passed**, ESLint, production build and `git diff --check` passed. Signed-in browser visualization after grade publication is still pending.

## 11. Published grade completion and prepublication legacy confirmation (October 26)

The Registrar completed the protected grade publication **after** the earlier state snapshots: live Supabase now contains eight `PUBLISHED_PROJECT` batches, 96 accepted individual historical grades, and eight accepted previous results for pilot student `25-50001` (Miguel Marie Garcia; all eight `COMPLETED`). No official `academic_results`, `enrollments` or institutional `grade_import_batches` was changed (baseline 8, 11, 0 respectively). The previous report's references to missing grades are historical and superseded by this publication.

The same student had already been transitioned through OPEN, SUBMIT, VALIDATE and CONFIRM on October 23 to 24, before protected subject snapshot requirements and the complete historical publication. Live simulation `ee1c3f71-2b63-408e-a4f3-b000cb0e9142` is still `CONFIRMED_SIMULATION` with `confirmed_at` present, but **zero** `project_phase8_enrollment_subject_snapshots` rows. The protected `project_phase8_demonstration_cor_v1` correctly rejects such a record; the previous Registrar frontend misleadingly labeled that simulation "Enrolled (Project)" and unconditionally exposed View COR, producing a returned action failure and a separate Next.js development console overlay.

The local Registrar fix now uses the role checked project enrollment queue and authenticated `project_phase8_demonstration_cor_v1` to check COR availability when opening an enrollment detail. The button is displayed only for verified complete registrations. A legacy confirmation shows a clear warning without rewriting or inventing any registered subjects. Its confirmation and full event audit history remain untouched. The Registrar status wording now distinguishes `Confirmed simulation` from genuine COR readiness rather than declaring a student fully enrolled. The Registrar's `Current Semester Subject Eligibility` table is rebuilt from the student's verified project placement, First Semester curriculum subjects and `loadStudentPublishedReadiness` backed by accepted prior grades, not potentially stale generated subject statuses; it is explicitly **not** a confirmed registration list. Expected Registrar action refusals use console warnings instead of triggering Next.js error overlays.

The signed-in browser acceptance of these new local UI changes remains outstanding, but unit-level validation confirms the old confirmed simulation cannot pass as COR-ready, mismatched or missing current semester eligibility fails closed and read-only Registrar queries stay role restricted. Tests: 23 passed; ESLint, production build and `git diff --check` passed. No live data was changed during this repair, no GitHub push and no Vercel deployment occurred. Completing Miguel's registration **still requires an authorized, auditable correction/re-enrollment workflow** to remedy the old immutable confirmation; no COR may be issued from the old status alone.
