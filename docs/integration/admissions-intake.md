# PLP Admissions to Enrollment intake

## Contract

The Admissions repository calls the configured `ENROLLMENT_INTAKE_URL` with `Authorization: Bearer <shared-secret>`. Configure the URL as:

`https://<enrollment-host>/api/integration/admissions/intake`

The Admissions code derives the program reference URL by replacing the final `/intake` segment with `/programs`:

`https://<enrollment-host>/api/integration/admissions/programs`

Both endpoints require the same server only secret in `ENROLLMENT_INTAKE_SECRET`. Keep the value out of browser code and source control. Require HTTPS in production.


## Program code mapping

Enrollment maintains an explicit, reviewable alias table named `admissions_program_code_map`. It maps known Admissions course codes to canonical Enrollment programs and, where appropriate, program tracks. Current aliases include BSED-ENG to BSED/BSEDENG, BSED-FIL to BSED/BSEDFIL, BSED-MATH to BSED/BSEDMATH, BSENT to BSBA/BSBAENT, AB Psych to BSP, and BSBA to BSBA/BSBAMM.

The authenticated `/programs` endpoint includes canonical programs, tracks, and source aliases so Admissions' existing program compatibility check can recognize its codes. For new or custom codes, include `program_name` in the handoff payload. Enrollment only uses name similarity when the best candidate clears a confidence threshold and is sufficiently separated from the next candidate. Otherwise, it rejects the handoff for review rather than assigning the wrong program. Review alias changes against the live catalog before deploying a new code.

## Supabase server keys

Enrollment uses its own Supabase URL and a server-only key belonging to that same Enrollment project. The current server client accepts `SUPABASE_SECRET_KEY` or, as a fallback, `SUPABASE_SERVICE_ROLE_KEY`. Prefer a server-only secret key where available. Do not expose either value to browser code.

Admissions separately uses its own database credentials and Supabase key in the Admissions deployment. Do not copy the Admissions key into Enrollment. Admissions sends HTTPS requests to the Enrollment API; it does not need the Enrollment Supabase key.

## Applicant eligibility and payload

The Admissions handoff is triggered after an accepted applicant confirms enrollment intent. The existing Admissions code sends these fields:

* `applicant_ref`: stable reference such as `ADM-2026-000123`
* `full_name`
* `email`
* `program_code`: approved degree program or track code
* `admission_date`: released decision date in `YYYY-MM-DD` format
* `admission_type`: `new` or `transferee`
* `source_name`: `PLP Admissions`

Foreign applicant types currently require manual review because the Enrollment student type model does not have an approved foreign student type.

## Data and authority boundaries

The service only creates or reuses an institutional `app_users` and `student_profiles` identity, the admission handoff reference, and technical integration/audit records. New application accounts start `Inactive`, with `login_enabled = false` and no Auth UUID. It does not create Supabase Auth identities, activate student login, assign transferee year level, or confirm enrollment.

The System Administrator then uses Users & Access to provision the Auth account. Provisioning must persist the Auth UUID on the existing application user and only enable access according to the selected account state. The Registrar remains the authority for official enrollment confirmation.

## Deployment and verification

1. Configure `ENROLLMENT_INTAKE_SECRET` in the protected Enrollment server environment and the matching outbound secret in Admissions.
2. Review and apply `supabase/migrations/20261027000000_trusted_admissions_intake.sql` to the intended Enrollment test database before enabling the endpoint.
3. Confirm the SQL function is executable only by `service_role`. Do not expose the secret or privileged Supabase key to the browser.
4. Test an accepted freshman, an accepted transferee, a duplicate retry, an unknown program, a malformed payload, an incorrect secret, and an email conflict.
5. Verify the student record appears in System Administrator > Users & Access as unlinked and inactive before manually provisioning Auth.
6. Confirm repeated handoffs reuse the same student number and do not create duplicate records.

The migration is committed as source only. It has not been applied to a Supabase database by this change.