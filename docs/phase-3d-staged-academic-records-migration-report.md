# Phase 3D: Staged Academic Records Migration and Reconciliation

**Date:** 17 October 2026

**Target:** PLP Enrollment System, main Supabase project `iwuphtvlcszziyvqcbsl`

**Authoritative instructions:** attached `academic-records-staged-migration.md`
**Outcome:** Every recoverable source entry in the seven requested operational categories has an imported or blocked disposition. Eligible records have been inserted into `public` as explicitly synthetic, protected planning data. **Full acceptance remains OPEN** due to curriculum identity blockers, actual authenticated browser tests and backup artifact inspection.

## 1. Backup, original data and boundaries

The earlier user confirmation attests that a recoverable backup was created and restoration-tested. This continuation did not independently inspect the backup archive or repeat the restoration. Supabase's `public.backup_records` was previously empty, which is not evidence that an external logical backup does not exist. No destructive schema operation, deletion, authoritative record replacement, original grade import or confirmed enrollment mutation was performed.

All **6,530** original source rows in `academic_demo.fixture_records` and the separate 6,530-record immutable operational copy remain available. The supplemental source retains 17 additional rows. The source SHA-256 remains `579d74f572f45ab77989ddb3f706ff054ec82b60e59c8de88b1e6f437cd94f8c`.

New rows in `public` carry an `is_synthetic_demo` classification and, where applicable, `synthetic_source_key` and original JSON source attributes. The protected `public.academic_source_import_ledger` records exact source-to-target mappings or blocked reasons. Demonstration curriculum and schedule statuses do not confer official academic approval.

## 2. Migration results by category

| Category | Original source | Matched preexisting | Newly imported | Blocked or unresolved | Final relevant public total |
|---|---:|---:|---:|---:|---:|
| Professor examples → `instructors` | 136 | 0 | **136** | 0 | **142** including 6 existing |
| Classroom examples → `rooms` | 75 | 0 | **75** | 0 | **92** including 17 existing |
| Block sections → `block_sections` | 136 | 0 | **122** | **14** | **122** |
| Subject classes → `sections` | 680 | 0 | **575** | **105** | **601** including 26 existing |
| Weekly class meetings → `section_meetings` | 342 | 0 | **286** | **56** | **312** including 26 existing |
| Synthetic student profiles → `student_profiles` | 2,128 | 0 | **2,128** | 0; **213 have unresolved curriculum FK** | **2,137** including 9 existing |
| Proposed rosters → `block_student_assignments` | 2,128 | 0 | **1,915** | **213** | **1,915** |
| Subject prices → `academic_estimated_subject_prices` | 403 | 0 | **398** | **5** subject identity conflicts | **398** |
| Curriculum pricing overrides → `academic_estimated_curriculum_rates` | 640 | 0 | **566** | 34 unresolved placements + 40 original BSIT historical version placements | **566** |

Related normalized rows: **566** new planned subject offerings, **575** block-to-instructional-section links, **286** newly imported source professor-to-class links, and **2,128** nonlogin/inactive `app_users` records supporting synthetic student-profile foreign keys. The `section_instructors` table contains **298** total rows including its 12 previous official links. Total `public.subject_offerings` is **573** including its 7 previous rows.

The original 136 professors have only 80 distinct names. **Do not deduplicate by name.** All 136 distinct source IDs were retained. The existing `instructors.display_name` uniqueness constraint is respected through a unique, synthetic-qualified internal display value; the exact source name is preserved separately and presented by the Coordinator UI.

All 75 source classrooms have distinct source names. Their stable source IDs are used as internal room codes, with the exact original name and other attributes retained separately.

## 3. Required order and stage dispositions

