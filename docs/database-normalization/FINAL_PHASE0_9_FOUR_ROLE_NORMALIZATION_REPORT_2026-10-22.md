# PLP Enrollment System
## Four Role Security, PostgreSQL Normalization and Schema Cleanup Implementation Report

**Report date:** 22 October 2026  
**Live target:** Supabase project `iwuphtvlcszziyvqcbsl`  
**Approved baseline:** `Final Normalized - Cleaned ERD and Schema Database Plan for the four simplified user roles documentation.docx`, particularly Chapters 3, 7, 14 and 15; current PLP role/domain/data-security skills and current scoped security policy.  
**Scope:** Phases 0–9, four role backend and SQL access, database normalization, Phase 8 academic controls and Phase 9 performance; no portal GUI redesign, Phases 10/11 implementation, student password batch rotation, or destructive historic-data cleanup.

## 1. Executive decision

**Structural normalization foundation and 600-account provisioning: VERIFIED.** All eight additive normalized entities exist, and all 600 project student identities are Active and individually approved. Original 2,128 synthetic planning accounts and four original Auth role accounts are preserved. Base schema has 68 tables, all with PK and RLS; 129 enforced FKs; no invalid/unvalidated public constraints; no public table TRUNCATE privileges for anonymous or authenticated clients.

**Full four-role/security and Phase 8/9 release: NOT YET ACCEPTED.** The live database still contains a serious enrollment status transition bypass in a SECURITY DEFINER trigger and a Student Profile field restriction gap. The authenticated role and cross-student negative cases are not independently verified using real signed-in user tokens. Academic source gaps, unpublished schedules, empty grade/transfer workflows and unverified restoration remain outstanding. No attempt was made to guess missing academic facts or silently mark these phases complete.

**Production mutation for this continuation:** NONE. This audit executed SELECT/catalog/EXPLAIN queries and local regression/build commands. The only application implementation change is a local trusted server Student route access gate. Two guarded database correction scripts have been prepared as **REVIEW_ONLY drafts, not deployed**. No official academic record, enrollment, Auth password, credential vault, staff role, or planning fixture was modified.

## 2. Exact current state

| Check | Verified value |
| --- | ---: |
| Public base tables / primary keys | 68 / 68 |
| Public base-table columns / foreign keys | 652 / 129 |
| Public UNIQUE / CHECK constraints | 51 / 123 |
| Public indexes / public RLS policies | 162 / 141 |
| Tables with RLS disabled / unvalidated constraints / invalid indexes | 0 / 0 / 0 |
| Supabase migration history entries | 42 |
| Current app users / student profiles / Auth identities | 2,748 / 2,737 / 604 |
| Auth linked, Active PROJECT_ONLY students | 600 |
| Cohort mix | 400 continuing / 150 new / 50 transferee |
| Unconsumed individual approval records | 0 |
| Consumed individually authenticated Admin approvals | 600 |
| Original inactive and unlinked synthetic planning accounts | 2,128 |
| PROJECT_ONLY completed initial password rotations | 1 |
| PROJECT_ONLY first login password rotations deferred | 599 |
| Unvalidated public constraints / client TRUNCATE grants | 0 / 0 |

All eight additions from the approved ERD are already live: `colleges`,
`student_data_cohorts`, `student_data_cohort_members`,
`student_number_counters`, `grade_import_batches`, `grade_import_rows`,
`academic_result_revisions`, and `transfer_credit_evaluations`. Do not reapply their original migrations.

## 3. Phase 0–9 progress against the approved ERD

| Phase | Result | Remaining specific gate |
| --- | --- | --- |
| 0. Backup and recovery | PARTIAL / intentionally deferred | Earlier full SQL backups were prepared, but an independently successful restore test was explicitly skipped. Unrehearsed destructive changes remain prohibited. |
| 1. Database reinspection | COMPLETE for this snapshot | Fresh live catalog compared to original 56-table blueprint baseline. |
| 2. Source data quality | PARTIAL | 34 unresolved academic source issues and 467 BLOCKED source import rows; five missing curriculum prerequisite placements; legacy identity/curriculum decisions. |
| 3. Final ERD verification | STRUCTURE COMPLETE, SEMANTICS PARTIAL | 68 primary-key tables, all additive entities and 129 validated FKs; some historical repeated fields require documented source/business meaning before deprecation. |
| 4. Schema expansion | COMPLETE for eight required tables | No duplication/reinstallation. Optional future typed-year shadow still not installed. |
| 5. 1NF, 2NF, 3NF standardization | PARTIAL | Verified junctions, typed attributes and 0 targeted duplicate/orphan problems, but legacy text year fields, college subtype mapping and some dependent business facts need evidence and reversible migration plans. |
| 6. 600 project cohort | COMPLETE for identities, NOT official academic records | Exactly 600 linked and separate from 2,128 original fixtures; draft rosters not automatically confirmed. |
| 7. Auth account rollout | COMPLETE for 600 account creation and activation | 599 individual password rotations intentionally deferred until user sign-in; live multi-account browser acceptance not asserted. |
| 8. Academic and scheduling preparation | PARTIAL | Five BSIT-2024 prerequisite gaps, six draft room conflicts, incomplete seven-subject/five-day draft blocks and untested publication/transfer pipelines. |
| 9. Security and performance | PARTIAL; SECURITY BLOCKER FOUND | Fix trigger actor bypass and Student Profile contact-only update rule, independently test signed role contexts, benchmark real workload before adding indexes. |
| 10–11. GUI integration and restoration cutover | EXCLUDED BY USER | No GUI changes or deferred full integration. |

