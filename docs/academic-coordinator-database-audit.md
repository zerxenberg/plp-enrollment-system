# PLP Enrollment System: Phase 2 Academic Coordinator Database Audit

**Audit date:** 16 October 2026  
**Project:** PLP Enrollment System  
**Database:** Supabase hosted PostgreSQL, `public` schema, project `iwuphtvlcszziyvqcbsl`  
**Repository branch:** `main`  
**Scope:** Read-only database inspection and local source-code review; **no DDL, DML, policy changes, frontend changes, or migrations executed**.

## 1. Executive assessment

**Result: Phase 2 inspection completed; schema is NOT yet approved for production integration.** The live database already contains most academic master, offering, scheduling, review, and reporting support tables. Its design differs materially from the streamlined Academic Coordinator GUI, especially in **block sections versus per-subject sections**, **curriculum lifecycle**, **scoped academic reviews**, and **auditable academic changes**. The academic portal still uses illustrative local mock data rather than these tables.

The current database connection is working. The anonymous role's inability to read `academic_terms` is an intentional table-level permission boundary, not a connection failure. Real user authentication and database authorization remain Phase 3 work.

### Verified observations

* **46 public tables** were returned by Supabase; all reported `rls_enabled: true`.
* The relevant tables have primary keys and numerous foreign keys. Some business constraints and relationships are still missing or insufficient for the **current GUI model**.
* Supabase reports **zero applied migrations** through its migration listing; establish a baseline and tracked migrations before making changes.
* `AcademicSetupWorkspace.js`, `AcademicCoordinatorSectionsSchedules.js`, `AcademicCoordinatorAcademicReview.js`, and `AcademicCoordinatorReports.js` all use `useDemoData()`; academic setup and block planning are persisted in browser `localStorage`, not PostgreSQL.
* A database inventory returned **0 rows in `academic_change_history`**. Inspected academic master tables have `updated_at` triggers but no automatic academic-change-history trigger.
* RLS includes authenticated read policies and Coordinator-scoped insert/update policies on many academic tables. This is a useful foundation, **not proof of production-ready authorization**.

## 2. Basis, ownership, and scope

**Source of workflow truth:** `Simplified Academic Coordinator - User Role GUI Workflow Functionalities.docx`, edition 2.0, 15 October 2026, especially pp. 2 and 5–17. Supporting references: `Basic Database Entities and ERD Lite.docx`, `Canonical Status and Workflow Dictionary.docx`, `Academic Rules and Validation Matrix.docx`, `Main Workflows.docx`, and `Development Naming Conventions.docx`.

**Final navigation:** Dashboard; Academic Setup (`Programs`, `Subjects`, `Curriculum`); Sections & Schedules (`Sections`, `Class Schedule`); Academic Review (`Pending Reviews`, `Resolved Reviews`); Reports & Monitoring (`Academic Reports`, `Academic Change History`). Do **not** reintroduce separate prerequisites, offerings, capacity, or other tabs merely to mirror database tables. The Academic Coordinator manages academic rules, plans, and exceptions; the Registrar retains official student records, grades import where authorized, and enrollment confirmation.

**Evidence terms:** **Verified** means directly inspected in live catalog metadata, read-only queries, or checked-in code. **Mismatch** compares two verified structures but does not necessarily imply a defective production process. **Proposed** is an unimplemented design recommendation requiring approval. **Policy to confirm** requires university or project-owner decision.

## 3. Database inventory and relationships

Supabase's reported row numbers below are **inventory counts**, not authenticated, RLS-scoped application results, and must not be used as official university figures.

