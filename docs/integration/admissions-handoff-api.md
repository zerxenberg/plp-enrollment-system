# PLP Admissions → Enrollment Handoff API

## Endpoint

The custom Enrollment API is implemented at:

`POST /api/integration/admissions/handoff`

Health check:

`GET /api/integration/admissions/handoff`

Source files:
- `src/app/api/integration/admissions/handoff/route.js`
- `src/features/integration/admissions-handoff-policy.mjs`
- `src/features/integration/admissions-handoff-server.js`

Trusted provisioning migration:
- `supabase/migrations/20261024030100_admissions_student_handoff_api.sql`

## Authentication

Admissions sends:

`X-PLP-Admissions-Key: <server-secret>`

Enrollment must define server-only environment variable:

`PLP_ADMISSIONS_API_KEY`

Use a random secret of at least 32 characters. Never expose it with a `NEXT_PUBLIC_*` variable.

## Eligible handoff

The API provisions only when:
- `overall_status = released`
- `admission_result = accepted`
- `enrollment_intent = confirmed`

Foreign applicants and unknown programs return **Requires Review** instead of being guessed.

## Example payload

```json
{
  "applicant_id": 123,
  "user_id": 456,
  "school_year": "2026-2027",
  "applicant_type": "freshman",
  "overall_status": "released",
  "admission_result": "accepted",
  "enrollment_intent": "confirmed",
  "released_at": "2026-10-24T01:00:00+08:00",
  "first_name": "Juan",
  "middle_name": "Santos",
  "last_name": "Dela Cruz",
  "email": "juan@example.edu.ph",
  "phone": "09171234567",
  "address": "Pasig City",
  "course_applied": "BS Information Technology"
}
```

## Enrollment normalization

An initial successful handoff creates an institutional, non-synthetic Enrollment identity:
- preprovisioned `app_users` Student account, initially Inactive and without Auth UUID
- `student_profiles` with generated `26-xxxxx` number and `ADMITTED` status
- completed `admission_handoffs`
- `user_login_identifiers`
- `integration_requests` and `synchronization_events`

The API does **not** create Supabase Auth. System Administrator uses the existing Provision Auth workflow, and the existing Enrollment Auth-link trigger links the confirmed Auth identity.

Handoffs are idempotent by `ADMISSIONS:<school-year>:<applicant-id>`.

For this project, accepted programs map to the corresponding Curriculum Project 2026 / P8F26 curriculum, while the imported person remains an institutional student:
- `is_synthetic_demo = false`
- not `PROJECT_ONLY`
- no project cohort

Freshmen receive Year 1 preparation. Transferees stay ADMITTED until authorized transfer evaluation and year placement are complete.

The API never assigns Phase 8 synthetic class sections to official enrollment. Official subject selection still uses the existing non-synthetic offering/finalized-section enrollment RPC rules.

## Deployment/testing

1. Review and test this feature branch.
2. Apply the included migration in the intended test/deployment Enrollment database.
3. Configure `PLP_ADMISSIONS_API_KEY` in Enrollment.
4. Deploy Enrollment.
5. Configure Admissions server-side code to POST eligible handoffs.
6. Verify the GET health endpoint with the same secret.
7. Send one accepted/confirmed applicant and check System Integration, app user, student profile and Admission handoff.
8. System Administrator provisions Auth and activates the account.
9. Student signs in and verifies the institutional Student Portal.

No migration in this branch is automatically applied to production.
