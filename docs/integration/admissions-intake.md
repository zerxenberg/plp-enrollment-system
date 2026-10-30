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

The trusted Admissions service records `admission_status = ACCEPTED` after an accepted applicant confirms enrollment intent and the handoff succeeds. On 30 October 2026, the live Enrollment `student_open_enrollment_v1` function was corrected through a controlled direct SQL transaction to recognize either a legacy `COMPLETED` handoff or an `ACCEPTED` handoff with `source_name = PLP Admissions` and `synchronization_status = Successful`. This preserves source records and does not itself activate a student or satisfy term, curriculum, or Registrar confirmation requirements. Other environments must verify their function definition and authorization before using the same narrowly scoped completion rule.

## Optional automatic student Auth invitations (local review feature)

**Disabled by default.** The Enrollment server checks `ADMISSIONS_AUTO_PROVISION_ENABLED=true` together with a valid `ADMISSIONS_INVITE_REDIRECT_URL` ending exactly in `/activate-student-account` (HTTPS outside localhost). Setting these values to enable invites authorizes actual outbound Supabase Auth invitation emails: configure the intended Auth project, SMTP and redirect URL allowlist first. Never put this setting or a Supabase secret key in `NEXT_PUBLIC_*` variables.

When a trusted accepted and confirmed Admissions intake completes both SQL RPCs, Enrollment verifies the handoff, non-synthetic ADMITTED student, existing unchanged `PLP_ADMISSIONS:` application identity and the personal email stored in `admissions_student_source_details`. The generated `@plp.edu.ph` institutional address is **not** treated as a confirmed deliverable inbox. The same application user receives a Supabase Auth invitation at the applicant's personal email, with no duplicate student record. Invitation and account linking do **not** activate the account. Its existing `Inactive` / `login_enabled=false` access remains unchanged.

The recipient clicks the email invitation link; after Supabase verifies the email and establishes their own Auth session, the public `/activate-student-account` page lets them choose a secure password. The server independently verifies the authenticated Auth UUID, confirmed email, exact personal recipient, student type, successful handoff, and current inactive access before enabling login. Academic/Registrar enrollment confirmation is separate. Students may sign in using their verified personal Auth email or University ID; school email remains recorded as an institutional address.

Set the Supabase Auth project's Site URL and Allowed Redirect URLs to include the exact `ADMISSIONS_INVITE_REDIRECT_URL`. In development, this is normally `http://localhost:3000/activate-student-account`; production requires a real HTTPS hostname. Configure the **Invite user** email template and a working SMTP provider before enabling invitations. Supabase-hosted email may be rate-limited. Invitation links can expire; administrators must handle a safe re-invite if necessary.

For applicants transferred **before** enabling this setting, System Administrator → System Integration → **Send Pending Student Invitations** processes up to 50 recent successful accepted handoffs without resending to already linked accounts. A Supabase Auth email collision, undeliverable mailbox, missing personal email, partial invitation/link failure, or identity mismatch needs administrative review. The existing **Create User Account → Existing Application User** manual recovery remains available. Never press **Manually Accept and Transfer** just to create Auth accounts.

This review implementation makes no email sends, Auth user creation or live application record changes until the feature is explicitly enabled and an actual intake or an authorized administrator's reconciliation runs. Automated unit tests use mocked clients; end-to-end email receipt, redirect, password setup, resend and first-login tests require a dedicated test tenant and deliverable mailboxes.

The System Administrator then uses Users & Access to provision the Auth account. Provisioning must persist the Auth UUID on the existing application user and only enable access according to the selected account state. The Registrar remains the authority for official enrollment confirmation.

## Deployment and verification

1. Configure `ENROLLMENT_INTAKE_SECRET` in the protected Enrollment server environment and the matching outbound secret in Admissions.
2. Review and apply `supabase/migrations/20261027000000_trusted_admissions_intake.sql` to the intended Enrollment test database before enabling the endpoint.
3. Confirm the SQL function is executable only by `service_role`. Do not expose the secret or privileged Supabase key to the browser.
4. Test an accepted freshman, an accepted transferee, a duplicate retry, an unknown program, a malformed payload, an incorrect secret, and an email conflict.
5. Verify the student record appears in System Administrator > Users & Access as unlinked and inactive before manually provisioning Auth.
6. Confirm repeated handoffs reuse the same student number and do not create duplicate records.

The current connected Enrollment database already contains the trusted intake and profile enrichment functions. Verify every destination environment independently before enabling Admissions intake there.