| Area | Existing tables (selected) | Reported rows | Verified keys and relationships |
| --- | --- | --- | --- |
| Program catalog | `programs`; `organizational_units` | 4; 8 | `programs.code` PK; `organizational_unit_code` FK to units |
| Curriculum | `curricula`; `curriculum_subjects` | 6; 7 | `curricula.code` PK; FK to program; composite `(curriculum_code, subject_code)` PK for assignments |
| Subjects and rules | `subjects`; `subject_prerequisites` | 20; 6 | Subject code PK; prerequisite triple `(curriculum_code, subject_code, prerequisite_subject_code)` PK; FK to curricula and subjects |
| Terms and offerings | `academic_terms`; `subject_offerings` | 4; 7 | Term ID PK; offering FKs to term, program, curriculum, subject; unique `(term_id, program_code, curriculum_code, subject_code)` |
| Subject sections | `sections`; `section_meetings` | 26; 26 | Section UUID PK, term/subject FKs; meeting UUID PK, section/room FKs |
| Scheduling context | `rooms`; `instructors`; `section_instructors`; `section_capacity_snapshots` | 17; 6; 12; 23 | Room and instructor identity; section/instructor many-to-many; section capacity snapshots linked to section |
| Enrollment context | `enrollments`; `enrollment_subjects`; `student_profiles` | 11; 15; 9 | Enrollment references student, term, program and curriculum; selected subject/section records via enrollment subjects |
| Academic decisions | `academic_reviews` | 1 | Review UUID PK; `enrollment_id` FK; optional Coordinator account FK |
| Reports/audit | `academic_change_history`; `audit_events`; `program_statistics_snapshots` | 0; 3; 4 | History UUID PK; Coordinator FK; separate technical/business events and source-labeled count snapshots |

**Notable actual identifiers:** `programs.code`, `subjects.code`, `curricula.code`, and `academic_terms.id` are text identifiers. Do not replace them with UUIDs just because the conceptual ERD suggested UUID-style keys; the existing foreign-key graph and stored records would require careful migration. Section and review primary keys are UUIDs.

### 3.1 Reconstructed relationship paths

```text
organizational_units <- programs <- curricula <- curriculum_subjects -> subjects
                          |            |                                  ^
                          |            +<- subject_prerequisites ----------+
                          |
academic_terms -> subject_offerings -> (program, curriculum, subject FKs)
academic_terms -> sections -> section_meetings -> rooms
                        |    \-> section_instructors -> instructors
                        +----> section_capacity_snapshots

student_profiles -> enrollments -> enrollment_subjects -> sections
                         \-> academic_reviews -> app_users (Coordinator)
app_users -> academic_change_history
```

This is a **logical summary**, not proof of additional database foreign keys. In particular, there is currently **no `sections.subject_offering_id` FK** and no direct `sections -> curricula` association.

## 4. UI to database comparison

