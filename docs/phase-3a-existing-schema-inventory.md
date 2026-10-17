# Phase 3A | Existing Supabase Schema Inventory and Audit Disposition

**Observed:** Connected Supabase project `iwuphtvlcszziyvqcbsl`, `public` schema, 17 October 2026. **Inspection mode:** catalog queries and read-only aggregate SQL only. **Disposition:** recommendation, not a migration.

This inventory supplements `docs/academic-coordinator-database-audit.md` of October 16 and `phase-3a-schema-finalization-proposal.md`. The Supabase table API reported **46** public tables with RLS enabled. Counts are backend inventory estimates/observations at query time, not official university population counts. Table contents and sensitive student/user data were not exported.

## 1. Every existing public table and current planned treatment

| # | Table | Reported rows | Treatment and main authority |
|---:|---|---:|---|
| 1 | `roles` | 4 | Retain; four trusted role codes, System Administrator provisioning |
| 2 | `permissions` | 14 | Retain; technical permission catalog, System Administrator |
| 3 | `role_permissions` | 20 | Retain; restricted role grants, System Administrator |
| 4 | `organizational_units` | 8 | Retain; college/department master, controlled institutional mapping |
| 5 | `app_users` | 20 | Retain; repair/verify Auth linkage, account controls |
| 6 | `user_login_identifiers` | 51 | Retain; resolve unique University ID/email safely via trusted server |
| 7 | `staff_profiles` | 11 | Retain; staff reference identity and organizational links |
| 8 | `programs` | 4 | Retain; approved master, optional specialization refs |
| 9 | `program_statistics_snapshots` | 4 | Retain as source-labeled historical snapshots, not live headcount |
| 10 | `academic_terms` | 4 | Retain; Registrar term/window authority |
| 11 | `curricula` | 6 | Retain and extend track/lifecycle, reconcile five null statuses |
| 12 | `subjects` | 20 | Retain shared subject catalog, review nullable units |
| 13 | `curriculum_subjects` | 7 | Retain, optional order/units override, reconcile five empty curricula |
| 14 | `subject_prerequisites` | 6 | Retain, enforce composite same-curriculum keys and cycle safety |
| 15 | `instructors` | 6 | Retain, add validated qualifications/limits only when approved |
| 16 | `rooms` | 17 | Retain, validated room capacity/capabilities if needed |
| 17 | `subject_offerings` | 7 | Retain, add verified section FK reference and academic compatibility |
| 18 | `sections` | 26 | Retain as **per-subject sections** with unchanged UUIDs; not GUI blocks |
| 19 | `section_meetings` | 26 | Retain subject-section meetings; add overlap/finalization enforcement |
| 20 | `section_instructors` | 12 | Retain normalized instructor assignment bridge |
| 21 | `section_capacity_snapshots` | 23 | Retain historical source-labeled snapshots only |
| 22 | `student_profiles` | 9 | Retain permanent student identity and assigned curriculum |
| 23 | `integration_configurations` | 0 | Retain; technical config, System Administrator |
| 24 | `integration_requests` | 0 | Retain; technical admission integration request tracking |
| 25 | `synchronization_events` | 0 | Retain; authorized idempotent Admission sync evidence |
| 26 | `admission_handoffs` | 9 | Retain read-only external Admission decision, linked student |
| 27 | `enrollments` | 11 | Retain Registrar confirmation state machine and Student nonfinal flow |
| 28 | `enrollment_subjects` | 15 | Retain official registration by subject section; never use as roster proposals |
| 29 | `enrollment_policy_overrides` | 1 | Retain scoped institutional exception record; review override authority |
| 30 | `enrollment_corrections` | 1 | Retain Registrar correction history |
| 31 | `academic_results` | 8 | Retain read-only authoritative result support, controlled Registrar import only |
| 32 | `academic_reviews` | 1 | Retain, extend subject/rule scope and decision evidence |
| 33 | `enrollment_status_transitions` | 15 | Retain canonical transition reference |
| 34 | `enrollment_status_history` | 3 | Retain historical enrollment status evidence |
| 35 | `student_subject_eligibility` | 7 | Retain source-marked cache, re-evaluate at protected transitions |
| 36 | `notifications` | 14 | Retain recipient-limited notifications |
| 37 | `user_notifications` | 14 | Retain user-specific notification state |
| 38 | `audit_events` | 3 | Retain technical audit authority, System Administrator read |
| 39 | `data_quality_issues` | 3 | Retain Registrar/system data quality process |
| 40 | `academic_change_history` | 0 | Retain; trusted append-only academic audit and decision record |
| 41 | `system_settings` | 1 | Retain; technical settings with restricted writes |
| 42 | `security_settings` | 1 | Retain; restricted auth/security configuration |
| 43 | `backup_records` | 0 | Retain; technical backup metadata, **not evidence of actual backup** |
| 44 | `database_maintenance_events` | 0 | Retain; restricted database maintenance audit |
| 45 | `system_errors` | 0 | Retain; technical errors without student exposure |
| 46 | `system_health_snapshots` | 0 | Retain; technical monitoring snapshots |

