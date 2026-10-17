# Phase 3A | Academic Coordinator Frontend Mock Inventory and PostgreSQL Mapping

**Scope:** Current code defaults inspected 17 October 2026 and subsequently compared with **Simplified Academic Coordinator GUI Workflow Edition 2.0 (15 October)**; **no database import executed**. Accompanies `phase-3a-schema-finalization-proposal.md`, [source verification report](phase-3a-source-document-verification.md), and complete record manifest `phase-3a-fixture-manifest.json`.

## 1. Source audit and exact pristine fixture inventory

The following counts were evaluated from the current JavaScript fixture constructors with Node. The all-record JSON manifest preserves original source identifiers, values, array order, fields, and nested associations. Counts are **code-default records before browser `localStorage` changes**, so they are not guaranteed to equal a particular user's saved demo state. The manifest omits mock login credentials and should be used only for source comparison and approved development seeding.

| Module / source | Variable or builder | Records | Treatment |
|---|---|---:|---|
| Academic Setup / `src/features/academic/academic-reference.js` | `DEPARTMENTS` | 7 | Verify institutional units, normalize into `organizational_units`; GUI uses two different `COE` display codes |
| Academic Setup / same | `PROGRAMS` | 11 | Reference names, requiring source crosswalk; database currently has 4 rows |
| Academic Setup / `src/data/mock/catalog.json` | `subjects` | 7 | Student demo records; existing offering does not guarantee PLP approval |
| Academic Setup / same | `sections` | 9 | Student portal subject-section demonstration, distinct from GUI block sections |
| Academic Setup / same | `programs` | 4 | Input into generated reference catalog, not an additional table |
| Academic Setup / `buildMockAcademicReferences` | computed `subjects` | 403 | Generated illustrative subject catalog, including original 7 and shared reused subjects |
| Academic Setup / same | computed `curricula` | 16 | Generated illustrative curricula, 40 assignments each |
| Academic Setup / same | nested `curricula[].assignments` | 640 | Normalize as `curriculum_subjects`, not another curriculum row |
| Academic Setup / same | nested `assignments[].prerequisites` | 448 edges | Normalize per version into `subject_prerequisites`; investigate duplicates/invalid edges before import |
| Academic Setup / `src/features/demo-data/DemoDataProvider.js:65-114` | `ACADEMIC_COORDINATOR_INITIAL_DATA.curricula` | 16 | One generated BSIT record is retitled `CUR-BSIT-2024`; manifest reflects revised ID and label |
| Academic Setup / same | `legacyCurricula` | 1 | Historical illustrative BSBA empty curriculum, requires review, **not** automatically unioned into current curricula |
| Academic Setup / same | `prerequisiteRules` | 0 | Empty placeholder state; real rules come from curriculum assignments |
| Academic Setup / same | `offerings` | 7 | From `catalogSource.subjects`, requires program/curriculum/term FK reconciliation |
| Academic Change History / same | `history` | 2 | Hardcoded illustrative events `ACH-001`, `ACH-002`; exclude from official history |
| Sections & Schedules / `src/features/block-planning/block-planning-seed.js` | `BLOCK_PLANNING_TERMS` | 2 | Demo term contexts; resolve against existing official terms |
| Sections & Schedules / `buildBlockPlanningSeed` | `blockSections` | 136 | 68 current published proposals and 68 future drafts; dev only |
| Sections & Schedules / same | `students` | 2,128 | **Synthetic invented persons and academic results**; require isolated demo identities or exclude; never import into real students |
| Sections & Schedules / same | `assignments` | 2,128 | Proposals, no official confirmed records |
| Sections & Schedules / same | `subjectClasses` | 680 | Bridge each GUI block to a schedulable subject section |
| Sections & Schedules / same | `classMeetings` | 342 | Current term meetings; future plans may be unscheduled |
| Sections & Schedules / same | `professors` | 136 | Invented faculty identities; do not import as official employees |
| Sections & Schedules / same | `rooms` | 75 | Invented facility names/capacities; require actual facility approval |
| Sections & Schedules / same | `history` | 0 | Runtime edits populate local history; no seed rows |
| Reports / `src/features/reporting/academic-reports.js` | `ACADEMIC_REPORT_TYPES` | 5 names | Derived queries; no separate report records |

