# Phase 8: Fictional Academic Data Completion

**Status:** Database academic content, student placement and project schedules populated and validated in live Supabase. Official university approval was neither claimed nor simulated. Future signed-user GUI integration and first complete Registrar enrollment demonstration are separate acceptance activities.

**Project:** `iwuphtvlcszziyvqcbsl` | **Project term:** First Semester AY 2026 to 2027 | **Manifest:** `77d0541efdbae77f45ce105f58bca93b0f78392a3623548f6818fcc2ac0f7ce9`.

## Live implementation results

| Area | Result |
|---|---|
| Programs and majors | All 11 programs, 3 BSBA majors, 4 BSEd majors represented |
| New project curricula | 16 versioned DRAFT fictional curricula, all four years and both semesters |
| New curriculum subjects | 600 new subjects, realistic academic titles and positive 2–4 units |
| Curriculum subject assignments | 960, 7 in first semesters and 8 in second semesters per curriculum |
| New academic prerequisites | 736, strictly preceding term, no new curriculum prerequisite cycles |
| 600 PROJECT_ONLY academic placements | 600 complete current term/year/program/major/curriculum sidecars |
| Previous academic simulations | 11,940 simulated historical results from continuing students |
| Freshman previous PLP grades | 0 |
| Transfer candidate equivalencies | 150 records for 50 transferees, of which 100 PROJECT_CREDITED and 50 PROJECT_PENDING |
| Current eligibility rows | 7,911 project scoped subject eligibility entries |
| Cohort home block assignments | 600 distinct project students, one home block each |
| New project block sections | 61 DRAFT project blocks, all 7 first-semester subjects |
| Block section capacity | Maximum 40, no exceedances |
| Classroom subject sections | 427 |
| Class meetings | 732, weekdays Monday through Friday |
| Fictional instructors | 448, with consistent assignments and natural Filipino names |
| Rooms/laboratories | 143, distinct reusable project resources |
| Curricular contact obligations | 497 component minute requirements |
| Block timetable verification | 61/61 READY_PROJECT, five taught weekdays each |
| Timetable conflict validation | 0 block, room, instructor and contact-hour mismatches |
| Retired original proposals | 1,915 old PROPOSED rows archived as exact JSONB originals, then changed to CANCELLED |
| New project assignments | 600 rows remain PROPOSED, not official enrollment |
| Official enrollment rows | 11 unchanged |
| Official historical academic results | 8 unchanged |
| New official university grades | 0 |
| Demonstration enrollment transactions | 0 by design; no project student auto-confirmed |

## Preservation and access controls

* `auth.users`: **604 unchanged**, including all **600 ACTIVE** PROJECT_ONLY linked identities. No login email, password or user UUID modified.
* `student_profiles`: **2,737 unchanged**, including **2,128 original synthetic planning** profiles. Project academic placement uses a separate guarded table because the genuine identity record is immutable.
* Previously assigned subject, curriculum, admission, grade and enrollment records retained. Original planning source rows not deleted.
* All new private project sidecars and archive tables have RLS; no anonymous read/execute permissions for new academic RPCs. A role-scoped read adapter distinguishes fictional project timetables and history from verified institutional records.
* `project_phase8_student_snapshot_v2` requires completion of first-login password rotation for project students; Registrar and Academic Coordinator read permission remains server checked, with Student limited to their own identity.
* The project-specific simulation enrollment lifecycle requires authenticated Student OPEN/SUBMIT and authenticated Registrar VALIDATE/CONFIRM. It never creates or modifies `public.enrollments`, and its COR is explicitly titled a **demonstration**, with `official=false`.
* The existing official Phase 8 publication guard remains in place. All project blocks are **DRAFT + READY_PROJECT** rather than falsely confirmed official university schedules.
* Generation and old-record archival used exact source counts, provenance and schema identity checks. After data import: zero public tables without RLS and zero unvalidated public constraints.

## Representative current-term schedules

### BSIT 3A, Third Year, 14 PROJECT_ONLY students

Seven curriculum subjects: Advanced Web Development, Cloud Computing Fundamentals, Applications Development and Emerging Technologies, Enterprise Networking, Filipino in Academic Communication, Global Citizenship, and Physical Education and Wellness 3.