| GUI module / workflow | Current code and data | Existing database mapping | Finding and proposed direction |
| --- | --- | --- | --- |
| Dashboard | Academic summary from `useDemoData()` | Aggregates over programs, curricula, sections, reviews, terms | **Mismatch.** Define read-only aggregated queries; distinguish illustrative from official counts. No new dashboard table required. |
| Programs | Code, name, department, optional majors, status, curriculum count; demo create/edit | `programs`, `organizational_units`, `curricula` | **Partial match.** No persistent major/track model in inspected schema. Department FK is nullable; validate approved mappings and program status. |
| Subjects | Subject code/name/units/status plus multi-program applicability, suggested year/term, prerequisites, estimated fee | `subjects`, `curriculum_subjects`, `subject_prerequisites`, `subject_offerings` | **Partial match.** Year and semester are correctly modeled at *curriculum assignment* level. Do not duplicate them into master `subjects` to imitate demo fields. Estimated ₱100/unit is demo only, not an approved tuition rule. |
| Curriculum | Version, program/major, effective academic year, lifecycle, subject assignments by year/semester | `curricula`, `curriculum_subjects`, `subject_prerequisites` | **Material mismatch.** `curricula.status` nullable; no DB lifecycle check; no major/track identifier. Preserve assigned historic versions and enforce controlled lifecycle at backend. |
| Sections | One block has college/program/track, curriculum, year, academic term, capacity, roster proposals and confirmed counts | `sections`, `subject_offerings`, `section_capacity_snapshots`, `enrollments`, `enrollment_subjects` | **Major modeling mismatch.** Live `sections` is **per subject** (`subject_code`), while GUI block section groups multiple subject classes and students. Must choose a compatible bridging model before creating tables. |
| Class Schedule | Block subject classes, professor qualifications, rooms, multiple meetings, conflict check, finalization | `sections`, `section_meetings`, `section_instructors`, `instructors`, `rooms` | **Partial match.** DB meeting references a single subject-specific section, not a GUI `subjectClassId`; no database scheduling-conflict exclusion/trigger; room capacity and professor qualifications are not in inspected `rooms`/`instructors`. |
| Pending/Resolved Reviews | Enrollment-derived queue, scoped subject/rule, reason, Coordinator decision, confirmation | `academic_reviews`, `enrollments`, `enrollment_subjects`, `student_profiles`, `academic_results` | **Partial match.** Decision state exists, but no explicit subject/rule scope or separate decision evidence fields in `academic_reviews`. Define only minimal required supporting fields/relations. |
| Academic Reports | Five dynamically computed report types; automatic preview, filters, export and print | Joins/aggregates over catalog, offerings, sections, meetings, enrollment, reviews, snapshots | **Not integrated.** Build authorized read-only report queries or views; do not add five separate report storage tables by default. |
| Academic Change History | Combined `academicCoordinatorData.history` and `blockPlanning.history`, stored in browser | `academic_change_history` with separate `audit_events` | **Not integrated.** History table exists but no inspected automatic writers; define server-side, transactional, immutable audit capture and approved reader access. |

### 4.1 Academic Setup high-priority details

* **Verified:** `curricula` columns are `code`, `program_code`, `name`, `effective_year_start`, `status`, timestamps. `curriculum_subjects` holds the subject placements; `subject_prerequisites` is version-scoped and has a `prevent_prerequisite_cycle` trigger plus a check that prevents direct self-reference.
* **Verified:** `subjects.units` may be null and enforces positivity only when populated. Confirm whether units must always be supplied for active, schedulable subjects.
* **Verified:** `programs.name` is unique and `status` constrained to `Active`/`Inactive`; `curricula.name` is unique but has **no status CHECK** in the inspected constraints. Version and program-level unique rules should be chosen after determining code semantics.
* **Mismatch:** Program fixture list in `src/features/academic/academic-reference.js` covers more reference programs than the four live `programs` records. **Do not assume** demo-generated subjects/curricula are approved university data, and do not bulk-import them without explicit review.
* **Proposed:** Keep shared `subjects` and curriculum-local placements. Decide if approved tracks/specializations need a small `program_tracks` reference table or a more limited controlled lookup. Keep academic term edit authority with Registrar.

### 4.2 Sections & Schedules high-priority details

* **Verified:** `src/features/block-planning/block-planning-service.js` creates `blockSections`, `subjectClasses`, `assignments` (proposed/confirmed), `classMeetings`, and browser-only history. The GUI's 7-column block table computes capacity from those arrays.
* **Verified:** Live `sections` has `term_id`, `subject_code`, `section_code`, `capacity`, and `status`, but no `program_code`, `curriculum_code`, `year_level`, or block parent FK. `section_meetings` is linked to a subject section and room. Instructors are assigned at the section level.
* **Verified:** `sections` enforces uniqueness of `(source_system, source_key)` but **not** `(term_id, section_code)`. Multiple subject sections can legitimately share a block label, so a blanket term/code UNIQUE restriction on this table would be dangerous.
* **Verified:** The meeting CHECK enforces `start_time < end_time` when both are provided, but day/time can be null and the uniqueness key includes nullable `room_id`. The existing constraints do not by themselves prevent room, instructor, or block time overlaps.
* **Proposed design decision, pending approval:** Preserve the existing per-subject sections and introduce a small **block planning layer** (e.g., `block_sections` with term/program/curriculum/year/track/capacity/status, plus a bridge to existing `sections` and a distinct proposal/roster table), **or** simplify block behavior to existing section records if it still satisfies the signed-off GUI. Compare both options for data migration, reporting, and enrollment confirmation integrity first.
* **Do not** write proposed block assignments into official confirmed `enrollment_subjects`. Derive Registrar-confirmed counts from authoritative confirmed enrollment records and reconcile snapshots by their source and capture time.

