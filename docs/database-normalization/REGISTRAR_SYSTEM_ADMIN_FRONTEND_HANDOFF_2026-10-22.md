# Registrar and System Administrator Frontend Handoff

**Date:** 2026-10-22  
**Purpose:** Coordinate a two-developer PLP Enrollment System implementation against the **existing** normalized Supabase project.  
**Current assignment:** One developer owns Student and Academic Coordinator. The groupmate owns **Registrar and System Administrator frontend simplification only**. Database integration remains with the first developer in a later stage.

## Read this first

1. `docs/database-normalization/PHASE8_FICTIONAL_ACADEMIC_DATA_FINAL_2026-10-22.md` is the latest Phase 8 completion snapshot. It describes the 600 PROJECT_ONLY academic placements, 61 project blocks, 732 five-day class meetings, and the simulated enrollment backend.
2. `docs/database-normalization/SECURITY_FIXES_AND_FOUR_ROLE_ACCEPTANCE_2026-10-22.md` summarizes the later security corrections and remaining signed-user acceptance work.
3. `docs/database-normalization/FINAL_PHASE0_9_FOUR_ROLE_NORMALIZATION_REPORT_2026-10-22.md` contains useful schema and role detail, **but its earlier release-blocker findings are a historical audit snapshot**. Consult the later security-fixes report for corrections deployed afterward. Do not treat earlier counts as the latest database counts.

The database already exists and has live records. **Do not replay schema migrations, re-seed students or re-create accounts when pulling this branch.** SQL under `supabase/migrations/` is versioned reference source, not a command to execute automatically against the existing live project. An older local initial-password rotation migration (`20261020074600`) has previously been reported as diverging from the installed function body; verify installed SQL before ever attempting a replay or fresh database bootstrap.

## Frontend responsibilities for the groupmate

**Registrar**: Simplify and improve existing Students, Enrollment, Academic Scheduling, Reports and Monitoring interfaces, preserving working route navigation, form controls, validation/error states, and the existing Registrar role boundary. The UI should be ready to accept server-provided students, academic snapshots, validation queues and COR data in the next phase. Do not show an official enrollment confirmation for project records.

**System Administrator**: Simplify existing Users and Access, Audit Monitoring, System Administration and related interfaces. Keep user activation and role management distinct from Registrar academic approval or enrollment confirmation.

Relevant UI files and pages:

* `src/components/registrar/`
* `src/components/system-administrator/`
* `src/app/(portal)/registrar/`
* `src/app/(portal)/system-administrator/`

Keep existing component props, server boundaries and route entrypoints compatible when possible. Use explicit loading, empty and error states. If a feature has no connected backend yet, mark it as not connected rather than showing a fake success. Avoid embedding private student data or credential-bearing JSON fixtures in the browser bundle.

## Existing backend integration contracts for the later stage

* `src/lib/supabase/server.js`: authenticated Supabase server client.
* `src/lib/auth/require-role.js`: trusted role and account-status check.
* `src/features/academic/project-phase8-actions.js`: role-scoped snapshot and roster readers; project-only Student OPEN/SUBMIT, Registrar VALIDATE/RETURN/CONFIRM, demonstration COR.
* `src/features/grade-import/registrar-grade-actions.js`: protected official Registrar grade workflow, **not** interchangeable with fictional academic history.
* `src/features/students/official-enrollment-actions.js`: separate official enrollment controls. Project enrollment simulation must not call these to confirm a fictional student's registration.
* `src/features/system-administration/system-admin-actions.js` and `system-admin-queries.js`: existing protected account management and account listing functions.

The project-only source uses DRAFT fictional curricula and PROPOSED student home blocks. Timetables marked `READY_PROJECT` are suitable for project simulation, not university publication. Current-term official `enrollments`, grades and admission approvals must stay separate. A printable COR based on the simulated lifecycle must be explicitly labeled **demonstration / nonofficial**.

## Security, collaboration and testing boundaries

* Keep Student, Registrar, Academic Coordinator and System Administrator authorization separate. Never remove `requireRole`, first-login password rotation, backend RLS or immutable PROJECT_ONLY identity guards.
* The other developer manages the existing Supabase production database, deployment secrets and future backend integration. The groupmate does not need production service keys or direct database writes for frontend-only work.
* Work on a dedicated Git branch (suggested `feature/registrar-admin-frontend`). Submit a pull request for review, instead of pushing unfinished UI directly to production `main`.
* Do not commit `.env.local`, credential handoffs/vaults, bulk student snapshots, locally generated schedule manifests or login email alias exports.
* Validate route navigation and React components; run `npm run build` before pull request. Genuine authenticated Student-to-Registrar simulation and printable COR still require a separate controlled acceptance run.

**Shared scope:** Only the two portal frontends are the groupmate's immediate assignment. Normalized database integration, authenticated runtime testing, and deployment are coordinated later, not assumed completed by a visual frontend update.
