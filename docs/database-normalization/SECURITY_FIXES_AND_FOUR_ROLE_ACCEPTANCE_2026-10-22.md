# PLP Phase 9: Three Priority Security Tasks

**Date:** 22 October 2026
**Supabase project:** iwuphtvlcszziyvqcbsl
**Web project:** plp-enrollment-system.vercel.app

## 1. P0 Enrollment Status: fixed in live PostgreSQL

Installed guarded migrations:

* `20261022043600_enrollment_transition_actor_security.sql`
* `20261022045200_enrollment_confirmation_registrar_only.sql`

The old postgres-owned SECURITY DEFINER trigger allowed bypassing
`enrollment_status_transitions` using `current_user`. Its replacement uses
signed request identity and the canonical role lookup. The follow-up limits
technical service and SQL maintenance sessions to explicitly defined SYSTEM
transitions. Only a signed active Registrar may change VALIDATED to CONFIRMED.

**Live rollback-only DML tests passed:**

* Prior to repair an authenticated Registrar could improperly take
  FOR_VALIDATION directly to CONFIRMED; this was reproduced and rolled back.
* After repair the same shortcut raises PostgreSQL SQLSTATE 42501.
* Legitimate Registrar FOR_VALIDATION to VALIDATED and VALIDATED to CONFIRMED
  both succeed under the matching role context.
* Student, Academic Coordinator and System Administrator direct confirmation
  attempts each affected zero rows under RLS.
* A privileged service-role direct confirmation was reproduced before the
  follow-up, then denied after the follow-up.
* A legitimate SYSTEM transition IN_PROGRESS to NEEDS_ACADEMIC_REVIEW
  continues to succeed.

No enrollment records were changed by these transaction tests.

## 2. P1 Student Profile: fixed in live PostgreSQL

Installed guarded migration:

* `20261022044000_student_profile_contact_only_security.sql`

The existing BEFORE UPDATE trigger now compares every current and future
column except contact_number, address, emergency_contact_name,
emergency_contact_number and server-managed updated_at. A Student cannot
change identity, status, academic/progression attributes, project provenance
or institutional verification through a profile UPDATE.

**Live rollback-only DML tests passed:**

* Ordinary Student update of own contact field permitted.
* Student attempts to change institutional_verified_at, student_number and
  created_at rejected with SQLSTATE 42501.
* Cross-student profile UPDATE affected zero rows under RLS.
* Registrar-authorized contact correction remains permitted.

## 3. Four Role Security: production backend deployed; real JWT acceptance pending

The previously prepared legacy Student route guard was committed **only**
with its helper and test, without including the repository's unrelated dirty
files. Scoped commit: `d2efeede5447838d552946c1be7e200ec0a8c592`.

The project branch `deployment-review-20261020` produced a READY Vercel
preview. The same reviewed SHA produced READY Vercel production deployment
`dpl_3yYb1Rmvguku5JKRtPP5CmrVxUvQ`, with the
`plp-enrollment-system.vercel.app` alias assigned successfully.

The trusted Student portal server now rejects a legacy Student who has been
disabled or unlinked even if an old Auth session remains technically valid.
No user-facing GUI design was changed.

**Verified:**

* Auth role-context SELECT simulations for Student, Registrar,
  Academic Coordinator and System Administrator under actual live RLS.
* Student can read one own Student Profile and no other student's profile.
  Admin and Coordinator cannot read private Student Profiles.
* Registrar reads permitted Student, enrollment and academic records.
* System Administrator cannot read enrollment or academic results records.
* `system.users_manage` permission is true for System Administrator only.
* Direct client access to per-account approval records is not granted.
* Rollback-only negative DML rejects non-Registrar final confirmation and
  other Student's profile modification.
* Unauthenticated production requests to four dashboard routes redirect to
  sign-in. One Next.js streamed response returns HTTP 200 but includes the
  `NEXT_REDIRECT` control, so HTTP status alone is not a sufficient test.
