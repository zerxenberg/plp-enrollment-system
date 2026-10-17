# Phase 3B | Original Academic Coordinator Mock Data Migration Verification

**Date:** 17 October 2026  
**Target:** Existing main Supabase project `iwuphtvlcszziyvqcbsl`  
**Result:** Source-preserving synthetic import **verified at SQL level**. Actual authenticated browser preview **still needs user-session verification**. Official academic data **not bulk populated**.

## A. Authority and safety

Original source is synthetic. Realistic names, grades, curriculum codes, staffing and demonstration schedules are not evidence of official university records. The supplied backup was previously user-attested as created, verified and restore-tested; the agent did not independently access that backup. Only additive migrations 015 and 016 were deployed in this phase. No official enrollments, students, official grades or curricula were deleted or overwritten.

Production academic writes remain in the existing official mode. The recovered dataset is explicitly available as a **read-only Supabase synthetic preview** for signed-in Academic Coordinators. Its source values are never merged automatically with official records. No GUI layout or CSS redesign was made.

## B. Exact original source counts and recovered operational rows

| Source group | Original | Operational demo import | Skipped from demo | Official destination / decision |
|---|---:|---:|---:|---|
| sourceCatalog.subjects | 7 | 7 | 0 | Archived prior subject reference; no direct official write |
| sourceCatalog.sections | 9 | 9 | 0 | Archived prior subject sections; no direct official write |
| sourceCatalog.programs | 4 | 4 | 0 | Archived prior program reference; no direct official write |
| academicCoordinatorCatalog.departments | 7 | 7 | 0 | Synthetic department catalog, not official organizational units |
| academicCoordinatorCatalog.programs | 11 | 11 | 0 | Synthetic programs, not official programs |
| academicCoordinatorCatalog.sections | 9 | 9 | 0 | Preserved historical Coordinator section examples |
| academicCoordinatorCatalog.subjects | 403 | 403 | 0 | Synthetic complete subject catalog, not official subjects |
| academicCoordinatorCurricula | 16 | 16 | 0 | Synthetic versions and their nested subject placements/prerequisite codes |
| blockPlanning.terms | 2 | 2 | 0 | Synthetic terms, not official enrollment periods |
| blockPlanning.colleges | 7 | 7 | 0 | Synthetic college references |
| blockPlanning.programs | 11 | 11 | 0 | Synthetic program references |
| blockPlanning.curricula | 16 | 16 | 0 | Synthetic versions, including nested curriculum placements |
| blockPlanning.subjects | 403 | 403 | 0 | Synthetic subject references |
| blockPlanning.blockSections | 136 | 136 | 0 | Synthetic blocks, not official planning or confirmed sections |
| blockPlanning.students | 2,128 | 2,128 | 0 | Fictional students, not official student identities |
| blockPlanning.assignments | 2,128 | 2,128 | 0 | Synthetic proposals, not Registrar-confirmed enrollments |
| blockPlanning.subjectClasses | 680 | 680 | 0 | Synthetic subject-class mappings, not operational official sections |
| blockPlanning.classMeetings | 342 | 342 | 0 | Synthetic meetings, not official schedules |
| blockPlanning.professors | 136 | 136 | 0 | Fictional professors, not official instructor profiles |
| blockPlanning.rooms | 75 | 75 | 0 | Synthetic rooms and demo equipment, not approved university room facilities |
| **Total original archived fixture records** | **6,530** | **6,530** | **0** | Preserved in `academic_demo.fixture_records` and `academic_demo.operational_records` |
| registrar.enrollments (supplemental original) | 8 | 8 | 0 | Synthetic enrollment/review examples, not official enrollment transactions |
| academicCoordinator.history (supplemental original) | 2 | 2 | 0 | Illustrative history, not authoritative `academic_change_history` audit events |
| academicCoordinator.offerings (supplemental original) | 7 | 7 | 0 | Original calculated demonstration offerings |
| **Supplemental total** | **17** | **17** | **0** | Stored in `academic_demo.supplemental_records` |
| **All recovered stored rows** | **6,547** | **6,547** | **0** | Includes intentionally repeated reference groups, not 6,547 unique domain objects |

The original `blockPlanning.history` default was empty: **0 source and 0 imported records**. The 2 Coordinator history samples above are a separate source within `DemoDataProvider.js`. Five Academic Reports are computed views of catalogs, planning and the 8 original enrollment sample records. They did not originally exist as standalone report rows and therefore no fake report table was inserted.

## C. Official database comparison, not a merge

| Domain | Original relevant mock | Existing official | Matching business IDs | Unmatched mock | Differing values among matches |
|---|---:|---:|---:|---:|---:|
| Programs | 11 | 4 | 4 | 7 | 4 |
| Subjects | 403 | 20 | 8 | 395 | 1 |
| Curriculum versions | 16 | 6 | 0 | 16 | 0, no matching ID |
| College / department references | 7 | 8 organizational units | 5 | 2 | 1 |
| Planned block sections | 136 | 0 official planning blocks | Not applicable | 136 | Not applicable |
| Proposed student assignments | 2,128 | 0 official block assignments | Not applicable | 2,128 | Not applicable |
| Synthetic student identities | 2,128 | 9 official student profiles | Intentionally not matched | Not safely mappable | Not applicable |
| Synthetic professors | 136 | 6 official instructor rows | Intentionally not matched | Not safely mappable | Not applicable |
| Synthetic classrooms | 75 | 17 official rooms | Intentionally not matched | Not safely mappable | Not applicable |
| Subject classes | 680 | 26 official instructional sections | Not equivalent IDs | Not safely mappable | Not applicable |
| Class meetings | 342 | 26 official section meetings | Not equivalent IDs | Not safely mappable | Not applicable |
| Academic Review samples | 1 pending case within 8 original sample enrollments | Existing official review case(s) are separate | Not linked to official case | 1 demonstration case | Not applicable |

