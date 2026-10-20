---
name: plp-data-security
description: Apply PLP specific Supabase, PostgreSQL, authentication, authorization, Row Level Security, entity ownership, audit logging, data integrity, and server validation rules.
---

# PLP Data Security

Use this skill for database schema work, Supabase Auth, Row Level Security, server actions or APIs, permissions, sensitive data access, migrations, audit logging, and security sensitive enrollment operations.

This skill adds PLP specific ownership rules. Use the global security and SQL skills for generic review.

## Data model principles

Use PostgreSQL through Supabase. Prefer UUID style primary keys for major entities. Use lowercase snake case plural table names and lowercase snake case columns.

Keep canonical statuses in controlled constants, checks, lookup definitions, or equivalent constrained fields. Do not scatter freeform workflow strings across pages or queries.

Preserve referential integrity among all core account, student, academic, enrollment, review, notification, audit, and integration records.

## Primary write authority

System Administrator owns accounts, roles, permissions, and technical configuration, but not academic or enrollment business values.

Registrar owns authorized Student record corrections and official enrollment processing and confirmation.

Academic Coordinator owns academic master data, offerings, sections, schedules, prerequisites, and Academic Review decisions.

Student may create and modify only the student's own allowed enrollment choices before workflow locks apply, plus allowed self service profile fields.

Subject results are read only support data from an authoritative academic source or approved import process.

Admission records preserve read only handoff data. Enrollment must not rewrite the Admission decision.

## Authentication and authorization

School-project release policy: Focus database activation readiness on existing PLP tables, project-created tables, their verified `postgres` ownership, current client grants and RLS. Do not make unrelated platform-managed owners' future default privileges a prerequisite for PROJECT_ONLY activation. Preserve role separation, server-side authorization, audit, proper no-email account activation and immutable official academic records. The active decision is documented in `docs/database-normalization/project-auth-deployment/PROJECT_SCOPE_POLICY_CURRENT.md`.

Use Supabase Auth or the project's trusted authentication authority. Link application users through a stable identity.

Preserve one permanent student identity. Do not create a second Enrollment account after Admission.

Enforce role and record ownership on the server or database boundary. Client side route checks, hidden buttons, and disabled controls are user experience features, not security controls.

Never expose the Supabase service role key or other privileged secrets to browser code. Public browser configuration may use only values intended for client exposure.

## Row Level Security implementation standard

Enable RLS on protected student, enrollment, academic review, notification, account, and operational tables unless a deliberate server only design provides an equally strong boundary.

Derive policies from authenticated identity, mapped role, record ownership, and finalized entity authority. Prefer small explicit policies over broad role wide access.

Students may read their own permitted records. Restrict writes to allowed self service fields and editable enrollment states.

Registrar access covers records required for official enrollment operations without granting other role authority.

Academic Coordinator access covers academic setup plus the minimum context required for Academic Review.

System Administrator access covers accounts and technical records without business authority over academic or enrollment values.

Privileged server operations must recheck authorization even when invoked from an already protected page.

## Transaction and integrity rules

Use database constraints for uniqueness, required foreign keys, valid relationship scope, and duplicate protection.

Enrollment confirmation must be atomic. Recheck status, unresolved review state, section capacity, and critical conditions immediately before commit.

Confirmed enrollment records must not be silently deleted or overwritten. Use authorized traceable correction workflows and preserve history.

Admission synchronization must be idempotent. Repeated applicant references must reuse or safely update the linked identity instead of creating another Student. Stop unresolved duplicate identity cases for resolution.

## Validation and errors

Never rely only on client side validation for enrollment, authorization, role changes, academic decisions, confirmation, or integration writes.

Return safe errors without leaking secrets, SQL details, tokens, or sensitive data. Distinguish validation, permission, conflict, and unexpected server failures.

## Audit requirements

Create append oriented audit records for important status changes, authorized corrections, academic decisions, final confirmation, permission changes, privileged account actions, and Admission integration events.

Record actor identity when available, actor role, module or action, affected record, result, and timestamp. Include reason and prior or new state when the business action requires traceability.