**Important identity rule:** The source generator's record counts grow from algorithms, not independently entered PLP records. `programs` and `curricula` within block planning reference the same catalog arrays. They are **not additional 11 programs or 16 curricula**. In `DemoDataProvider.js:289-385` Academic Setup and block planning also load/edit snapshots under `plp-demo-academic-setup-v1` and `plp-demo-block-planning-v1` in browser storage. These mutable runtime snapshots cannot be included in a source-only inventory; export and separately review any changes before final migration.

## 2. Field-level frontend to database mapping matrix

Each group identifies its precise originating array and source path. Column maps are written as `frontendField -> proposed_table.column (PostgreSQL type; treatment/relationship)`. `D` derived, `S` stored, `T` transform, `R` review, `X` excluded from official storage. Unshown UI filter state is separately covered below. The full original field values for **every** pristine source record are preserved in the linked manifest. A field listed as derived does not warrant a new table column.

### 2.1 Programs and colleges

Source: `src/features/academic/academic-reference.js:2-27`, `DEPARTMENTS`, `PROGRAMS`; consumed by `src/components/academic-coordinator/AcademicSetupWorkspace.js`, filtered by department, program, major, status and search.

| Frontend field | Target / type / treatment | Notes |
|---|---|---|
| `departments[].id` | `organizational_units.code text` S/T | Stable code from verified unit; avoid duplicate COE display code |
| `departments[].code` | `organizational_units` reference display D | `COE` occurs for both Engineering and Education; not a unique key |
| `departments[].name` | `organizational_units.name text` S/R | Verify source unit name |
| `programs[].code` | `programs.code text PK` S/R | Source key; compare 11 fixture with 4 live |
| `programs[].id` | `programs.code text` T | `program-bsit` is synthetic UI identifier; retain source-key crosswalk |
| `programs[].name` | `programs.name text` S/R | Institutional validation required |
| `programs[].department`, `departmentId` | `programs.organizational_unit_code text FK` T/R | Map to unit ID, not duplicate department string |
| `programs[].majors[]` | `program_tracks(program_code,name)` S/R | One row per approved track |
| `programs[].status` | `programs.status text` T | UI Title Case converted only after policy approval |
| `programs[].reference` | seed provenance metadata X | Display annotation, no academic master attribute |
| `programs[].enrolled` | count from confirmed `enrollments` D | Never authoritative program record field |

Program CRUD requires code, name, department, active status, optional approved tracks; backend requires unique identity, FK validation, atomic create/edit/history. Curriculum counts derive by program and track. Filters, dialogs and pagination are UI state, not DB entities.

### 2.2 Shared subject catalog

Source: `buildMockAcademicReferences(...)`, `src/features/academic/academic-reference.js:89-213`; `catalog.subjects` in `DemoDataProvider.js`; consumed by Academic Setup Subjects and Curriculum selectors. Data includes generated fields not present in source JSON.

| Frontend field | Target / type / treatment | Notes |
|---|---|---|
| `code`, `name`, `units`, `description`, `status` | `subjects.code text PK`, `name text`, `units smallint`, `description text?`, `status text` S/T | Status canonical conversion; units positive |
| `id` | source-key -> `subjects.code` T | Synthetic `subject-it...` UI string |
| `programs[]`, `programIds[]`, `program` | `curriculum_subjects.curriculum_code` + `curricula.program_code` D/T | Actual applicability defined by approved curricular placement, not duplicated on subject master |
| `department`, `departmentId` | derive via program/organizational unit D/R | Shared GE may belong to many programs; do not force single department FK |
| `major` | `curricula.program_track_code` via assignments T/R | Relevant specialization context depends on assigned curriculum |
| `yearLevel`, `semester` | `curriculum_subjects.year_level text`, `semester text` T | Position belongs to curriculum, not subject master |
| `prerequisites[]` | `subject_prerequisites` version-scoped FK edges T | Validate cycle and placement order per version |
| `eligibility`, `restrictionReason`, `category` | `student_subject_eligibility` evaluated status/reason or computed view D | Contextual to student/term; do not store on subject master |
| `availableInStudentDemo` | fixture metadata X | Demo-only flag |
| `feePerUnit`, `fee`, `feeDisplay` | X | ₱100 demo rate and computed UI values are not an official tuition policy |
| `reference` | fixture provenance X | Keep only in import staging/crosswalk evidence |