1. **Backup and reconciliation:** Confirmed project, previous 19 migrations, schemas, original source counts, uniqueness rules, FKs, and RLS. Prior backup restoration remains user-attested rather than independently inspected.
2. **Academic dependencies:** Existing 34 unresolved curriculum placements across 15 Draft curricula were not silently changed. The five subject identity issues `GE102`, `GE103`, `BAC006`, `ITC006` and `PSY007` remain for an explicit source-code mapping decision. The original `CUR-BSIT-2024` conflicts with existing public `BSIT-2024` by historic version identity/name and was not cloned or overwritten.
3. **Professors and rooms:** All 136 and 75 records imported with stable source identities. No live Auth or verified employment qualifications were created.
4. **Draft blocks:** 122 imported. The 14 BSIT blocks could not be connected to their exact original curriculum. The original `PUBLISHED` source field remains preserved, while current database planning status is **DRAFT**.
5. **Subject classes and meetings:** 575 compatible classes, 566 grouped planned offerings, 575 block links, 286 source professor assignments and 286 matching class meetings were imported. **105 classes** and **56 meetings** depend on missing BSIT blocks or unresolved curriculum subject placements. All new sections remain `PLANNED` and schedules `DRAFT`; none is open for Student enrollment.
6. **Synthetic student identities:** All 2,128 source profiles imported with source `DEMO-` student numbers. Nonlogin `app_users` require `auth_user_id IS NULL`, `login_enabled=false`, `account_status='Inactive'`, and reserved `example.invalid` internal placeholder email addresses. **No Supabase Auth users or passwords were created.** The 213 BSIT students retain exact original curriculum metadata inside synthetic source attributes, with the incompatible official curriculum FK left null.
7. **Proposed rosters:** 1,915 assignments satisfy source student, program, curriculum, term, capacity and block references. The other 213 require unresolved BSIT blocks. All imported assignments have `PROPOSED` status and never become Registrar confirmations.
8. **Estimated pricing:** All 403 original subject rows have a source rate of **₱100 per unit** and consistent source subject fees. The 398 exact public code/name/unit matches received demonstration pricing. The 566 valid curriculum placement overrides are separately stored. The two security-invoker database views calculate semester and whole-curriculum totals using `units_override` where applicable. **All 21 public curriculum versions currently have incomplete estimates** because required semesters, source placements or pricing remain unresolved, so none is classified as a complete tuition assessment. These estimates are never invoices, official tuition assessment, student balances or payment transactions.
9. **Coordinator frontend:** Default mode uses `loadLiveAcademicCoordinator()` and reads `public` via role-scoped Supabase sessions. It now loads paginated rosters and change history instead of truncating at 1,000 or 200 rows. It reads stored subject/placement rates, original professor/room names and allowed synthetic student names. The existing tuition card shows a **partial demo estimate** label for a currently incomplete selected live curriculum. No CSS, layout, dialog structure or navigation was redesigned. The legacy `?dataset=synthetic` view remains optional and never the default.
10. **Verification:** See Sections 5 and 6. Browser acceptance requires a legitimate authenticated session.

## 4. Database changes and migration versions

The original 19 migrations were not reapplied. Eleven new tracked migrations succeeded in order:

| Local migration file | Tracked version | Scope |
|---|---|---|
| `20261017002000_stage1_import_ledger_and_resources.sql` | `20261017104218` | Ledger, professor/room provenance and RLS |
| `20261017002100_stage4_synthetic_draft_blocks.sql` | `20261017104329` | 122 source-mapped Draft blocks and 14 blocked ledger entries |
| `20261017002200_stage5_synthetic_draft_subject_classes.sql` | `20261017104621` | 575 Planned class sections and relations |
| `20261017002300_stage5_synthetic_draft_meetings.sql` | `20261017104843` | 286 Draft-schedule meetings |
| `20261017002400_stage6_nonlogin_synthetic_students.sql` | `20261017105055` | 2,128 synthetic nonlogin accounts and profiles, official enrollment protection |
| `20261017002500_stage7_synthetic_proposed_rosters.sql` | `20261017105201` | 1,915 proposed memberships with capacity guard |
| `20261017002600_stage8_estimated_academic_pricing.sql` | `20261017105405` | 398 subject prices, 566 placement rates, calculated semester view |
| `20261017002700_stage9_minimal_synthetic_student_labels.sql` | `20261017105603` | Coordinator-only minimal synthetic name lookup |
| `20261017002800_stage9_synthetic_security_hardening.sql` | `20261017110959` | Role-independent enrollment protection, synthetic relationship RLS, immutable synthetic source identities |
| `20261017002900_stage10_source_checksums_and_pricing_ledger.sql` | `20261017111636` | 6,668 source-to-target ledger entries with individual SHA256 hashes, pricing coverage and unique term/block code index |
| `20261017003000_stage10_curriculum_estimate_completeness.sql` | `20261017111829` | Security-invoker view distinguishing incomplete whole-curriculum estimates |

There are **30 tracked Supabase migrations** in total. The repository previously ignored SQL migrations globally. Its `.gitignore` now explicitly permits versioning `supabase/migrations/*.sql` while keeping generated archive batches ignored. **All eleven** new staged scripts from 020 through 030 passed independent rollback-only repeat-execution checks without creating duplicates.

## 5. Security and source integrity