* Focused source tests, lint and local Next.js production build passed.
* Complete local regression suites: **68 application/security tests plus
  56 project-auth tests, 124 passed and zero failed**, after fixing a test
  assertion that had also matched an explanatory migration preflight comment.
* Postflight reports 45 applied migrations, 600 active PROJECT_ONLY
  identities, 600 consumed individual approvals, 2,128 original planning
  records intact and four existing CONFIRMED enrollment rows unchanged.

**Still required to call Task 3 fully accepted:**

Four actual sign-ins using *real signed Supabase Auth JWTs* for the existing
ordinary Student, Registrar, Academic Coordinator and System Administrator,
plus protected browser-route acceptance. SQL Editor role-context simulation
does **not** validate signed JWT authenticity or real client cookies.

A safe, read-only supervised tool is prepared:

```powershell
node scripts/database-normalization/verify-four-role-live-logins.cjs --interactive
```

It privately prompts for credentials for the four existing accounts, checks
Auth.getUser, own application identity, effective RLS data visibility,
cross-student isolation and administrator permission, and then locally signs
out. It never outputs or persists passwords/tokens, sends email, changes
student data, or rotates any of the 599 deferred passwords.

## Live preservation postflight

* 600 PROJECT_ONLY Auth/application/student links remain ACTIVE.
* 600 individual activation approvals remain CONSUMED.
* 604 Auth identities total, including the four preexisting role accounts.
* Original 2,128 synthetic planning app accounts remain Inactive/unlinked.
* Existing 4 CONFIRMED enrollments preserved.
* No PROJECT_ONLY profile institutionally verified.
* Only the original pilot has completed first login password rotation;
  remaining 599 remain subject to that requirement on first login.

**Scope stop:** No further Phase 8 academic changes, database normalization,
schema cleanup or GUI workflow redesign was started in this continuation.

## Step 4 final four-role acceptance, 22 October 2026

**STATUS: PASSED for the agreed four-role security acceptance scope.**

The project operator completed the supervised genuine signed-in Supabase
Auth/JWT checks for the four **existing** application role accounts. The
terminal reported a separate `PASS` for Student, Registrar, Academic
Coordinator and System Administrator, followed by
`PASS: Four real role sign-ins and read-only authorization checks.`
The script checked signed Auth identity, matching application identity,
Active/login-enabled account state, the intended effective RLS data view,
cross-student Student Profile isolation and technical-admin permission
separation. Sensitive passwords and tokens were neither reported nor stored.

The operator also supplied four screenshots of successful deployed
role-specific dashboards, and explicitly reported manual tests where each
role was redirected away from another role's dashboard. **The screenshots
independently substantiate successful access to each role's own dashboard;
the cross-role denial outcomes are recorded as operator-observed because
separate denial/redirect screenshots were not supplied.**

Other prior verification evidence retained:

* Live rollback-only SQL positive/negative enforcement of Registrar-only
  enrollment confirmation, non-Registrar denial and service-only SYSTEM
  transitions.
* Student-only contact edits, denied identity/verification edits, denied
  cross-student profile UPDATE and allowed Registrar profile correction.
* Hosted anonymous route protection and production backend account-state fix.
* Focused tests rerun during final status review: 22 passed, 0 failed;
  `git diff --check` passed. The earlier whole-project suite passed
  124/124 and production Next.js build passed.

**Acceptance boundary:** This closes Step 4's agreed role/dashboard/RLS
acceptance checks, not exhaustive penetration testing of every future API
endpoint and academic workflow. The deployed dashboard figures may still
include demonstration/mock data; production database integration and
normalization remain separate later tasks. The 600 PROJECT_ONLY accounts
remain enabled, with 599 individual first-login password changes deferred
by user decision. This security acceptance did not authorize deletion of
the original 2,128 synthetic planning accounts.

**Next authorized stage:** Resume the approved ERD's remaining PostgreSQL
Normalization and Schema Cleanup, followed by outstanding Phase 8 and
Phase 9 source-dependent corrections. No GUI redesign is included.
