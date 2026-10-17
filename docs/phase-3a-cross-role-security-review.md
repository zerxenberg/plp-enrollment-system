# Phase 3A | Four Role Relationships, Authentication and Security Blueprint

**Status:** Proposed only, 17 October 2026. No Supabase Authentication, grants, RLS policies, SQL migrations or application routes changed.

This review supports the [Phase 3A schema proposal](phase-3a-schema-finalization-proposal.md), [field mapping](phase-3a-frontend-mock-mapping.md) and [verified source review](phase-3a-source-document-verification.md). It applies the final four role workflows, October 2026 Canonical Status and Workflow Dictionary, Academic Rules Matrix and current Academic Coordinator components. The **Simplified Academic Coordinator DOCX edition 2.0 is now available and was directly reviewed**. Its exact modules, pending/resolved review context, provisional block authority, reports and history read models are reflected in the revised proposal. Institutionally unconfirmed policies remain pending.

## 1. Identity and authority boundaries

**Student:** Owns nonfinal subject and section selections, permitted correction replies and allowed personal contact changes. Reads own academic completion results, deficiencies, assigned curriculum, approved academic references, enrolled subjects, confirmed class schedule, and only own notifications. The permanent student identity is retained across external Admission and subsequent enrollment periods. No institutional academic master writes.

**Registrar:** Owns term enrollment operations, official student record correction, validation, confirmed subject section assignment, final enrollment confirmation, approved academic-result imports, approved publication of completion results and enrollment history. Consumes Academic Coordinator curricula and review decisions as reference. No user-role administration, unapproved academic rule editing or technical security settings.

**Academic Coordinator:** Owns approved programs, subjects, curriculum version rules and placements, offerings, proposed block rosters, section and schedule plans, and narrowly scoped academic exception decisions. Reads only student/enrollment context needed for a particular case, plus authorized aggregated reports. Must never directly confirm enrollment, publish grades, manage identities or alter unrelated student records.

**System Administrator:** Owns technical accounts, role assignments, account enablement, integrations, infrastructure, recoverability, security monitoring and technical audit. This technical authority does **not** grant business authority to approve academic cases, alter student grades or confirm enrollment. Technical maintenance can still use an appropriately audited privileged operational path outside ordinary app-role authorization.

The four role codes are the existing canonical values `student`, `registrar`, `academic-coordinator`, and `system-administrator` as observed in RLS helper policy predicates. Verify the `roles` table and login-route mapping during Phase 3B. Persist separately scoped workflow statuses as upper-snake-case codes, with Title Case only in the frontend presentation layer; do not create a universal status enum.

## 2. Cross role relationship, write authority and RLS matrix

The matrix defines proposed *application* authority, not a claim that existing RLS currently meets all tests. Abbreviations: **S** Student, **R** Registrar, **AC** Academic Coordinator, **SA** System Administrator, **T** trusted application/server function. `Read` means subject to scope and confidentiality, not open access to every row. Database-owned derived views may additionally grant limited safe result projection; client role alone must never authorize privileged actions.