**Proposed new entities:** `program_tracks`, `block_sections`, `block_subject_sections`, and `block_student_assignments`; `instructor_subject_qualifications` and room capability join only after explicit requirement/source approval. No independent duplicate `users`, `students`, `curriculums`, `prerequisites`, `student_enrollments`, `class_schedules`, `subject_classes`, `class_meetings`, `academic_reports` or `audit_logs` when existing normalized tables already serve those purposes.

## 2. Current key and relationship observations

- Academic master codes are **text**: `programs.code`, `subjects.code`, `curricula.code` and `academic_terms.id`. The source conceptual ERD's UUID recommendation does not justify changing stored keys. Section, meeting, review and enrollment PKs are already `uuid`.
- `programs.organizational_unit_code` is an optional FK to organizational units; `programs.name` is unique; `status` is constrained to Title Case `Active/Inactive`.
- `curricula.program_code` is required, its `name` is globally unique; `status` is nullable without a CHECK; `curriculum_subjects` has composite PK `(curriculum_code,subject_code)` and optional year, semester and requirement. Historic program/term identities need reconciliation before stricter constraints.
- `subject_prerequisites` is keyed by the curriculum/subject/prerequisite triple, has individual FKs to catalog and a self-reference CHECK plus existing `prevent_prerequisite_cycle` trigger, but no verified composite FK proving both subjects are placed in that curriculum.
- `subject_offerings` has a unique `(term_id,program_code,curriculum_code,subject_code)`; `sections` currently references term and subject but **not** offering, curriculum or block; `sections` uniqueness on `(source_system,source_key)` must be kept. Repeated `(term_id,section_code)` labels do not imply duplicate instructional sections.
- `section_meetings` references `sections` and optional `rooms`; its exact-row UNIQUE does not block overlapping time intervals or room/professor/block conflicts. Its nullable meeting fields permit draft incompleteness, so finalize through trusted validation.
- `enrollment_subjects` has composite PK `(enrollment_id,subject_code)` and optional FK to `sections.id`. `enrollments` is the authoritative state machine; `academic_reviews` currently has FK `enrollment_id` with `ON DELETE CASCADE`, which must be evaluated against long-lived review evidence.
- `app_users.auth_user_id` is optional unique FK to `auth.users`; using `user_login_identifiers` for ID/email requires trustworthy server resolution and strong duplicate checks, not a browser select.

## 3. Recheck of October 16 audit findings

| Audit item | October 17 read-only result | Disposition |
|---|---|---|
| 46 public tables, RLS enabled | 46 / all reported enabled | **Still accurate** |
| Zero migrations | Migration history returned no rows | **Still accurate**; baseline first |
| Five curricula with null statuses | 5 | **Unresolved**; manual lifecycle classification required |
| Five curricula without any placements | 5 | **Unresolved**; empty Draft may be valid, must not auto-activate |
| Subject sections without matching term/subject offering | 10 | **Unresolved**; source data/provenance needed for safe FK backfill |
| Repeated term/section display code groups | 4 | **Still observed**, but not proven error; block grouping needs stable scoped identity |
| Missing academic history events | 0 rows in history | **Unresolved**; capture pipeline missing from inspected academic master write path |
| Existing production-ready Supabase Auth and RLS | Only 1 of 20 app users linked to Auth; real session tests unperformed | **Unverified**, do not treat policies as complete integration |
| Supabase function search-path and RPC exposure | Security advisors still flag 2 mutable search paths, 7 callable SECURITY DEFINER functions, leaked-password check off | **Unresolved** security review needed, do not revoke indiscriminately |

**No demonstrated resolved finding:** The inspected live state has not established a reliable fix for any of the primary P0/P1 items from the October 16 audit. Existing PKs and RLS policies remain useful foundations rather than proof that the requirements are fully implemented.

## 4. Required safe dependency order and data protections

1. Before implementation, verify target environment, actual database backup and recovery, the schema baseline and all live relationships. `backup_records` being empty does not prove no platform backup exists, and having a backups table never proves recovery availability.
2. Reconcile text ID collisions, existing foreign keys and old data; document exact live authoritative versus synthetic example provenance.
3. Add additive reference tables and nullable columns, plan version and section relationship backfills. Record counts, FK violations and changed rows before enforcing tighter constraints.
4. Preserve every existing `enrollment_subjects.section_id` and `student_profiles.current_curriculum_code`; create block grouping separately, reconcile ten unmatched offerings and four label groupings by source identifiers. No key replacement in place.
5. Test proposal counts versus official confirmations and coordinate role security/approved data seeding only after Phase 3A sign-off.

**Risk ranking:** P0: source-of-truth distinction for blocks and Auth linkage. P1: nullable curriculum statuses, missing offerings, review scoping, audit integrity and conflict concurrency. P2: report aggregation, controlled indexes and status UI translation. See the primary proposal for full FK/CK/index targets and approval decisions. **All changes remain proposed.**