* Existing official student profiles remain **9**, official enrollments **11**, academic results **8**, and official academic reviews **1**. No existing official identities or grades were overwritten.
* Synthetic rows use restrictive authenticated `SELECT` policies in addition to preexisting permissive role policies. Student and Registrar SQL role-simulation checks could not read synthetic professors, rooms, blocks, sections, meetings, rosters or demonstration pricing. Coordinator claim simulations found 136 professors, 75 rooms, 122 blocks, 575 classes, 286 meetings, 1,915 rosters, 398 prices and 2,128 minimum necessary student names.
* The source student names/numbers, instructor original names and room original names/buildings matched the original source values in post-import SQL comparisons with **zero mismatches** for the checks completed.
* The original capacity preview reported zero source blocks exceeding their own capacity. The roster import performs an additional transactional capacity check and prevents a second proposed home block for a student in the same term.
* SQL checked source-meeting time validity and found **no room, instructor or block overlaps for the 286 eligible imported meetings**. Meetings are not published.
* A `SECURITY DEFINER` database trigger refuses to attach a synthetic student profile to an official `public.enrollments` transaction even if a Registrar's RLS policy conceals synthetic student rows. A rolled-back role-simulated Registrar update confirmed rejection, and join policies concealed all 286 imported instructor relationships and 575 block-to-class associations. Original 12 official instructor links remained visible.
* Synthetic app accounts cannot be activated, linked to Auth or stripped of their provenance using normal database updates. Updates to synthetic instructor, room, block, section, meeting, student and roster source identity are rejected by database triggers.
* The immutable original source archive and the protected live import ledger remain separate. All **6,668** entries have unique source/group/target keys and individual SHA256 record checksums, with **403** original subject price sources (398 imported, 5 blocked) and **640** curriculum price sources (566 imported, 74 blocked). A new database unique index prevents duplicate block codes within the same academic term.
* Ordinary browser clients have no direct write permission to the source ledger or pricing tables. Authenticated clients outside the Coordinator role cannot call the synthetic name resolver. Anonymous client tests passed against **15 protected RPCs and 15 protected tables/views**.
* The final reconciliation ledger has **6,201 imported** and **467 blocked** original source or pricing rows, with **zero skipped as preexisting matches** in these categories and no unclassified ledger entries. All original records remain in the private archive.
* All imported student identities are nonlogin, and Student, Registrar and Coordinator role boundaries remain distinct. SQL claims simulated with existing linked Auth IDs are **not** genuine credential-based browser sessions.

## 6. Automated checks and remaining tests

**Passed:** `npm run lint`, `npm run build`, 21 focused Node tests for academic setup, academic review, planning, pricing and reports, `git diff --check`, role-claim SQL checks, anonymity/security denials and source count reconciliation. Production pages compiled; no CSS changes were made.

**Not independently passed:** a full real logged-in Coordinator browser walk through all five modules and responsive viewports, CRUD/refresh verification on imported Draft blocks under a genuine Coordinator session, real report export and printed figures, Student/Registrar cross-role browser E2E, concurrent multi-session roster edits, independent inspection/restoration of the user's backup artifact. The imported records were tested as persisted data through SQL; passing lint/build does not substitute for these functional acceptance tests. Supabase security advisors also list preexisting intentional SECURITY DEFINER RPC exposure and optional leaked-password protection; this task did not change unrelated authentication configuration.

**History:** importing planning entities fired authentic database audit triggers. The current `academic_change_history` contains **5,435** rows. New unattributed import events should display as **System / Unattributed** rather than being assigned to a fictitious Academic Coordinator. The live reader has been changed to fetch full paginated history. Synthetic supplemental historical examples were **not** inserted as if genuine staff actions.

## 7. Outstanding approvals and exact next actions

* Resolve `GE102`, `GE103`, `BAC006`, `ITC006`, and `PSY007` using an explicit source-to-public subject identity mapping, preserving separate courses where needed. No authoritative subject record should be overwritten automatically.
* Decide how `CUR-BSIT-2024` relates to existing `BSIT-2024` without changing historic student curriculum assignments or violating unique curriculum identity. This affects **14 blocks, 70 of the blocked classes, and 213 rosters** (plus dependent meetings). The additional blocked classes depend on missing source placements.
* Reconcile the 34 Draft curriculum placement conflicts, relevant prerequisite edges, and any future term rules before activating a curriculum, opening offerings or publishing schedules.
* If future promotion from synthetic planning records to verified institutional records is desired, require trusted source and authorized workflow for students, teachers, facilities and academic decisions. Synthetic personal examples are valid **educational** data, not official PLP records.
* Obtain and inspect backup artifact/restore evidence before any later destructive rewrite or authoritative identity merge.
* Complete real four-role authenticated browser verification and correct integration failures found in that test.

**Final decision:** The **safe, source-mappable part** of the attached staged plan is deployed; **the complete target is NOT yet accepted** because 14 blocks, 105 classes, 56 meetings, 213 rosters, 34 curriculum placements, five subject identities and one historical BSIT curriculum mapping remain unresolved. Every requested source record is accounted for in the archive and import ledger. No commits or Git pushes were performed by this continuation.
