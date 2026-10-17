# Phase 3B | Main Supabase Deployment and Acceptance Report

**Review date:** 17 October 2026  
**Database:** Supabase project `iwuphtvlcszziyvqcbsl`, PLP Enrollment System (PostgreSQL 17)  
**Status:** **17 migrations applied; full Phase 3B acceptance NOT achieved.** Synthetic Coordinator demonstration records are now backed by protected database read models; official data is intentionally not bulk overwritten.

## 1. Backup and release gate

The user explicitly confirmed that a **recoverable main database backup had been created, verified and restore-tested** before this deployment. The agent relied on this user attestation, which authorizes the database gate. The agent did **not** independently inspect or restore the private archive. Supabase's organization is on the Free plan; `public.backup_records` metadata was empty before deployment and is not proof for or against an external manual backup.

Preflight: public database had 46 RLS-enabled tables, no Supabase migration entries, and the core account, student, enrollment, curriculum, section, academic review and history rows documented below. Previous uncommitted code changes were preserved. No deletion or bulk overwrite of existing official records was authorized or performed.

## 2. Supabase migration results (applied and tracked)

All seventeen new migrations succeeded, **in the exact order shown**. Their file paths live in `supabase/migrations/`; Supabase assigned the following tracked version identifiers:

| File prefix | Supabase version | Result |
|---|---|---|
| `20261017000100_phase3b_academic_foundation.sql` | `20261017013130` | Added program tracks, academic blocks, block-to-instructional-section links, proposed rosters, metadata columns, FKs and new table RLS |
| `20261017000200_phase3b_audit_and_review_guards.sql` | `20261017013154` | Historical FK `RESTRICT` actions, append-oriented academic change capture and review transition guards |
| `20261017000300_phase3b_academic_review_rpc.sql` | `20261017013202` | Atomic scoped Academic Review decision and enrollment handoff transaction |
| `20261017000400_phase3b_identity_and_least_privilege.sql` | `20261017013219` | Requires active/enabled app account for role mapping; verified-email Auth linking; scoped Coordinator student reference RPC |
| `20261017000500_phase3b_provisional_roster_transactions.sql` | `20261017013233` | Protected provisional assignment, transfer and capacity checks |
| `20261017000600_phase3b_existing_function_security.sql` | `20261017013512` | Removed preexisting anonymous privileged RPC access and fixed two search paths |
| `20261017000700_phase3b_demo_fixture_archive.sql` | `20261017013644` | Added private `academic_demo.fixture_records` archive, inaccessible to client application roles |
| `20261017000800_phase3b_curriculum_transactions.sql` | `20261017014310` | Protected curriculum draft, placement/prerequisite and lifecycle RPCs without overwriting historical assigned versions |
| `20261017000900_phase3b_class_schedule_transactions.sql` | `20261017014604` | Protected instructional class preparation, time conflict checks, meeting cancellation and proposal publication RPCs |
| `20261017001000_phase3b_protected_planning_writes.sql` | `20261017015325` | Atomic guarded block creation/edit plus removal of direct academic curriculum, offering, timetable and block REST writes |
| `20261017001100_phase3b_roster_grant_correction.sql` | `20261017015434` | Removed inherited direct roster insert/update privileges discovered by effective-grant verification |
| `20261017001200_phase3b_block_transaction_integrity.sql` | `20261017021106` | Prevents new draft blocks without matching curriculum placements; synchronizes draft section capacity; blocks unsafe edits of shared/finalized instructional classes |
| `20261017001300_phase3b_identifier_login_rate_limits.sql` | `20261017021323` | Adds a deny-by-default per-identifier/IP hashed rate-limit table and service-only atomic throttle RPC for trusted University ID sign-in |
| `20261017001400_phase3b_notification_update_least_privilege.sql` | `20261017021935` | Removes authenticated update rights to notification ownership/targets, while retaining permitted read-status fields only |
| `20261017001500_phase3b_synthetic_operational_read_model.sql` | `20261017030740` | Stores all 6,530 source records in a provenance-preserving protected operational read model and 11,336 relational foreign key links; exposes Coordinator-only paginated read RPC |
| `20261017001600_phase3b_synthetic_supplemental_sources.sql` | `20261017031049` | Isolates original Registrar demo enrollment cases, Coordinator history and offerings in a separate protected supplemental source; 17 seed rows imported separately |
| `20261017001700_phase3b_synthetic_curriculum_relations.sql` | `20261017031639` | Normalizes 640 preserved curriculum subject placements and 448 prerequisite edges with intra-version FKs within private synthetic storage |