## 4. Four role and RLS audit

### Role boundaries that must remain true

| Role | Permitted ownership | Explicit denial boundary |
| --- | --- | --- |
| Student | Own permitted profile/contact fields and preconfirmation enrollment choices | Other students' records; final Registrar confirmation; academic master data; roles/security |
| Registrar | Student record corrections, official enrollment validation and confirmation, approved grades-import workflow | Curriculum/prerequisite authoring, technical user/role/security administration |
| Academic Coordinator | Academic catalog, curricula, sections, timetables, academic exceptions | Registrar final confirmation; general student identity/technical administration |
| System Administrator | Accounts, access, integrations, security, technical audit/maintenance | Registrar enrollment confirmation, curriculum changes or academic business outcomes |

**Verified live structural protections:** 68/68 public base tables have RLS and postgres ownership; no anon/authenticated effective TRUNCATE on these; four public views use `security_invoker=true`; project staging/activation service RPCs distinguish privileged service access from signed individual administrator approval. Four original active Auth linked accounts map to the four canonical roles; 600 project accounts map to Student only. All 600 approval records were consumed with matching administrator actor, sealed recipient handoff and source identity.

**Actual live RLS role-context SELECT simulations:** A read-only SQL transaction set `ROLE authenticated` and session-local JWT claims for each previously linked role, then returned only aggregate row counts under PostgreSQL's real policy definitions, finally rolling back.

| Simulated current identity | App users visible | Student profiles visible | Enrollments visible | Grades visible | Admission records visible | Audit records visible |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rotated PROJECT_ONLY Student | 1 | 1 | 0 | 0 | 0 | 0 |
| Unrotated PROJECT_ONLY Student | 0 | 0 | 0 | 0 | 0 | 0 |
| Ordinary active Student | 1 | 1 | 1 | 0 | 1 | 0 |
| Registrar | 1 | 609 | 11 | 8 | 9 | 0 |
| Academic Coordinator | 1 | 0 | 11 | 8 | 0 | 0 |
| System Administrator | 2,748 | 0 | 0 | 0 | 9 | 115 |

The Student simulations returned zero *other* Student profiles. Unrotated PROJECT_ONLY accounts were appropriately locked out by the RLS mapping. These tests DO NOT prove API/JWT cryptographic sign-in or forbidden UPDATE/DELETE outcomes. Current System Administrator RLS exposes all nine `admission_handoffs` despite technical role boundaries; Academic Coordinator sees all 11 enrollments rather than a narrowly scoped review subset. Confirm integration-monitoring and Academic Review requirements before narrowing SELECT policies.

**Limitations:** Structural policies, server-side source analysis, role-context simulations and offline tests are **not equivalent to four genuine signed-in browser/API user sessions**. The first-login requirement for the remaining 599 continues to work as a gate but was not individually exercised by user request. The report does not claim all real JWT-level cross-role and unauthorized mutation tests passed.

### Security finding S1: Legacy Student portal account deactivation

**Confirmed source defect:** `getProjectOnlyInitialPasswordState()` previously treated any nonproject linked Auth account as `legacy` even if `app_users.account_status` was Inactive or `login_enabled` false. A surviving valid Auth session could therefore reach the Student portal layout without current app account permission.

**Implemented locally:** New `src/lib/auth/legacy-student-account-policy.mjs` and a fail-closed check in `src/lib/auth/project-only-first-login-server.js` enforce exact linked Auth identity, Student role, Active status and enabled login. Four dedicated regression tests verify active access and denial of disabled, forged, wrong role and project-prefixed accounts. The Next.js GUI is unchanged. **This source fix has not been committed/pushed/deployed to Vercel.**

### Security finding S2: Enrollment transition role bypass — P0

**Confirmed live SQL defect:** `public.validate_enrollment_status_transition()` is a `SECURITY DEFINER` trigger owned by postgres. It returns early when `current_user IN ('postgres','service_role')`. Inside SECURITY DEFINER, `current_user` is the function owner, so ordinary authenticated callers skip the intended `enrollment_status_transitions` actor whitelist if RLS permits their update. This undermines the final Registrar confirmation contract.

