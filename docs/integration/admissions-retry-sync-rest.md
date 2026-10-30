# Admissions REST retry synchronization

The Enrollment application does not open a connection to the Admissions Supabase database. The Admissions application owns decisions and applicant records. This branch adds a System Administrator **Retry Sync from Admissions** action, which POSTs to Admissions over HTTPS with a server-only Bearer token.

Configure these **server-only** settings in Enrollment:

```env
ADMISSIONS_RETRY_SYNC_URL=https://YOUR-ADMISSIONS-HOST/api/enrollment-retry-sync
ENROLLMENT_INTAKE_SECRET=YOUR_MATCHING_SHARED_SECRET
```

Admissions must implement `POST /api/enrollment-retry-sync` on its own server and verify the same shared secret. Its response should be `{"status":"completed","processed":1,"sent":1,"failed":0}` (or `status=partial` with a nonzero failed count).

**Important:** The Admissions endpoint cannot be deployed from Enrollment. Until the Admissions-side endpoint has been committed and deployed, the Enrollment Retry Sync button will report an upstream error.

## Intake and health checks

The existing intake is `POST /api/integration/admissions/intake`, not a webpage. It requires the same server-only Bearer secret. An authenticated GET returns JSON readiness, while an unauthenticated GET returns 401. A publicly accessible diagnostic is available at `GET /api/integration/admissions/health`; it does not inspect credentials or database readiness.

The corrected trusted intake migration generates an institutional email in the form `first.last@plp.edu.ph`, with a source-applicant reference suffix on collisions, and keeps student login inactive pending administrator provisioning.

## Mapping and authority

Known Admissions program aliases are mapped to canonical Enrollment program/track codes. Unknown programs must be reconciled explicitly. This branch deliberately does not invent a degree assignment or bypass conflicting identity checks, although additional reviewed aliases can be supplied. A student accepted by Admissions is not automatically enrolled by the Registrar.

## Deployment checks

1. Apply and review the corrected Enrollment migration against the actual Enrollment database.
2. Deploy this Enrollment feature branch to a test environment.
3. Implement the authenticated retry endpoint and System Administrator manual-accept/retry controls in Admissions.
4. Set matching server secrets and production HTTPS URLs in both deployments.
5. Test repeated idempotent handoffs, institutional email collisions, malformed payloads, program mismatch, unauthorized requests, and failures before merging into Enrollment main.