Subjects CRUD requires catalog code/name/units/description/status, applicable curriculum context and version-scoped prerequisites. Search by code/name; filter department/program/major/year/semester/status. Master editing may affect many assigned curricula and must avoid modifying immutable published version requirements.

### 2.3 Curriculum versions, placements and prerequisite edges

Source: `buildMockAcademicReferences` output, `DemoDataProvider.js:65-79`, `AcademicSetupWorkspace.js`, `src/features/academic/curriculum-lifecycle.js`. GUI eight columns are Version, Program Information, Effective Academic Year, Year Level, Semester, Course Load, Status, Actions.

| Frontend field | Target / type / treatment | Notes |
|---|---|---|
| `id` | `curricula.code text PK` T/R | Preserve source `CUR-*` in development key map, do not overwrite existing live codes |
| `version` | `curricula.name text` and optionally `version_label text` S/R | Requires semantic approval |
| `program`, `programId` | `curricula.program_code text FK` S/T | Match program code, omit redundant UI ID |
| `major` | `curricula.program_track_code text? FK` T/R | Approved track only |
| `department`, `departmentId` | via `programs.organizational_unit_code` D | No redundant curriculum department |
| `effectiveAcademicYear` | `curricula.effective_year_start integer?` T/R | Parse `2026 to 2027` after validating institution format |
| `status` | `curricula.status text CK` T/R | DRAFT, ACTIVE, INACTIVE, ARCHIVED proposed, no blind backfill |
| `reference` | demo provenance X | Never official academic data |
| `assignments[].subjectCode` | `curriculum_subjects.subject_code text FK` S/T | Composite PK with curriculum key |
| `assignments[].yearLevel` | `curriculum_subjects.year_level text` S/T | Preserve year placement, validate range |
| `assignments[].semester` | `curriculum_subjects.semester text` S/T | Preserve term placement |
| `assignments[].prerequisites[]` | `subject_prerequisites.prerequisite_subject_code text` S/T | One edge per prerequisite, both assignments in same curriculum |
| `assignments[].feePerUnit` | X | Demo financial estimate only |
| `assignedSubjects` | `COUNT(curriculum_subjects.subject_code)` D | No duplicated total |
| `totalUnits` | `SUM(subjects.units)` D | Use approved versioned overrides only if required |
| `totalFee`, `totalFeeDisplay` | X | Illustrative fees |
| `semesters[].yearLevel`, `semester`, `subjects[]` | grouped projection over `curriculum_subjects` D | No semesters JSON table or duplicated assignments |

Curriculum create/edit requires effective year, program and applicable track, status, a version name and subject placements. Transitions and protected historical enrollment assignments use transactional validation and append-only history; empty new Draft is valid, empty Active is not.

### 2.4 GUI Block Sections and proposed rosters

Source: `src/features/block-planning/block-planning-seed.js:5-236`, output `blockSections`/`students`/`assignments`, consumed by `AcademicCoordinatorSectionsSchedules.js`. GUI seven columns are Block Identity, Academic Term, Curriculum, Capacity Summary, Capacity Status, Section Status, Actions.