| Day | Time | Subject | Room | Fictional professor |
|---|---|---|---|---|
| Monday | 9:00–10:30 AM | Global Citizenship | BSIT-201 | Daniel Garcia Aguilar |
| Monday | 2:30–4:00 PM | Advanced Web Development | BSIT-201 | Rafael Castillo Lim |
| Tuesday | 8:00–9:30 AM | Cloud Computing Fundamentals | BSIT-203 | Luis Mendoza Villanueva |
| Wednesday | 8:00–9:30 AM | Applications Development and Emerging Technologies | BSIT-203 | Luis Soriano Valdez |
| Thursday | 1:00–2:30 PM | Advanced Web Development | BSIT-202 | Rafael Castillo Lim |
| Friday | 7:30–9:00 AM | Filipino in Academic Communication | BSIT-201 | Ana Torres Lim |

The database contains 12 weekly meetings for all seven subjects, not just those shown here.

### BSN 2B, Second Year, 15 PROJECT_ONLY students

Seven curriculum subjects: Adult Health Nursing 1, Maternal and Child Nursing 1, Pathophysiology, Clinical Nursing Assessment, The Contemporary World, Ethics, and Physical Education and Wellness 1.

| Day | Time | Subject | Room | Fictional professor |
|---|---|---|---|---|
| Monday | 10:00 AM–12:00 PM | Maternal and Child Nursing 1, Laboratory | BSN-LAB2 | Miguel Castillo Villanueva |
| Tuesday | 10:30 AM–12:00 PM | Pathophysiology | BSN-202 | Patricia Mendoza Dela Cruz |
| Wednesday | 2:00–4:00 PM | Adult Health Nursing 1 | BSN-201 | Patricia Cruz Del Rosario |
| Thursday | 1:00–3:00 PM | Adult Health Nursing 1, Laboratory | BSN-LAB1 | Patricia Cruz Del Rosario |
| Friday | 2:00–4:00 PM | Maternal and Child Nursing 1 | BSN-202 | Miguel Castillo Villanueva |

The database contains 12 weekly meetings for all seven subjects, including lecture and laboratory classification.

## Implemented artifacts

New academic foundation migration: `20261022095000_project_phase8_simulation_foundation.sql`. Additional applied migrations: `20261022095100_phase8_project_schedule_validation.sql`, `20261022095310_phase8_project_curriculum_import_rpc.sql`, `20261022095320_phase8_generated_year_compatibility.sql`, `20261022095400_service_only_phase8_sidecar_permissions.sql`, `20261022095500_project_phase8_contact_hour_verification.sql`, `20261022095600_project_retirement_read_only_grant.sql`, `20261022095200_phase8_reversible_old_proposal_retirement.sql`, `20261022100000_project_phase8_role_scoped_academic_snapshot.sql`, `20261022100100_project_phase8_simulated_enrollment_cor.sql`, and `20261022100300_project_phase8_first_login_snapshot_gate.sql`.

Source generators, scripts and focused tests are under `scripts/database-normalization/academic-phase8/`. Future backend adapters are `src/features/academic/project-phase8-actions.js`.

Focused generation tests: 25/25 passed. Additional project simulation/access contract tests: 7/7 passed. Targeted ESLint and Next.js 16.4 production build passed. All 61 schedule readiness validations passed in live PostgreSQL. No source academic records or grades were fabricated as official institution-issued data.

## Remaining acceptance tasks

1. Integrate the protected project academic read functions and signed enrollment simulation actions into the four simplified GUI workflows. This stage was intentionally excluded from the present user scope.
2. Run a real supervised Student and Registrar sign-in demonstration to exercise simulated SUBMIT, VALIDATE, CONFIRM and printable **project-only** COR. No live simulation transaction was created automatically.
3. The 599 project students who have not yet signed in must still change their individual temporary passwords at first login. This requirement has not been bypassed.
4. Existing official enrollment term window remains as previously configured; no official enrollment period, Grade Import source verification or real PLP approval was fabricated. All fictional project curricula remain DRAFT for institutional purposes, with separate project schedule readiness.

**Decision:** The fictional Phase 8 academic database is populated and technically validated for the next controlled GUI integration stage; genuine end-to-end application acceptance is still outstanding.