| Tables / relationships | Authoritative owner | Reads | Writes | FK / workflow dependency and proposed enforcement |
|---|---|---|---|---|
| `roles`, `permissions`, `role_permissions` | SA provisioned technical records | SA; per-session necessary role lookup for each account | SA via T only | Stable role codes; forbid public/ordinary role mutation, privilege escalation and user-managed role metadata |
| `app_users`, `user_login_identifiers` | SA / trusted admission provisioning | Self limited profile; SA for account management | SA via T; Auth link via T | `auth.users.id` -> `app_users.auth_user_id` unique; login identifier unique after normalization, role and account state never self editable |
| `staff_profiles` | SA for account registry; approved HR source when available | Self; SA; R/AC only non-sensitive reference when needed | SA/T only | `app_users.id` unique, organizational unit FK, distinct from instructor catalog |
| `student_profiles` | R and trusted admission handoff | Own S; R; AC only case-limited context | S restricted contact fields; R/T official correction | `app_users.id` stable unique; program/current curriculum FKs; student number is permanent, cannot be self reassigned |
| `admission_handoffs`, `synchronization_events` | External Admission through trusted integration | Own S limited; R; SA technical integration | T reconciliation only | Unique external applicant reference, idempotent transfer, Admission decision remains read only |
| `organizational_units` | Approved institution reference | S,R,AC,SA as necessary | T after approved source update | Referenced by programs/staff; `COE` display collision requires distinct stable keys |
| `programs`, `program_tracks` | AC academic master | Authenticated role as required; S only approved relevant list | AC/T | Program FK, track belongs to program; student record assigned program edited only by R |
| `subjects` | AC | S,R,AC | AC/T | Shared catalog across versions; server enforces active status and dependency safety |
| `curricula`, `curriculum_subjects`, `subject_prerequisites` | AC | S assigned curriculum/approved reference; R,AC | AC/T | Version FK from student/enrollment; immutable historical assignment, cycle and same-curriculum membership checks |
| `academic_terms` | R operational enrollment dates/status | S,R,AC | R/T | Separate enrollment-window authority from Coordinator offering and schedule planning |
| `subject_offerings` | AC | S,R,AC | AC/T | Term/program/curriculum/subject FKs; current active offering required for student selection |
| `sections`, `section_instructors`, `section_meetings` | AC planning | S relevant offered sections; R; AC | AC/T; limited R correction only after explicit policy | Existing subject sections referenced by enrollment_subjects; capacity/schedule must validate against confirmed transactions |
| `rooms`, `instructors`, optional qualifications | AC scheduling reference, approved facilities/HR source | R,AC; S published schedule projection | AC/T after source verification | Resource FK; collision detection; no invented Faculty portal |
| `block_sections`, `block_subject_sections` | AC | AC, R; S only safe applicable finalized projection when required | AC/T | Block term, curriculum and program consistency, subject section bridge; `PUBLISHED` is only an available plan |
| `block_student_assignments` | AC provisional planning | AC and R; S own proposal only if product requires | AC/T only | Student and block FKs; uniqueness for a student's active proposal in term; never treated as enrollment |
| **Optional** `enrollment_block_memberships`, pending approval | **R official block attribution**, only if the institution records confirmed home-block membership | R; AC read-only summary; S own confirmed affiliation if permitted | R/T only | Cannot derive an official per-block confirmed count from shared subject-section enrollments; confirm irregular student cardinality and status policy before creating |
| `section_capacity_snapshots`, `program_statistics_snapshots` | Source-defined imported snapshot | R,AC authorized aggregate | T sourced snapshots only | Historical source and timestamp; not authoritative live occupancy |
| `student_subject_eligibility` | System evaluated cache | Own S; R; AC limited case | T re-evaluation only | Student, subject and term FKs, stale data must not bypass current checks |
| `academic_results` | Authoritative result source / approved R import | Own S; R; AC only minimum exception condition | R/T publication after approved verification; no AC edits | Student, subject, term FKs; completion statuses official and sourced, no invented grades |
| `enrollments`, `enrollment_subjects` | S nonfinal selection; R official status | Own S; R; AC only review-linked scope | S/T only legal draft fields; R/T for validation/confirmed corrections | Enrollment belongs to student and term; selected section must match offering and subject; `CONFIRMED` Registrar-only |
| `academic_reviews` | AC academic exception judgment | Own S limited case; R; AC only assigned/authorized queue | T creates review request; AC/T decides scoped exception; T applies after validation | Enrollment FK; optional subject/rule; AC approval cannot confirm enrollment |
| `academic_change_history` | Trusted academic audit service | AC for authorized academic history; R for pertinent business events | T append only | Actor identity, entity type/key, before/after, decision history; no ordinary updates/deletes |
| `audit_events` | Technical trusted audit | SA technical monitoring; narrow audit reviewer | T append only | Protected operational details, no AC mass visibility |
| `notifications`, `user_notifications` | Trusted event delivery service | Only recipient's notification and read state; SA limited operational indicators | T sends; recipient can change own read status | User FK, no cross-user notifications |
| `system_settings`, `security_settings`, `integration_configurations`, `backup_records`, `database_maintenance_events`, `system_errors`, `system_health_snapshots` | SA technical operations | SA restricted | SA/T only | No R or AC technical write rights, no business-grant side effect |

Do not grant direct `DELETE` on records used as historic academic/enrollment evidence. For every other record, each `SELECT`, `INSERT`, `UPDATE`, `DELETE` policy requires a case-specific rationale; absence of a policy is an intentional deny. Existing RLS is enabled on all 46 public tables, but its real-session behavior was not tested in Phase 3A.

## 3. Supabase Auth architecture and central sign-in