| Frontend field | Target / type / treatment | Notes |
|---|---|---|
| `blockSections[].id` | source-key -> `block_sections.id uuid` T | Deterministic mapping needed |
| `blockSections[].code` | `block_sections.code text` S/T | Display label; approve scoped uniqueness by term/program/optional track/year/letter before adding database constraint |
| `blockSections[].trackCode` | derive approved program/track D/R | Display short label, never standalone program identity; composite block key must handle null track correctly |
| `blockSections[].termId` | `block_sections.term_id text FK` T | Resolve term ID |
| `blockSections[].academicYear`, `semester` | via `academic_terms` D | No duplicate text on block |
| `blockSections[].collegeId` | `programs.organizational_unit_code` D/T | FK through program |
| `blockSections[].programCode`, `programId` | `block_sections.program_code text FK` S/T | Resolve by code |
| `blockSections[].major` | `block_sections.program_track_code text? FK` T/R | Optional approved track |
| `blockSections[].yearLevel` | `block_sections.year_level smallint` T | Source `3rd Year` -> 3, official allowed levels and any section-letter key require approval |
| `blockSections[].curriculumId` | `block_sections.curriculum_code text FK` T/R | Preserve version-specific assignment |
| `blockSections[].capacity` | `block_sections.capacity integer` S | Positive and securely checked |
| `blockSections[].status` | `block_sections.planning_status text` T | `DRAFT` and `PUBLISHED` are plans, not official OPEN/FULL |
| `blockSections[].publishedAt` | `block_sections.published_at timestamptz?` S | Published proposal only |
| `blockSections[].isSyntheticDemo` | seed segregation metadata X | All fixtures synthetic |
| `students[].id`, `studentNumber` | `student_profiles.id uuid`, `.student_number text` R | All 2,128 are **invented**; must not match real identity automatically |
| `students[].fullName` | `app_users.full_name text` R | Synthetic identities blocked from official import |
| `students[].programCode`, `programId`, `collegeId`, `major`, `curriculumId`, `yearLevel` | student profile program/curriculum and joins T/R | Must match authoritative student identity and assigned version |
| `students[].classification`, `progression` | `student_profiles.academic_classification`, `progression_status` R | Only official validation may assign |
| `students[].academicResults[]`, `restrictedFutureSubjectCodes[]`, `academicReviewStatus` | `academic_results`, rule evaluations, `academic_reviews` R/X | **Do not seed invented grades or approvals** |
| `students[].futureTermCandidate`, `status`, `isSyntheticDemo` | X/R | Demo marker or illustrative status only |
| `assignments[].id` | source-key -> `block_student_assignments.id uuid` T | Retain in mapping table |
| `assignments[].studentId` | `block_student_assignments.student_id uuid FK` R | Requires valid approved student, no fake identity creation |
| `assignments[].sectionId` | `block_student_assignments.block_id uuid FK` T | GUI `sectionId` points to **block** |
| `assignments[].termId` | `block_student_assignments.term_id text FK` T | Ensure same as block term |
| `assignments[].status` | `block_student_assignments.status text` T | `PROPOSED` accepted, `CONFIRMED` explicitly excluded from this table |
| `assignments[].isSyntheticDemo` | X | Fixture metadata |

GUI functions Create Section, Edit Section, Assign Students, View Proposed Roster, Transfer Student, View Details, View/Open Schedule, capacity and filter controls require term/program/curriculum context, active proposals, transfer history, and separately sourced **official** confirmed registration counts. The current code's proposal/status fixtures do **not** prove official block membership. Authoritative `enrollments`/`enrollment_subjects` support **subject-section** confirmed counts; a displayed **confirmed block** count additionally requires approved Registrar-owned membership evidence when instructional sections are shared or an irregular student attends multiple blocks. Do not copy the same confirmed student to every block sharing a subject class. The revised Phase 3A schema flags an optional `enrollment_block_memberships` table pending decision. No unverified `confirmed_count` column in the block master.

### 2.5 Subject classes, meetings, professors and rooms

Source: `buildBlockPlanningSeed`, `src/features/block-planning/block-planning-service.js`; `subjectClasses`, `classMeetings`, `professors`, `rooms`. Multiple meetings for a class and resource conflict detection are already modeled in the client.