**Prepared, not deployed:** `docs/database-normalization/security-drafts/REVIEW_ONLY_20261022_enrollment_status_actor_guard.sql`. The draft checks a trusted signed request service role or direct postgres maintenance session, then enforces canonical actor transition rules for Student, Registrar and Academic Coordinator. It includes schema/trigger preflight and source test coverage. **Must be tested using actual signed role contexts, including permitted SYSTEM transitions and negative Student attempts, before production replacement.** Do not claim the current production trigger is safe.

### Security finding S3: Student Profile privileged fields — P1

**Confirmed live SQL defect:** `public.protect_student_profile_update()` denies changes to a limited subset of fields for Student actors, while owned-profile RLS permits UPDATE. Identity/provenance fields such as `record_kind`, `institutional_verified_at`, `project_cohort_id`, `created_at` and `id` are not included in that older denial list. The separate PROJECT_ONLY immutable-profile guard reduces exposure for the 600 test profiles, but normal Student-owned profiles still need a positive allowlist.

**Prepared, not deployed:** `docs/database-normalization/security-drafts/REVIEW_ONLY_20261022_student_profile_column_allowlist.sql`. It permits only contact number, address and emergency contact fields plus the managed update timestamp, denying changes to all other and future columns for Student actors. Registrar corrections remain governed by their original authority. Negative transaction tests and deployment rollback/compatibility checks are required first.

### Other security and advisor notices

* Supabase reported **31 authenticated-callable SECURITY DEFINER function warnings** and **19 RLS-enabled/no-policy notices**, including intentional server-only grade, transfer and project-cohort tables. These are review candidates, not 31 proven exploits.
* Database RLS/GRANT review must include actual signed identity and account revocation behavior; private client role is not itself a per-row authorization.
* Current no-email Management Auth hook and notifications check previously passed; no Auth changes were made during this audit.

## 5. Normalization, relationships and data cleanup

**1NF/2NF/3NF structural checks:** Junctions use explicit PK/FK relations instead of freeform multivalue lists; 68/68 public tables have PKs, 129 validated FKs, and core program/subject/curriculum/term facts are separated. Current checked samples show zero duplicate emails, student numbers, login identifiers or PROJECT_ONLY linkage errors, and zero tested offering/section/program/enrollment mismatch or invalid meeting time. An existing historical snapshot field is not automatically a 3NF violation; retain it until its time validity and source ownership are documented.

**Unresolved record decisions:**

* Existing Academic source import ledger **6,668 rows**, including **467 BLOCKED**, and **34** unresolved issues.
* Five active BSIT-2024 prerequisite edges refer to `IT201`, `IT202`, or `IT203`, absent from that curriculum membership. The subjects exist globally. Correction needs Academic Coordinator/source approval.
* **608** student profile year levels are NULL: 600 PROJECT_ONLY intentionally unverified plus eight legacy nonsynthetic; all 573 existing curriculum subject year labels and 2,129 nonnull student year labels map consistently to years 1–4. The `year_level_number` nullable shadow columns do not exist.
* **821** student profiles lack assigned current curriculum: 600 test students, 213 protected older synthetic planning students and eight legacy nonsynthetic. Two existing enrollments also have unresolved curriculum fields.
* Five historical login-enabled application users are not linked to Auth: do not provision/guess identities. `colleges` subtype table exists but has **zero rows**, pending approved CCSIT/CCS and organizational unit mapping.

No historical data was modified in response to these questions; the approved blueprint expressly forbids guessing unverified source outcomes.

## 6. Phase 8 academic and schedule integrity

* 21 curricula (one Active, 15 Draft, five status NULL); 411 subjects, 573 curriculum placements, 418 active prerequisites and eight existing academic results.
* All **122** block sections remain DRAFT, all **1,915** existing historical block assignments are PROPOSED. None of those assignments is part of the new 600 project cohort.
* Only **45/122** blocks have recorded five-day meeting coverage; **77/122** have fewer. No draft block has seven linked class sections. Among 575 synthetic planned sections, **289** have no active scheduled meeting or instructor assignment.
* Six overlapping room/period meeting pairs exist among nonsynthetic legacy DRAFT sections; zero sampled within-block or instructor overlaps among existing recorded meetings. Missing meetings mean collision-free publication is not proven.
* New grade import batches/rows, result revision and transfer evaluation tables exist but are empty and deny ordinary table access by design. This is safe staging, not completed verified Registrar grade publication.
* No PROJECT_ONLY account has official admission handoff, enrollment, grades or student-subject eligibility records. Existing academic outcomes have not been rewritten or fabricated.