### 4.3 Academic Review and History high-priority details

* **Verified:** `academic_reviews` has `enrollment_id`, `coordinator_user_id`, `review_status`, `exception_type`, `academic_reason`, `decided_at`, `applied_at`. `review_status` CHECK includes `PENDING`, `RETURNED_FOR_CLARIFICATION`, `APPROVED`, `REJECTED`, and `APPLIED`.
* **Mismatch:** The GUI distinguishes subject-specific exceptions, failed rule, request evidence, and reviewer decision reason. These are currently largely inferred from frontend enrollment demo fields. The live review table does not directly identify `subject_code` or `failed_rule`; joins may supply program, term, and student, but not an unambiguous reviewed subject.
* **Proposed:** Scope each review to an enrollment and, when needed, one subject/rule. Store request reason/evidence separately from the decision explanation, and ensure resolved cases are immutable except for a defined `APPROVED -> APPLIED` transition. Confirm permitted cardinality of multiple reviews per enrollment before imposing any uniqueness constraint.
* **Verified:** `academic_change_history` has timestamps, Coordinator, module, record reference, action, and before/after text. No direct trigger is writing it from the inspected academic master tables. Use an append-only audit event written by a trusted server transaction, not editable form data.

## 5. Read-only integrity probes and interpretation

The following results came from read-only aggregate queries against live tables on 16 October 2026:

| Check | Count | Interpretation |
| --- | ---: | --- |
| Curricula with `status IS NULL` | **5** | Missing lifecycle state for most versions; requires data classification before enforcement. |
| Curricula without any `curriculum_subjects` assignment | **5** | Only one of six versions has subject assignments in this snapshot; incomplete until approved curricula are loaded. |
| Sections without a matching `subject_offerings` entry by term and subject | **10** | Potential offering/readiness inconsistency; investigate import provenance and offering context before remediation. |
| Repeated `(term_id, section_code)` groups | **4** | **Not automatically a duplicate error**: one block label may cover multiple subjects. Confirm grouping rules. |
| Section meetings missing day or start/end time | **0** | Existing sample meetings have these values, despite nullable schema. |
| Offering records with a program inconsistent with their linked curriculum | **0** | Good consistency in the checked program-curriculum dimension. |

**Limit:** These counts are a single snapshot and do not prove historical integrity or complete institutional coverage. Existing sample records may be seeded or incomplete. No data was repaired or deleted.

## 6. Security and authorization audit