1. Keep the existing centralized login UI. Its identifier accepts **University ID Number or Registered Email** and a password. University ID may map through `student_profiles.student_number` or an authorized `user_login_identifiers` row to exactly one application user. Other authorized staff identifiers use the same trusted map. Do not grant anonymous clients a direct identifier enumeration query.
2. Use `auth.users.id` as the authentication identity, with `app_users.auth_user_id` a unique FK. `app_users.role_code`, `login_enabled`, and status are authoritative database-controlled fields, never values submitted from browser `user_metadata`. Existing 20 app users have only one linked Auth identity: provision/link after approved deduplication, do not fabricate identities or silently enable accounts.
3. For username/University-ID sign-in, implement a rate-limited **trusted server endpoint** that resolves the normalized identifier and then authenticates with Supabase Auth without disclosing whether the identifier exists. Return consistent generic errors and timing where feasible, log abuse attempts, and use restricted credentials only inside server environment variables. A simpler approved alternative is email login with a server-issued credential path after secure account provisioning, while retaining the same GUI label.
4. Use the session-aware Supabase SSR integration and trusted server authorization checks for protected routes and writes. Verify current user identity with an Auth trusted server method, account active/enabled flag and role lookup on sensitive actions. Validate currently active session where immediate revocation is required; old JWT claims may remain fresh until token expiry.
5. Admission integration must use an idempotent applicant reference and match existing `student_profiles`/`app_users` identities, even for new-to-continuing transitions. Never create a second account or repeat external Admission. Passwords live only in Supabase Auth. Store neither password hash nor raw secret in `app_users`.
6. Keep `SUPABASE_SERVICE_ROLE_KEY` or privileged key on server only and out of version control and `NEXT_PUBLIC_` configuration. Browser uses only deliberately publishable credentials. Protect recovery, reset, account deactivation, role changes and session invalidation through authorized administrative operations.

## 4. Proposed RLS and privilege approach

**Layer 1: Grants and schema exposure.** Review Data API exposed schemas and table/sequence/function grants. RLS alone does not grant table privileges, and a table grant alone does not confer row ownership. Deny anon access to protected academic/student/business tables. Keep internal Auth/role helper functions in a non-exposed, restricted schema where possible; validate call dependencies before revoking any current routine.

**Layer 2: Row ownership.** On Student-owned tables use `auth.uid()` linked by trusted `app_users.auth_user_id` and `student_profiles.user_id`; enforce `USING` and `WITH CHECK` for UPDATE. Scope selection to the actual permitted enrollment state. For AC/Registrar records, role checks must be backed by current trusted database roles and relevant record context, not just `TO authenticated`.

**Layer 3: Protected columns, transitions and events.** RLS is row-granular, so protect role_code, official student identity, curriculum version, grades, confirmation, verified academic review decision, and audit fields using column GRANT limits or single-purpose validated server functions. AC review decisions and Registrar confirmation must recheck status and expected row version under transaction/lock.

**Layer 4: Reporting views and RPC.** Prefer parameterized, RLS-aware read models and PostgreSQL 15+ `security_invoker=true` for exposed views. Review any `SECURITY DEFINER` as potential bypass, set safe immutable search paths, schema-qualify sensitive calls and explicitly revoke blanket EXECUTE. Do not use service role for ordinary user browsing or data exports. Suppress unnecessary personally identifying context in aggregate exports.

**Current security observations (read-only, 17 October 2026):** Supabase security advisors flagged `public.set_updated_at` and `public.prevent_prerequisite_cycle` for mutable search paths; and seven existing callable `SECURITY DEFINER` routines: `current_app_user_id`, `current_role_code`, `current_student_profile_id`, `has_role`, `link_preprovisioned_app_user`, `protect_student_profile_update`, and `validate_enrollment_status_transition`. The same seven are executable by both `anon` and `authenticated` according to catalog privileges. Review each for necessary invocation from RLS/triggers and exposure; don't blindly revoke a helper required by current policies. Leaked-password protection is currently disabled. See [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) and [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The currently reported academic write policies use `has_role('academic-coordinator')` on program/subject/curriculum/section sources. Their presence is not proof that a real user can safely use these policies, since most app users are not Auth linked and direct RPC or column-level bypass tests were not performed. In particular, current `academic_change_history` Coordinator INSERT policy makes untrusted event fabrication a consideration; replace client-writable audit entries with trusted capture only after reviewing the actual grants.

## 5. Workflow-specific non-bypass tests for Phase 3B