| Frontend field | Target / type / treatment | Notes |
|---|---|---|
| `subjectClasses[].id` | crosswalk to `sections.id uuid` plus `block_subject_sections` T | GUI class is block-linked, DB section is subject-specific |
| `subjectClasses[].sectionId` | `block_subject_sections.block_id uuid FK` T | GUI source identifier points to block |
| `subjectClasses[].termId` | via `subject_offerings.term_id` D/T | Validate same term as block |
| `subjectClasses[].subjectCode` | `sections.subject_code text FK`, offering FK S/T | Reused subject catalog |
| `subjectClasses[].professorId` | `section_instructors.instructor_id uuid FK` T/R | Professor identity currently synthetic |
| `subjectClasses[].roomType` | requested capability via verified room reference D/R | Do not insert unverified facility types |
| `subjectClasses[].status` | `sections.schedule_status` or linked block plan status T | Distinguish DRAFT/PUBLISHED plan from final actual schedule |
| `classMeetings[].id` | `section_meetings.id uuid` T | Deterministic crosswalk |
| `classMeetings[].subjectClassId` | `section_meetings.section_id uuid FK` T | Resolve subject class to actual DB section |
| `classMeetings[].day` | `section_meetings.day_of_week smallint` T | Mon..Fri -> 1..5, ensure 1..7 scheme |
| `classMeetings[].start`, `end` | `section_meetings.start_time`, `end_time time` T | Require end after start |
| `classMeetings[].roomId` | `section_meetings.room_id uuid FK` T/R | Synthetic facility key needs verification |
| `professors[].id`, `name` | `instructors.id uuid`, `.display_name text` T/R | Invented people, no official insert |
| `professors[].collegeId` | `instructors.organizational_unit_code text? FK` T/R | Optional approved mapping |
| `professors[].category` | source qualification category R | Avoid premature new enum/table |
| `professors[].qualifiedSubjectCodes[]` | `instructor_subject_qualifications` bridge R | Requires approved qualification data |
| `professors[].maxClassesPerTerm`, `maxWeeklyHours` | optional `instructors` limits R | Unapproved 5/10/18 fixture values |
| `professors[].status`, `isSyntheticDemo` | approved instructor active status R; demo marker X | Do not create staff login automatically |
| `rooms[].id`, `name` | `rooms.id uuid`, `.room_code text` T/R | Synthetic rooms differ from live facilities |
| `rooms[].collegeId`, `building`, `floor` | building/organizational reference R; `rooms.building_name text?` | Floor is nonessential to current DB; approve before adding |
| `rooms[].capacity` | `rooms.capacity integer?` R | Real capacities must be verified |
| `rooms[].types[]` | optional `room_capabilities` R | Only if actual validation requires it |
| `rooms[].equipment[]`, `accessible` | future facility metadata R/X | Not needed for first trusted scheduling writes |
| `rooms[].status`, `isSyntheticDemo` | `rooms.is_active boolean` T/R; demo marker X | `AVAILABLE` != authoritative real-time availability |

The class schedule UI's filters, conflict badges, attendance/capacity indicators, and report rows should be derived from joins and an authoritative conflict service. Room, instructor and block overlaps need transaction-safe validation at finalization, not only display checks.

### 2.6 Academic Review and reports

Source: `src/components/academic-coordinator/AcademicCoordinatorAcademicReview.js`, `src/features/academic/academic-review-workflow.js`, `registrar.enrollments` from `DemoDataProvider`, and `src/features/reporting/academic-reports.js`.

| Frontend field or expression | Target / type / treatment | Notes |
|---|---|---|
| `enrollment.reference`, `studentNumber`, `studentName`, `program`, `term` | joins `academic_reviews -> enrollments -> student_profiles/app_users`, `programs`, `academic_terms` D | Do not duplicate person/term in review |
| `enrollment.status` | `enrollments.status text` S | `NEEDS_ACADEMIC_REVIEW` drives active queue |
| `academicReviewDecision`, review state | `academic_reviews.review_status text` T | `PENDING`, `RETURNED_FOR_CLARIFICATION`, `APPROVED`, `REJECTED`, `APPLIED` |
| `academicReviewReason` / request evidence | `academic_reviews.requested_reason`, `supporting_reference` R/T | Separate from decision reason |
| Selected subject, failed prerequisite, failed rule | `academic_reviews.subject_code`, `failed_rule_code` T/R | Scoped to one enrollment/rule; optional for whole-enrollment exception |
| Coordinator actor and decision explanation | `coordinator_user_id`, `decision_reason`, `decided_at` S | Auth actor, not browser-provided identity |
| Applied event | `academic_reviews.applied_at` and append-only `academic_change_history` S | Revalidation required; no direct official confirmation |
| Five `ACADEMIC_REPORT_TYPES` | authorized read-only aggregates/views D | Program/Curriculum, Subjects/Prerequisites, Demand/Capacity, Schedule Monitoring, Review Summary |
| Report `breakdown`, `search`, `sort`, `page`, filters | SQL query parameters D | No saved report master required |
| Report totals/rows, capacity status, conflict count | aggregate joins D | Derived per source/term with no double count |
| Academic Setup initial `history[]` and block `history[]` | `academic_change_history` only for **real trusted** events X/T | Two preset actions are demonstrative; preserve in manifest metadata, not official audit |

