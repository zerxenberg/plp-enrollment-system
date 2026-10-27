# PLP Admissions to Enrollment intake

## Contract

The Admissions repository calls the configured `ENROLLMENT_INTAKE_URL` with `Authorization: Bearer <shared-secret>`. Configure the URL as:

`https://<enrollment-host>/api/integration/admissions/intake`

The Admissions code derives the program reference URL by replacing the final `/intake` segment with `/programs`:

`https://<enrollment-host>/api/integration/admissions/programs`

Both endpoints require the same server only secret in `ENROLLMENT_INTAKE_SECRET`. Keep the value out of browser code and source control. Require HTTPS in production.

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