| Actor and situation | Action to test | Expected outcome |
|---|---|---|
| Anonymous | Fetch program master, private student profiles, identifier map, technical logs, or role RPCs | Denied; no identity enumeration |
| Student A | Read/update Student B, their enrollment, review, results, notifications or active proposed roster | Denied |
| Student | Update `student_number`, role, term/year master, campus program, current curriculum or account activation fields | Denied |
| Student | Edit own confirmed enrollment or choose a full/closed section | Denied, returned actionable business validation reason |
| Student | Add duplicate subject, repeat completed subject, bypass prerequisite, or use stale eligibility | Denied or defined scoped review, never silent bypass |
| Academic Coordinator | Modify programs and curriculum assigned to eligible authorized master data | Allowed within validated transaction, history appended |
| Academic Coordinator | Approve exception for Student A, then reuse against Student B/subject B | Denied |
| Academic Coordinator | Confirm official enrollment or publish grade, even after approving exception | Denied |
| Registrar | Validate and confirm an eligible `VALIDATED` enrollment after rechecking capacity/reviews | Allowed exactly once, official history appended |
| Registrar | Edit user role, database security settings, system access grants or technical API configuration | Denied |
| System Administrator | Manage authorized account role, deactivate account and inspect security event | Allowed via audited technical route |
| System Administrator | Approve exception, modify academic program or confirm business enrollment through ordinary role | Denied |
| All application roles | Update or delete protected academic or technical audit rows | Denied |
| Concurrent requests | Confirm last available section seat twice | At most capacity permits; no double confirmation |
| Concurrent coordinators | Propose one student in multiple home blocks in same term | Enforce at most one active proposed **home** block only if institution confirms that model; different subject classes across blocks remain governed by official section-selection rules |
| Concurrent coordinators | Create overlapping room/instructor/shared block meetings | Collision prevented at commit |
| Every protected workflow | Invoke direct PostgREST and RPC API bypassing GUI | Same authorization outcome |

Any `UPDATE` path must have an appropriate `SELECT` policy and `WITH CHECK`; review direct table access and function execution under anonymous, Student, Registrar, Coordinator and System Administrator sessions. Existing static demo sign-in does not establish these tests.

## 6. Registrar grade import compatibility

The planning file `Official Student Grades Import Workflow Functionalities - Registrar.docx` is an **October 2026 proposed extension**, not approved institutional policy. It calls for imported results to be associated with a real student, subject, term and completed attempt or approved credit; source verification and authorized batch publication before the result becomes authoritative. No grade computation, separate faculty portal or bulk fabricated academic results.

Keep the current `academic_results` as the public eligibility read-side only; the proposed later grade import may require separate `grade_import_batches`, `grade_import_rows`, `grade_import_verifications`, and result revision/provenance history **only after approval of the import extension and its final workflow**. Do not conflate temporary staging rows with completed `academic_results`. Publish all verified rows transactionally, protect against duplicate file/checksum retries, and invalidate/recompute affected eligibility after publication. RLS must separate Registrar import/write authority, own-student published-result reads and AC's minimum exception-review context. These additional tables are **deferred scope**, not implicitly approved by Phase 3A.

## 7. Data lifecycle and relationship consequences

The trusted Student path is `auth.users -> app_users -> student_profiles -> enrollments -> enrollment_subjects -> sections -> section_meetings`. The program and curriculum dimensions referenced by profiles/enrollments must remain stable. The trusted Academic Coordinator scheduling path is `curricula -> block_sections -> block_subject_sections -> sections -> section_meetings`. A shared real subject section can be referenced by more than one block and must be deduplicated when measuring actual attendance, conflict and capacity. The proposed roster is `student_profiles -> block_student_assignments -> block_sections`, not an alternative path to `CONFIRMED` enrollment. Reviews bridge these paths only through a defined enrollment transaction and optional subject/rule key.

The projected RLS for `block_student_assignments` should **not** expose the complete roster to all Students. AC needs authorized planning work; Registrar needs read-only reference; student read is optional own-row projection. Sensitive review context must similarly be limited to a user, a Registrar officer or an authorized Coordinator queue.

## 8. Required security approvals before implementation

- [ ] Approve true four-role mapping in `roles` and trusted app-user/Auth association; approve identity matching for existing twenty users.
- [ ] Confirm which official person or unit may approve program tracks, faculty qualification data, room capacities, curricular historical changes and grade import publication.
- [ ] Approve Student contact-column allowances and Academic Coordinator's minimum enrollment/review reader scopes.
- [ ] Approve account activation, lock/recovery and University ID resolver rate-limiting and non-enumeration behavior.
- [ ] Approve revised audit capture restrictions and review of all seven exposed privileged functions, including any RLS dependencies.
- [ ] Confirm whether the proposed Registrar official grade import extension is in scope now or remains a separate approved feature.
- [ ] Confirm isolated Supabase development target, actual backup/restore method and verified migration baseline before any Phase 3B change.

**Phase checkpoint:** This entire document is read-only Phase 3A planning. No migration, seed, authorization change, session configuration, account linking or production modification is permitted without the user's express approval of the schema proposal.