Academic Review modal content and decision workflows remain unchanged in Phase 3A. The actual editable review fields require an authorized server action and enforce case-specific decision transitions in Phase 3B. Reports must use the same filtered dataset for preview, export and print.

## 3. Current source behavior and CRUD dependencies

| UI module | Source functions/data flow | Target transaction and query patterns |
|---|---|---|
| Programs | `AcademicSetupWorkspace`, `DemoDataProvider` catalog updater | Coordinator program/track CRUD with FK/uniqueness, write audit; list filtered by unit/status/text |
| Subjects | Catalog updates, prerequisite validation helpers | Subject CRUD and version-qualified prerequisite management, cycle check, curriculum compatibility |
| Curriculum | `transitionCurriculumVersion`, placement manipulation, grouping and expansion | Transactional create/version transition, activation guards, grouped load sum, historical referential preservation |
| Sections | `createBlockSectionRecord`, `updateBlockSectionRecord`, `assignBlockStudentsRecord`, `transferBlockStudentRecord` | Block/bridge/proposal writes, partial unique roster, capacity guard and atomic transfer |
| Class Schedule | `saveBlockMeetingRecord`, `removeBlockMeetingRecord`, `finalizeBlockScheduleRecord` | Subject section meeting writes, instructor/room FKs, authoritative conflict validation and finalization |
| Pending/Resolved Reviews | `academicReviewOutcome`, `demoValidationOutcome`, modal decision controls | Scope/reason/event record, legal status transition, enrollment returns to validation or correction |
| Academic Reports | `buildProgramCurriculumRows`, `buildSubjectPrerequisiteRows`, `buildCapacityRows`, `buildScheduleRows`, `buildAcademicReviewSummary` | Filtered read models and consistent export; do not seed reports |
| Academic Change History | Combined coordinator and block planning local histories | Trusted append-only events filtered to business module, actor, term and record |

## 4. Migration classification and verification requirements

| Classification | Datasets | Action |
|---|---|---|
| Ready for import after **official approval** | Verified programs/departments that can be crosswalked to real DB and actual approved terms | Merge on stable natural key in a separate development database; compare metadata and never overwrite without conflict review |
| Requires transformation | Curriculum and subject fixtures, catalog section references, GUI block-to-subject-class links, text ID to UUID mappings, Title Case statuses, strings for year/semester, prerequisites | Stable crosswalk mapping and validation; do not assume generated curriculum versions are legitimate |
| Requires review | 11 program fixtures versus four live programs; 16 generated curricula versus six live; existing blank curricula/statuses; missing offerings; real faculty qualifications and room capacities; all user-edited localStorage | Manual approval/provenance resolution |
| Derived data | Curriculum subject count/units, fees, reports, section occupancy, availability/full state, schedule conflict badges | Recompute from canonical tables, not seed |
| Excluded from **official** seed | 2,128 invented student profiles and their fake failures, 136 invented faculty/room fixtures, two illustrative audit events, fake Auth accounts/credentials, pending demo academic approvals, interface state | Use only isolated development fixtures after explicit sign-off; no official grade/enrollment/decision claims |

**Deterministic import order after approval:** reconcile units and program keys; approved tracks and subjects; curricula; placements; prerequisites; academic terms; offerings; instructional sections; instructor/room references; block sections and bridge; real authorized student identities then any approved proposed assignments; schedules; scoped reviews; history through actual future trusted actions. Every imported ID must have a `source_system + source_key -> real PK` crosswalk in temporary/staging import evidence; a collision halts import. Check counts per source and table, unresolved IDs, orphans, status conversion errors, repeated keys, immutable existing data and output hashes.

**No migration result yet:** Verification record is the manifest generation (4,005,203 bytes, SHA-256 source payload `579d74f572f45ab77989ddb3f706ff054ec82b60e59c8de88b1e6f437cd94f8c`). No seed or migration executed, no schema altered, no credentials exported. Before Phase 3B, separately sample and reconcile browser-edited Academic Setup and block planning snapshots if the user wishes to preserve those changes.