**Data integrity recheck:** Existing **20 app users**, **9 official student profiles**, **11 enrollments**, **6 curricula**, **26 instructional sections**, **1 academic review** and **0 earlier academic history records** remained at their preflight counts. All four newly created public tables have RLS enabled. Empty `block_sections` is expected until an authorized Coordinator creates official planning records. Effective database privilege rechecks confirmed **no direct `authenticated` INSERT/UPDATE** on curriculum, prerequisites, subject offerings, instructional sections, section meetings, blocks, block bridges or proposed rosters. Coordinator writes flow through role-guarded RPCs.

## 3. Approved mock data migration: archive, NOT official data

The source manifest SHA-256 was verified as `579d74f572f45ab77989ddb3f706ff054ec82b60e59c8de88b1e6f437cd94f8c`. The source is **synthetic** and not certified university master data.

`scripts/prepare-phase3b-demo-archive.mjs --write` generated 50 idempotent, SQL-quoted import batches. All 50 were successfully imported into **`academic_demo.fixture_records`**, and a database count confirmed **6,530 source records in 20 groups**. Each stores its original source group, source key, full JSON payload and payload digest, classified `SYNTHETIC_DEVELOPMENT_ONLY`. The schema is not exposed to `anon` or `authenticated` and cannot be mistaken for official university students, instructors, curricula, grades or enrollment confirmations.

The manifest includes **2,128 fictional students**, **2,128 proposed assignments**, 136 blocks, 680 subject-class mappings, 342 meetings, 136 fictional professors and 75 fictional rooms, alongside duplicated catalog/reference arrays. Source fixture rows are deliberately **not inserted into official `student_profiles`, `app_users`, `academic_results` or operational academic catalog tables**. Doing so without verified identity/curriculum/room provenance would compromise university records. The source remains available for a separately identified demo dataset and controlled fixture QA.

## 4. Academic Coordinator application paths

`src/features/academic/live-academic-data.js` reads live RLS-bound Supabase records and maps them into the existing GUI props. `LiveAcademicCoordinatorProvider.js` replaces browser-local mock snapshots for authenticated Coordinators without changing the portal layout. The live view **fails closed** if schema or permitted reads are unavailable. The five main areas and their submodules have these implementation states:

| Module | Implemented code paths | What is still unverified or incomplete |
|---|---|---|
| Dashboard | Live catalogs, term, review counts, proposed blocks and academic history; live academic term selection fixed | Authenticated rendering, precise source authorization, institution-approved capacity classification |
| Academic Setup / Programs | Protected live create/edit plus program/college display | Creating/editing specialization lists is deliberately withheld until registered track codes are approved; archive/delete semantics need tests |
| Academic Setup / Subjects | Protected live catalog create/edit, linked curriculum and prerequisites read models | Subject form prerequisite changes that imply version-wide updates are guarded; no independent delete of referenced official subjects |
| Academic Setup / Curriculum | Protected draft save/duplicate/validate/activate/deactivate/archive/restore RPCs; version-aware placements and prerequisite edges | Authenticated lifecycle test, all eight semester validation and cohort activation acceptance; removal of existing draft subject placements is blocked pending traceable correction |
| Sections & Schedules / Sections | Atomic guarded block create/edit and planned instructional class preparation, proposed rosters and reasoned transfers | Authenticated capacity/concurrency and irregular-student tests; official confirmed block count requires Registrar home-block attribution policy |
| Sections & Schedules / Class Schedule | Protected meeting save/cancel, professor/room conflict guard and proposed schedule publication. Does not open enrollment or confirm students | Qualifying instructors, formal room capacity and resource rules still need verified university reference data and authenticated concurrency tests |
| Academic Review / Pending, Resolved | Live review scope, reasoned SQL transaction and preserved history | Authenticated Academic Coordinator-to-Registrar handoff test and verified minimized student reference permissions |
| Reports & Monitoring / Five Reports | Live academic and enrollment records fed to the existing five report builders, initial preview, filtering, CSV and print paths | Confirmed block attribution unavailable without official evidence; report totals, export authorization and edge cases not yet end-to-end verified |
| Reports & Monitoring / Academic Change History | Append-only database trigger writes and read model | No authenticated Coordinator write action yet exercised to verify before/after events in production |
| Academic alerts | Live `notifications`/`user_notifications` retrieval and persistent read status | Authenticated record-level test |