* **Verified:** Every inspected academic table has RLS enabled; `anon` lacks table-level SELECT on the academic tables checked. `authenticated` has SELECT, INSERT, and UPDATE grants on the same tables, but **RLS policy conditions determine effective access**. A grant does not mean every signed-in user can write.
* **Verified:** Programs, subjects, curricula, sections, meetings, and offerings have authenticated read policies and Coordinator-only insert/update RLS policies using `has_role('academic-coordinator')`. The review table also checks enrollment status on insert; term reference only exposes authenticated read via RLS.
* **Verified:** `academic_change_history` allows Coordinator INSERT and read by Coordinator or Registrar; no coordinator UPDATE or DELETE policy was returned. Review append-only privileges independently before making claims about tamper resistance.
* **Not yet tested:** Real session-based role resolution, escalation resistance, JWT/Auth-to-`app_users` linkage, policy behavior for each of the four roles, and the difference between demo sign-in and Supabase Auth. Those require a dedicated Phase 3 test plan.
* **Supabase security advisors (16 Oct 2026):** Warned about two functions with mutable `search_path` (`set_updated_at`, `prevent_prerequisite_cycle`); seven `SECURITY DEFINER` functions callable by `anon` and seven callable by `authenticated` (overlapping function set); and disabled leaked-password protection. These are warnings requiring **function-by-function** review, not proof of an exploitable breach. Keep the default least-privilege posture. Refer to [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) and [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
* **Current application:** `src/data/mock/auth-accounts.json` and `src/lib/auth/demo-auth` are demonstrative authentication, not Supabase Auth. Real database permissions must never rely on a role value supplied by the browser or mock session.

## 7. Prioritized findings and proposals

| Priority | Type | Finding | Recommended treatment |
| --- | --- | --- | --- |
| **P0** | Architecture | Block-level planning model does not match live per-subject `sections` | Choose bridge/grouping architecture; preserve all existing sections and official enrollment links. |
| **P0** | Security | Mock login is not an authenticated Supabase session; RLS has not been tested end to end | Phase 3 role mapping, SSR/session handling, and four-role policy tests before CRUD. |
| **P0** | Data integrity | Five missing curriculum statuses and five unpopulated curricula | Classify records, define valid lifecycle and data backfill; validate before adding NOT NULL/CHECK. |
| **P1** | Data integrity | Ten subject sections lack a matching term/subject offering | Determine approved offering source and correct cross-record linkage without guessing program/curriculum. |
| **P1** | Data model | No persisted major/track dimension to support program and block filters | Confirm required PLP specializations and choose controlled lookup vs small reference entity. |
| **P1** | Academic review | Review table lacks explicit subject/rule/evidence scope | Extend minimally; preserve existing enrollment linkage and historical decisions. |
| **P1** | Audit | `academic_change_history` not populated by inspected write triggers | Design append-only transactional history capture and restricted viewer access. |
| **P1** | Scheduling | No database-level room/professor overlap control verified | Design authoritative server-side conflict checks, locking/concurrency strategy and negative tests. |
| **P1** | Migration hygiene | No recorded Supabase migrations | Capture a reviewed baseline, then incremental migrations with rollback/backfill plan. |
| **P1** | Security | Supabase function-exposure and Auth advisories | Review privileged functions and access; do not revoke blindly without checking RLS dependencies. |
| **P2** | Reporting | Frontend report metrics derive from independent demo arrays | Define a single authoritative filtered query per report and consistent export/print authorization. |
| **P2** | Data semantics | Several status vocabularies differ by table: `Active`, `DRAFT`, `PUBLISHED`, `Open`, `NEEDS_ACADEMIC_REVIEW` | Establish table-specific canonical mappings and allowed transitions; never merge unrelated status dimensions. |
| **P2** | Performance | Few purpose-built report/review/history indexes in inspected index list | Benchmark expected queries and add targeted indexes only after query plans and data volume justify them. |

## 8. Recommended target design, pending approval

1. **Reuse rather than recreate:** Keep `programs`, `organizational_units`, `subjects`, `curricula`, `curriculum_subjects`, `subject_prerequisites`, `academic_terms`, `subject_offerings`, `sections`, `section_meetings`, `section_instructors`, `academic_reviews`, and audit/report reference entities.
2. **Program tracks:** Add a normalized approved track/specialization reference only if required by verified PLP programs; link versions and blocks appropriately without duplicating program master records.
3. **Curriculum version protection:** Constrain lifecycle after classifying existing nulls; support Draft, Active, Inactive, Archived only if final canonical standards confirm these values; ensure changes to assigned versions use controlled version creation, not silent overwrite.
4. **Block grouping:** Decide between a block parent + per-subject section bridge versus a simpler grouping key within existing sections. A proposed roster must have separate state from confirmed enrollments, and meeting/room assignment must still identify its subject.
5. **Review scope:** Extend `academic_reviews` with only the proven missing academic request/scope fields; use existing enrollment/student relations to avoid redundant personal data.
6. **History:** Write approved Coordinator actions and decisions to `academic_change_history` within trusted transactions; use `audit_events` for wider technical/system evidence without conflating business authority.
7. **Reports:** Prefer backend SQL/views/aggregates over stored report copies, with term/program/section filters and one consistent source for UI, exports, and print.
8. **Compatibility:** Maintain Student subject eligibility, Registrar confirmation, and System Administrator technical authority. Apply official grades import as separate authorized workflow; do not let Academic Coordinator edit grades.

## 9. Implementation gates for later phases

### Before Phase 3

* Approve block-versus-subject-section architecture and any required track/specialization reference model.
* Reconcile the five empty curricula, five null statuses, and ten unmatched section-offering references; distinguish intentional demo/legacy data from authoritative records.
* Approve migration plan with explicit backfill, constraints, index strategy, and preservation of history.
* Create a separate development database/branch if practical (project currently marks the main branch **Production**; branching may cost money).

### Phase 3: Auth, authorization, and schema preparation

* Define identity linkage from `auth.users` to application accounts and approved fixed roles.
* Test actual signed-in Student, Registrar, Academic Coordinator, and System Administrator roles against SELECT/INSERT/UPDATE/DELETE and RPC security.
* Remediate Supabase advisor findings with an explicit function audit and protect append-only history.
* Apply **approved** version-controlled migrations only after a backup/snapshot and review; verify post-migration integrity.

### Phase 4: Application integration

* Replace mock-only academic data adapters with authorized Supabase-backed repositories/services gradually per module.
* Enforce prerequisite, curriculum, enrollment, capacity, overlap, and status rules on trusted backend/database boundaries, not just the browser.
* Validate error states, concurrent edits, negative security tests, RLS-aware reports, and data parity before switching off demo data.

## 10. Evidence and verification record

**Project sources inspected (read only):**

* `src/components/academic-coordinator/AcademicSetupWorkspace.js` (tabs, forms and curriculum lifecycle; especially lines 11–62, 221–240, 363–398, 491 onward)
* `src/components/academic-coordinator/AcademicCoordinatorSectionsSchedules.js` (block data and 7-column UI; lines 13–65, 230–350, 354 onward)
* `src/components/academic-coordinator/AcademicCoordinatorAcademicReview.js` (queue and decisions; lines 18–47, 93–160, 237–329)
* `src/components/academic-coordinator/AcademicCoordinatorReports.js` (five report types, auto preview, history and export; lines 16–79, 117–169, 180–310)
* `src/features/block-planning/block-planning-service.js` (block planning, assignments, history; lines 1–200)
* `src/features/academic/academic-reference.js` (reference programs versus illustrative academic fixtures; lines 1–31, 89 onward)
* `src/features/academic/academic-review-workflow.js` (canonical review status and demo transitions; entire file)
* `src/features/demo-data/DemoDataProvider.js` (fixtures and browser localStorage; lines 1–114 and 305–399)

**Database checks performed:** `list_tables(public, verbose)`, `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_trigger`, `has_table_privilege`, aggregate data-integrity SELECT queries, Supabase security advisors, and `list_migrations`. All SQL was **SELECT only**. No table row containing student information or credentials was exported.

**Working tree preserved:** Pre-existing changes to `.gitignore`, `package.json`, `package-lock.json`, `src/app/api/`, and `src/lib/supabase/` were not altered. This report is the only intended new local artifact. **No Git commit/push.**

### Exit status

**Phase 2 audit deliverable ready for review.** No schema-change authorization inferred from this audit; request approval for a specific migration blueprint before Phase 3 and Phase 4 implementation.
