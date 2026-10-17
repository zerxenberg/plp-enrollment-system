# Phase 3A | Approval Review Package

**Prepared:** 17 October 2026  
**Status:** REVISED PHASE 3A PROPOSAL READY FOR REVIEW AFTER SOURCE DOCUMENT VERIFICATION. PHASE 3B NOT AUTHORIZED.

## Read these deliverables in order

1. [Revised Schema Finalization Proposal and ERD](phase-3a-schema-finalization-proposal.md) contains confirmed simplified screen specifications, source-versus-target comparison, normalized PostgreSQL table proposals, block/subject section design, unresolved Registrar-confirmed block attribution, academic integrity, reporting, migration gates, risk register and approval decisions.
2. [Source Document Verification and Revision Log](phase-3a-source-document-verification.md) records the latest simplified edition 2.0 and supporting files, source authority, exact module/table requirements, corrections to the original proposal, and unresolved institutional decisions.
3. [Existing Supabase Schema Inventory](phase-3a-existing-schema-inventory.md) records all 46 existing tables, their counts, disposition, existing FK and constraint implications, and previously rechecked Phase 2 findings.
4. [Frontend Mock Inventory and Field Mapping](phase-3a-frontend-mock-mapping.md) contains the code origin and exact code-default counts, field-level mapping across every simplified Academic Coordinator module, handling of derived properties, proposed/final distinction, CRUD and query dependencies, and safe seed classification.
5. [Complete Pristine Fixture Manifest](phase-3a-fixture-manifest.json) contains all original generator-derived mock record values and IDs across academic catalog, 16 current curricula and block planning arrays. **Synthetic-only source evidence**, not a seed script or official academic data. Its source data SHA-256 is `579d74f572f45ab77989ddb3f706ff054ec82b60e59c8de88b1e6f437cd94f8c`.
6. [Additional Academic Coordinator Initial State](phase-3a-coordinator-initial-state-extras.json) contains the one legacy illustrative curriculum, seven initial offerings, two hardcoded demonstration history records and empty prerequisiteRules array from the provider; also not official data.
7. [Four Role Auth and RLS Security Blueprint](phase-3a-cross-role-security-review.md) contains the table-level primary owner/reader/writer matrix, trusted ID/email login model, earlier Supabase advisors, RLS and grant decisions, negative permission tests, and official grade import authority.
8. [Original Phase 2 Database Audit](academic-coordinator-database-audit.md) is the starting historical review evidence. It remains a preexisting, independently uncommitted repository document.

## Mandatory deliverable coverage

| User-requested Phase 3A deliverable | Location |
|---|---|
| Existing Academic Coordinator database audit review | Existing Schema Inventory §1 through §3, Schema Proposal §1 and §7; original audit |
| Verification of **latest simplified GUI and supporting planning documents** | Source Document Verification §1 through §4; revised Schema Proposal §1.2 and §7 |
| All mock datasets, complete code-default records, precise source counts | Frontend Mapping §1 and source JSON manifests |
| Field-by-field frontend to PostgreSQL mapping matrix | Frontend Mapping §2 and §3 |
| Final proposed PostgreSQL table structures, types, keys, constraints and indexing | Schema Proposal §3 and §5 |
| Updated Academic Coordinator plus cross-role ERD with relationships | Schema Proposal §2 |
| Current-versus-proposed table disposition, migration sequence and data integrity risks | Schema Proposal §1, §7 and §8 |
| GUI block versus subject section architecture | Schema Proposal §3.2 and §4 |
| Four-role Auth, authorization and RLS proposal | Security Review §1 through §7 |
| Safe seed and migration verification plan | Frontend Mapping §4; Schema Proposal §8 |
| Open risks and required explicit user approvals | Schema Proposal §9 and Security Review §8 |

## Directly verified evidence and limits

- Queried the connected Supabase PostgreSQL catalog **read-only**: 46 public tables, all RLS enabled, and zero migrations in the connected Supabase migration history.
- The following current integrity findings reproduce the prior audit: 5 null curriculum statuses, 5 empty curricula, 10 subject sections without matching term+subject offerings, 4 repeated term+section-label groups, 0 recorded `academic_change_history` events.
- Only 1 of 20 `app_users` entries has `auth_user_id` linked, so full production authentication is not operationally verified.
- Existing privileged function exposure and search-path warnings are documented in the security review. They are planned review tasks, not remediation performed.
- Complete pristine mock default generation was evaluated from the current repository: 11 reference programs, 403 subject catalog entries, 16 curricula, 640 curriculum placements, 448 prerequisite edges; 136 blocks, 2,128 synthetic students, 2,128 proposed assignments, 680 subject classes, 342 meetings, 136 synthetic professors, 75 synthetic rooms.
- Both JSON files parse successfully. The primary manifest's record hash matched its embedded SHA-256. Its unique ID and all block, proposed assignment, class and meeting link checks passed; 0 fixture reference errors detected for those relations. These fixture checks do not establish official university data quality, database capacity feasibility, full curricular prerequisite validity or authenticated role security.
- **Source gap resolved:** The latest `Simplified Academic Coordinator - User Role GUI Workflow Functionalities.docx` was received and reviewed in full, edition 2.0 reflecting updates through 15 October 2026. Its author explicitly discloses that frontend source line verification was not performed when the DOCX was written. The source text is used for GUI/workflow authority, and current repository components are separately used for implementation evidence.
- Supporting readable planning attachments were reviewed: `Main Workflows.docx`, `Enrollment Process.docx`, `Development Naming Conventions.docx`, `Project Folder Structure.docx`, `Unified Student Portal Workflow.docx`, `Final Student Portal Authority.docx`, and the final three other user-role GUI documents, along with the status, validation, ERD and proposed grade import references. See the source verification report for detailed applicability.
- This source review did not requery the live Supabase project. Prior 46-table/count/security observations remain dated observations from the earlier review and must be refreshed before Phase 3B. No unverified institutional policy values were added.
- **No remote data mutation was made.** No SQL migrations, live authentication changes, RLS edits, imports, Git commit or Git push were executed. Preexisting modifications to `.gitignore`, `package.json`, `package-lock.json`, `src/app/api/`, `src/lib/supabase/` and the preexisting untracked audit were preserved. All Phase 3A files are additive `docs/phase-3a-*` artifacts.

## Approval checkpoint

**Requested approval:** the updated target and the decisions in [Schema Proposal §9](phase-3a-schema-finalization-proposal.md), particularly **block identity scope**, **confirmed block attribution for shared/irregular sections**, schedule publication authority, curriculum version lifecycle, source-data reconciliation, four-role security read scopes and the approved development/backup gate. Approval of a proposal **does not** imply permission to publish fictional university grades, approve exceptions on behalf of real staff, or delete historical records.

**Next step only after explicit approval:** implement Phase 3B version-controlled migrations in a verified development environment, Supabase Auth account linking, hardened four-role RLS, controlled seeds and database/security test evidence. Frontend data fetching and removal of mocks from rendering remain Phase 4.