**Authentication:** Registered-email/password login uses Supabase Auth plus an enabled active `app_users` link; browser-side redirects are not trusted as database authority. The University ID server route `/api/auth/university-id` is now **implemented in code**, checks the private identifier mapping with a server-only privileged Supabase client, authenticates the password through Supabase Auth, verifies the linked confirmed identity, returns credentials only after success, and applies per-identifier plus network rate limiting using keyed hashes. It does not expose private identifier-to-email mappings. **The route is not operationally accepted** because the required private environment variables and genuine successful login tests remain outstanding. It fails closed with HTTP 503 when those settings are absent. Do not expose the restricted `user_login_identifiers` lookup anonymously.

**Account provisioning (fresh read on 17 October):** The most recent read-only inventory found **1 Auth-linked Academic Coordinator, 0 Registrars, 1 Student and 2 System Administrators** among preprovisioned `app_users` records. Of these links, **1 Coordinator, 1 Student and 1 System Administrator** have both `account_status='Active'` and `login_enabled=true`; the second linked Administrator is not enabled. No passwords or real sessions were supplied to the agent. Do not infer authenticated test success from an Auth link. No fake official accounts or credentials were created.

## 5. Verified checks versus pending acceptance

**Passing:** `npm run lint`; `npm run build` including all Academic Coordinator routes and the dynamic University ID endpoint; read-only anonymous access test of **eight** protected public tables; explicit `42501` denial for **12** protected RPCs using an anonymous publishable client; all **fourteen** migrations tracked; all four new academic public tables RLS-enabled; identifier throttle table RLS-enabled without client policies; precise function privilege checks showing only `service_role` may execute the throttle; a transaction-rollback SQL rate-counter unit test under an emulated privileged request role returned without error; notification permissions confirmed with `user_id`, `notification_id` and `created_at` not editable by authenticated clients while `is_read` and `read_at` remain editable; exact 6,530 fixture archive counts and 20 groups; official row counts unchanged; protected tables confirmed to deny direct authenticated writes. A local HTTP POST to the ID login endpoint returned the expected HTTP 503 when private server credentials are absent.

**Still required before declaring Phase 3B complete:**

1. Provision/verify real approved Supabase Auth identities for each of four roles and test sign-in and role isolation, including session revocation.
2. Implement secure University ID sign-in with trusted resolver, abuse protection and privacy-safe errors.
3. Execute actual authenticated Coordinator GUI CRUD, curricula, prerequisites, block roster transfers, schedule conflicts, Academic Review and history flows with reversible test records and no risk to official enrollments.
4. Test field-level RLS permissions and all four roles under genuine sessions; SQL anonymous checks cannot prove positive/negative authenticated permissions.
5. Resolve canonical policies for confirmed home blocks and irregular students, specialization codes, workload/room qualifications and archived-version lifecycle.
6. Verify all report and CSV/print aggregate figures against authorized database queries and final Registrar state. Prevent multiplying counts across shared instructional sections.
7. Audit the entire existing application for remaining demo-only labels and simulated workflows outside the Coordinator integration, then perform keyboard, mobile, desktop and browser end-to-end checks.

## 7. Continuation audit and precise blockers (17 October 2026)

The source SQL was compared against live table columns, primary keys, FK constraints and unique constraints for curricula, placements, prerequisites, offerings, sections, meetings, instructors, rooms and academic block entities. The `ON CONFLICT` targets used by curriculum, prerequisite, offering and instructor writes have corresponding composite unique/primary constraints. Successful SQL function creation and schema compatibility are **not** evidence of successful authenticated mutation execution.

**Fixed:** The draft block creation function previously allowed an empty derived class roster and a capacity edit previously left generated child instructional section capacity unchanged. Version `20261017021106` adds transactional guards for both; existing live academic entities were not modified. Program/subject update frontend mapping now treats a zero-row result as failure instead of success. Confirmed writes whose following data refresh fails now explicitly report that the transaction persisted but the view could not be refreshed. Notification mark-read actions verify the target row, and database privileges no longer permit notification target/owner updates. The existing GUI, routes and CSS were preserved.