**Safe next actions:** Academic Coordinator reviews 2024 prerequisite/source collisions and six draft room clashes, and publishes no incomplete block. Registrar controlled grade/source publication must be implemented and exercised against verified data separately; no invented grades, transfer credits, fee values or legal admission decisions.

## 7. Phase 9 performance and release optimization

* All 129 public FK constraints are validated; 162 indexes exist. Targeted critical index catalog confirms 47/47 valid and ready.
* Performance advisor reports **68 unindexed FK candidates**, **22 RLS initialization-plan warnings**, **22 unused indexes**. No blanket CREATE/DROP INDEX or policy rewrites have been applied.
* Two bounded cached SELECT query plans were observed: first 50 proposed assignments joined to blocks ~**0.273 ms**, first 50 meetings for a draft block ~**0.419 ms**. These do **not** prove real signed-role, 600 concurrent student or semester-close performance.
* Index improvement candidates need real workload frequencies and `EXPLAIN` plans; already-empty staging indexes must not be removed merely because they have zero scans.

## 8. Verification performed and release gates

**Executed without production data mutation:** live schema and role/RLS metadata, 600 identity/approval checks, duplicate/FK/source integrity queries, Supabase advisors, bounded SELECT performance plans, local Node regression suites, focused lint and Next.js build.

**Final regression baseline:** 66 application/test cases plus 56 offline provisioning/security cases passed after the route fix and local SQL draft tests, total **122 passed, zero failed**. Targeted ESLint, `git diff --check` and the Next.js production `npm run build` passed. Any later test additions must be rerun before release.

**Remaining blockers before declaring full Phase 0–9 completion:**

1. Release S2 enrollment transition actor bypass and S3 Student Profile allowlist **only after** role-aware negative/positive testing, compatible migration preflight and rollback evidence. Source drafts are not deployed fixes.
2. Deploy and verify S1 trusted Student session state source fix through the approved Next.js release process; no GUI redesign.
3. Obtain real signed-in four-role access regression including student self versus other student's records, disabled users, denied elevated RPCs, Registrar-only `CONFIRMED`, Coordinator-only curriculum change and technical admin denied official academic actions. No passwords must be printed into chat.
4. Reconcile 34 import issues, five prerequisites, eight old student records and two enrollment curriculum gaps with academic source owners; preserve all 467 BLOCKED ledger rows until reviewed.
5. Complete draft schedule meetings/classes and resolve six room conflicts **before** official publication; implement and test legitimate grade-import/transfer operations.
6. Plan and validate optional nullable numeric year-level shadows, college mappings and narrowly measured indexes; confirm original record preservation, old/new reader parity and backup/rollback behavior. User previously deferred restore testing, so no destructive or unrehearsed migration was attempted.
7. Keep first-login password rotation enforced for all PROJECT_ONLY users. Only pilot has rotated; 599 manual changes are deferred until their actual sign-ins by explicit user instruction. No phase 10/11 interface work is authorized.

## 9. Files delivered in the existing shared project

* `docs/database-normalization/PHASE0_9_PROGRESS_RECONCILIATION_2026-10-22.md`
* `docs/database-normalization/NORMALIZATION_DATA_AUDIT_2026-10-22.md`
* `docs/database-normalization/NORMALIZATION_READ_ONLY_PREFLIGHT_2026-10-22.sql`
* `docs/database-normalization/PHASE8_9_ACADEMIC_PERFORMANCE_AUDIT_2026-10-22.md`
* `docs/database-normalization/FOUR_ROLE_SECURITY_AUDIT_READ_ONLY_2026-10-22.sql`
* `docs/database-normalization/FOUR_ROLE_SECURITY_AUDIT_REPORT_2026-10-22.md`
* `src/lib/auth/project-only-first-login-server.js` (narrow secure session change)
* `src/lib/auth/legacy-student-account-policy.mjs`
* `tests/legacy-student-account-access.test.mjs`
* `docs/database-normalization/security-drafts/REVIEW_ONLY_20261022_enrollment_status_actor_guard.sql`
* `docs/database-normalization/security-drafts/REVIEW_ONLY_20261022_student_profile_column_allowlist.sql`
* `tests/enrollment-transition-actor-guard-draft.test.mjs`
* `tests/student-profile-write-guard-draft.test.mjs`

**Repository note:** The existing working tree contains substantial prior untracked normalization scripts and migrations; no broad Git reset/clean, full commit or push was attempted. Source files changed in this run require normal review, staging and deployment before the hosted application will use them.

**Final decision:** PostgreSQL and 600-user *structural foundation* PASS. Four-role/security hardening and Phase 8 source/schedule/business operation completion **PARTIAL / NOT RELEASE COMPLETE**. Prioritize the confirmed live enrollment transition bypass before further enrollment business writes.