**Important:** Numeric counts reflect distinct database domains and cannot be safely subtracted to infer missing official records. No direct authoritative merge was attempted because the samples are synthetic and several catalog attributes conflict.

## D. Relational integrity and identity

Migration `20261017001500_phase3b_synthetic_operational_read_model.sql` created:

* `academic_demo.operational_records`: append-only original full JSON, immutable keys/hashes, explicit synthetic classification, composite FK to the original archive.
* `academic_demo.operational_relationships`: 11,336 cross-record reference edges with composite FKs to both source and target operational records. Covers 14 relationship types including proposed roster to student and block, classes to block/subject/professor, meetings to class/room, student to program/curriculum, and block to term/program/curriculum.
* `public.coordinator_synthetic_fixture_page`: paginated role-checked read RPC. Synthetic table access is not granted directly to clients.

Migration `20261017001600_phase3b_synthetic_supplemental_sources.sql` created:

* `academic_demo.supplemental_records`: 8 original demo enrollment cases, 2 original academic history samples and 7 original offering examples.
* `public.coordinator_synthetic_supplemental`: role-checked read RPC restricted to the three groups.

Migration `20261017001700_phase3b_synthetic_curriculum_relations.sql` also normalized the original nested curriculum details into **640 subject placements** and **448 prerequisite edges**, with foreign keys to the original curriculum records, subject records and prerequisite placements **within the same curriculum version**. SQL verified that both totals equal their respective original source arrays. These synthetic curriculum relationships were not applied to official university curricula.

Supplemental seed script: `supabase/seed/phase3b-original-supplemental.sql`, reproducibly generated by `scripts/prepare-phase3b-supplemental-fixtures.mjs --write` from original source files. Its SHA-256 is `893fcb6f33e307f5fb9f996139e4c4824d5e91bbd29def04330fea5b77594adf`. The original Phase 3A archive hash remains `579d74f572f45ab77989ddb3f706ff054ec82b60e59c8de88b1e6f437cd94f8c`.

Read-only relationship audit `scripts/audit-phase3b-mock-import.mjs --write` checked every nonblank instance of 14 defined relationships and found **zero unresolved references**, accounting for source `id` versus `code` aliases. SQL verified `6530` operational rows, `6530` original archive rows, `11336` relationship edges and `17` supplemental rows. All `6530` operational payloads and SHA values matched their original archive row, with **zero mismatches**.

## E. Coordinator portal preview behavior

After signing in as a verified Academic Coordinator, open:

`/academic-coordinator/academic-setup?dataset=synthetic`

This explicitly enables the read-only Supabase synthetic preview for the current browser tab. The setting follows Coordinator module navigation through tab-scoped session storage. The existing GUI renders recovered programs, subjects, curricula, blocks, class sessions, the original 8 enrollment cases and 2 sample change-history records through the **database RPC read model**, not imported JS mock objects.

To return to working official Supabase academic records:

`/academic-coordinator/academic-setup?dataset=official`

The official dataset stays the default for any new browser session. The synthetic preview replaces all displayed Coordinator data as a single dataset: it is **not blended with official records**. All preview write actions are denied in the provider before they could invoke official mutations. No frontend CSS or table layout was changed.

The preview creates no new official programs, subjects, curricula, sections, academic reviews or students. Explicitly choosing the preview is required; automatically populating the production default with synthetic data would compromise academic provenance and could cause edits to affect the wrong records.

## F. Verification evidence and remaining acceptance

**Confirmed:**

* 17 tracked Supabase migrations including three new incremental, successful migrations.
* All 6,547 source and supplemental rows persisted under `academic_demo`, without replacing official records.
* 11,336 relational links and zero archive-to-operational payload/hash mismatches.
* Real Coordinator account exists in `app_users`, enabled and Auth-linked. Role-guarded read RPCs executed successfully under a transaction-local simulated Coordinator JWT claim during SQL tests. This is **not** the same as a real browser Auth session.
* Student-role simulated JWT rejected both synthetic RPCs. Anonymous REST denied both synthetic RPCs using error `42501`.
* ESLint, optimized Next.js production build and mock relationship audit passed.

**Not yet independently verified:** real browser Auth-backed preview on all five modules, exact displayed row count at each tab and pagination threshold, accessibility at all device widths, exports/print output, deep interactive editing of the preview (intentionally disabled), or official SQL transaction acceptance for all synthetic records. In particular, **the default official tables remain sparse**, and no synthetic student/grade/approval has been declared official.

**Acceptance decision:** The recovered, appropriately isolated original demo dataset is fully stored and verified as a synthetic Supabase read model; the larger user request to have those rows act as editable official Academic Coordinator records and to independently verify every live GUI interaction remains **OPEN** pending explicit data authority decisions and real browser acceptance. Preserve the existing production-safe separation.

**No Git commit or push was made.** Existing user modifications were preserved.