**Identity work implemented but gated:** `src/app/api/auth/university-id/route.js` uses the private credential configuration `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) and `AUTH_IDENTIFIER_HASH_SECRET` of at least 32 characters. Only server runtime code uses these values. Configure them locally in ignored `.env.local` and in the Vercel encrypted server-side environment, not in `NEXT_PUBLIC_` variables and never in Git or chat. The endpoint currently fails closed because none are configured in the inspected local environment. The durable throttle stores HMAC digests only. A real service-role API call and successful University ID session still need explicit acceptance testing. Rate-limit policy, account provisioning and source of University IDs must be institution approved.

**Role acceptance:** The optional read-only test harness `scripts/verify-phase3b-authenticated-matrix.mjs` checks verified Supabase sign-in, active application role mapping, scoped record reads, Coordinator student references and rejection of other roles for Coordinator writes. It deliberately requires four real approved accounts passed through secure shell/CI environment variables, does not provision identities, and performs no successful mutations. It has not passed without those accounts. Actual Coordinator write operations, client refresh and audit records, student/Registrar/Sys Admin browser behavior, room and timetable contention, roster capacity and report/export integrity remain unverified.

**Browser smoke test limitation:** `scripts/verify-phase3b-unauthenticated-browser.mjs` was added for responsive login layout and accessible required-field validation at 390, 768, 1280 and 1440 pixels. Attempts against the already running local port 3000 were **not successful**, initially due to a test locator expecting `Sign In` instead of the real `Login` button, and then because the running development page did not expose a hydrated React input within the test timeout. An already-running development server may have stale build assets after production builds. This is **an unverified environment/browser result**, not evidence the responsive pages pass or proof the login form code is defective. Restart and verify the local server before retesting; no screenshot or authenticated E2E success is claimed.

**Security advisor:** Supabase currently flags deliberately deny-by-default no-policy tables (`academic_demo.fixture_records` and `auth_identifier_rate_limits`) and 22 authenticated-executable `SECURITY DEFINER` functions, many intentionally callable only after internal role checks. This is a remaining function-by-function risk assessment, not proof of an exploit. Supabase also reports leaked-password protection is disabled in project Auth settings; enabling it needs a policy/plan check. See [Supabase security linter](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

**Official records still unchanged:** The post-deployment read returned 20 app users, 9 official student profiles, 11 enrollments, 6 curricula, 26 instructional sections, 1 academic review, zero academic history rows, zero academic planning blocks, zero program tracks, 6,530 private synthetic archive records and zero persistent identifier throttle rows. The approved fixture archive is not a populated operational catalog. Full four-role Phase 3B acceptance therefore remains **OPEN**.

## 6. Local reproduction

```powershell
npm run lint
npm run build
node scripts/verify-phase3b-public-boundaries.mjs
node scripts/verify-phase3b-anonymous-rpc.mjs
node scripts/prepare-phase3b-dev-fixtures.mjs
node scripts/prepare-phase3b-demo-archive.mjs
```

Do **not** reapply any of the seventeen tracked migrations. Their Supabase history has already been recorded. The generator's `--write` output under `supabase/seed/.phase3b-archive-batches/` is Git-ignored and can be regenerated from the tracked pristine manifest. **No Git commit or push was performed.**

## 8. Original Mock Data Migration Continuation

Complete record-by-record source, overlap, payload integrity, relationship and preview-mode analysis is in [Original Mock Data Migration Verification](phase-3b-original-mock-migration-verification.md). A protected synthetic operational copy now has **6,530 rows**, retaining every original payload and source key; **11,336 cross-record FK links** validate its relationships, along with **640 normalized curriculum subject placements** and **448 normalized prerequisite edges**. An additional **17 exact supplemental examples** (8 original enrollment cases, 2 Academic Coordinator history entries and 7 offering samples) reside in a separately tracked synthetic table. These values are not official institutional academic records.

An explicit, tab-scoped preview at `/academic-coordinator/academic-setup?dataset=synthetic` retrieves all displayed Coordinator demo catalogs, curricula, blocks, proposed rosters, meetings, report input rows and history through authenticated role-guarded Supabase RPCs. `?dataset=official` restores the original live official view and write functions. The preview is deliberately read only to prevent demonstrated fictional students, staff and grades from entering authoritative data. No layouts or styles were redesigned. ESLint, Next.js production build, source relationship audit, simulated role claims against the RPCs and 14 anonymous protected RPC denial tests passed. Real authenticated browser preview pagination, rendering and exports still need verification.

**The Phase 3B implementation remains open:** complete live default operational catalog population requires verified academic data provenance and institutional authority; demo preview is not equivalent to official CRUD. Do not represent this synthetic view as confirmed enrollment or an official academic source.
