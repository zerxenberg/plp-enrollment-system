# Phase 3A | Source Document Verification and Proposal Revision Log

**Review date:** 17 October 2026  
**Decision status:** Evidence review completed for planning; Phase 3B remains awaiting explicit approval.  
**Scope:** Review of the latest Academic Coordinator simplified GUI workflow against the Phase 3A schema, existing repository, and relevant project planning standards. These references are design sources and do not certify real PLP institutional policies or the live database state.

## 1. Source availability, authority and precedence

The following DOCX files were read directly from the project source attachments for this verification. In particular, **`Simplified Academic Coordinator - User Role GUI Workflow Functionalities.docx` is now accessible**, edition **2.0**, reflecting changes through **15 October 2026**. This resolves the missing-source limitation recorded in the first Phase 3A review. That document explicitly states its author's source-code line verification was unavailable when drafted, so the current repository remains the evidence for implementation details.

| Source document | Reviewed focus | How it governs this proposal |
|---|---|---|
| **Simplified Academic Coordinator - User Role GUI Workflow Functionalities.docx**, edition 2.0, pages 1 to 21 | Final five sidebar modules, simplified tabs, forms and table columns, block rosters, scheduling, scoped reviews, reports, audit and workflow handoffs | **Primary current Academic Coordinator workflow**; supersedes the older expanded navigation and separate Offering/Capacity/Prerequisite tabs |
| **Registrar - User Role GUI Workflow Functionalities.docx** | Official student record correction, enrollment processing, final confirmation, term authority | Prevent Coordinator proposals from changing official enrollment |
| **Student - User Role GUI Workflow Functionalities.docx** | One permanent student account, individual subject eligibility, own section choice and confirmed schedule | Preserve curriculum versions and prevent proposed blocks from becoming confirmed student schedules |
| **System Administrator - User Role GUI Workflow Functionalities.docx** | Technical account/role/security/integration authority | Separate technical administration from curriculum and Registrar business decisions |
| **Canonical Status and Workflow Dictionary.docx** | Uppercase machine codes, distinct student, enrollment, section, review and account statuses | Machine status must be distinct from display labels; do not invent universal status |
| **Academic Rules and Validation Matrix.docx** | AR01 to AR34 including version preservation, prerequisite exceptions, unit rules, capacity and confirmation | Trusted backend constraints and required error paths; exact numeric PLP policy remains unconfirmed |
| **Basic Database Entities and ERD Lite.docx** | Conceptual table/ERD catalog and ownership | Compare conceptual names with 46 actual public tables; preserve live stable keys |
| **Main Workflows.docx** | WF01 through WF14 and cross-role handoffs | Review queue to Registrar validation; no Coordinator confirmation |
| **Enrollment Process.docx** | Eligibility to Student submission, review, validation and Registrar confirmation | The only official confirmation path remains Registrar final confirmation |
| **Final Student Portal Authority.docx** | External Admission ownership, accepted record handoff and one permanent identity | Never recreate Admission decisions or a second account |
| **Unified Student Portal Workflow.docx** | Student lifecycle, irregular progression and academic deficiencies | Read with later Student GUI as implementation authority |
| **Development Naming Conventions.docx** | Lowercase snake case tables/columns, upper snake case codes, stable role and route names | Use current database names, map conceptual aliases rather than rename existing tables |
| **Project Folder Structure.docx** | One JavaScript Next.js App Router app, four protected role areas, Supabase migration folders | Phase 3B versioned database changes only after approval; no new application |
| **Official Student Grades Import Workflow Functionalities - Registrar.docx**, v1.0 | Proposed verified Registrar batch import and published result provenance | Separate proposed extension from finalized core; no automatic schema expansion without its own approval |

**Precedence:** For the revised Coordinator pages, edition 2.0 explicitly gives the latest confirmed simplification and implementation reports priority over older Coordinator module descriptions (page 21). Elsewhere use finalized four-role GUI documents, the newer Student GUI when interpreting Unified Student Portal, and the canonical project planning standards. Technical details asserted as actual database facts must come from the live catalog/audit, not conceptual planning diagrams. Source documents that label a future process as **proposed** or **institutional confirmation needed** must remain conditional in the schema.

## 2. Verified simplified Coordinator contract

| Current screen | Official visible structure and actions | Normalized data and effect on final schema |
|---|---|---|
| Dashboard (pages 2 to 3) | One overview with setup counts, **read-only current term**, sections/capacity, pending reviews and recent academic events; cards route to existing pages | Derived read-only projections; Registrar controls enrollment term dates |
| Academic Setup > Programs (pages 5 to 6) | Code, name, college/department, status, linked curriculum; add/view/edit and permitted activate/deactivate, modal dialogs | Preserve `programs`, `organizational_units` and linked version FKs; use approved college/track reference values; do not duplicate a Courses master |
| Academic Setup > Subjects (pages 6 to 7) | Subject code/name, units, program/curriculum context, prerequisite indicator, status; manage prerequisites in this view | Reuse one `subjects` master plus version-aware `curriculum_subjects` and `subject_prerequisites`; no standalone Prerequisites module |
| Academic Setup > Curriculum (pages 7 to 8) | **Eight columns:** Curriculum Version, Program Information, Effective Academic Year, Year Level, Semester, Course Load, Status, Actions; expand/collapse placements, duplicate/create versions, validate, authorized status actions | Maintain immutable assigned version identity; placements and prerequisites version-scoped; course-load totals computed; no new Term management or curriculum-semesters table |
| Sections & Schedules > Sections (pages 9 to 11) | **Seven columns:** Block Identity, Academic Term, Curriculum, Capacity Summary, Capacity Status, Section Status, Actions; create/edit/view/assign proposed students/transfer/open schedule | Separate `block_sections` and `block_student_assignments` from existing enrollment-linked `sections`; authoritative confirmed counts require explicit allocation evidence or qualified derivation; no Capacity & Demand tab |
| Sections & Schedules > Class Schedule (pages 11 to 12) | Term, college/program/year/block filters; subject, professor, day/time/room; multiple meetings; check conflicts; save draft and finalize/publish | Reuse subject instructional sections, instructors, rooms and meetings with a block link; validated scheduling, no separate Subject Offerings tab; draft and published planning are never Registrar confirmation |
| Academic Review > Pending Reviews (pages 13 to 14) | Case reference, student reference, program, subject, academic issue, submitted, status, actions; review via centered modal and decide Approve/Reject/Return for Clarification | `academic_reviews` must link enrollment, optional subject, failed rule, request/decision evidence, authorized actor and canonical state |
| Academic Review > Resolved Reviews (pages 14 to 15) | Case reference, student reference, program, subject, decision status/date/actions; read-only details modal | Same existing case table and immutable decision history; no duplicate archive table |
| Reports & Monitoring > Academic Reports (pages 15 to 17) | **Five report types**, default Program and Curriculum Summary; automatic preview on load/filter/type; Clear Filters resets to All but preserves type; export/print/detail dialogs and counts | Parameterized authorized read models, **no independent report tables**; same scoped rows for preview and exports |
| Reports & Monitoring > Academic Change History (pages 17 to 18) | Read-only date, actor, module, record, action and before/after values; details modal | Trusted append-only `academic_change_history`; separate from `audit_events` technical security monitoring |

These requirements confirm the existing recommendation to retain existing **subject instructional sections** and bridge them to GUI **curriculum block sections**. The simplified document specifies functionality, but **does not mandate** the exact bridge table name, mandatory sharing behavior, SQL uniqueness key or particular server function structure. Those are engineering proposals requiring explicit approval.

## 3. Corrections required to the initial Phase 3A proposal

| Finding | Previous proposal risk | Documentation correction made or newly flagged |
|---|---|---|
| Exact simplified document was said to be unavailable | Incorrectly left current GUI authority unverified | Explicitly mark edition 2.0 reviewed and remove this documentation blocker |
| Supporting workflow, naming and authority docs were previously unreadable | A core source verification gap remained | Verify the readable attached source copies and incorporate references; treat grade import as proposed extension |
| The source's Sections table combines blocks, capacity and roster proposals | DB model did not distinguish displayed block capacity from instructional section availability clearly enough | Define separate proposed block occupancy, Registrar-confirmed subject section occupancy and any separately attributed confirmed block membership |
| A shared instructional section can belong to multiple blocks | Counting `enrollment_subjects` by section alone can **double-count or misattribute students to a particular block** | Require verified official block-to-enrollment attribution for a literal confirmed-block count; otherwise display distinct confirmed **subject-section** registrations with a clear label or mark block count unavailable |
| Earlier `block_sections` uniqueness was only `(term_id, code)` | Disallowed valid repeated section display labels across program/track contexts or hid null specialization semantics | Prefer scoped unique identity including term, program, optional track, year and approved section label/letter; treat displayed code as a formatted label, with collision checks separate |
| Premature SQL policy choices | Year range `1..4`, curriculum status set, one active version, shared classes and room/instructor workload rules could become mistaken institutional policy | Mark these as **proposed implementation choices**; enforce only approved bounds and current known canonical rule namespaces; preserve legacy data until classified |
| Pending/Resolved Review modal decisions | Status could be interpreted as immediate authorization to alter enrollment | Show decision reason and controlled status transition; application goes back through automated validation and Registrar |
| Separate historical status and workflow concepts | Block `DRAFT/PUBLISHED`, subject section `PLANNED/OPEN/FULL/CLOSED` and enrollment `VALIDATED/CONFIRMED` can be conflated | Keep separate fields, translation layers and write authority; full derived from current capacity, with no direct Coordinator official confirmation |
| Five report types and automatic preview | Free-form reporting implementation could drift into separate modules or persisted report tables | Pin report list, default preview, filter-clear semantics, permission checks for export and printable views |
| Official grade import blueprint | Could be mistaken for already adopted official policy | Defer new batch/provenance tables until institution confirms authorization and the extension is approved; retain authoritative result consumption |

## 4. Remaining decisions that documents do not settle

1. **Block confirmed count attribution:** Whether PLP officially assigns a *confirmed home block* during Registrar processing, how irregular students who select sections across blocks are counted, and whether a new Registrar-owned `enrollment_block_memberships` relation is needed. Do not infer a confirmed block roster from a mere overlap with subject sections.
2. **Block identity:** Approve program and optional specialization keys, reusable section letter/label rules, allowed duplicates across terms, and any official naming convention for track sections. A demo display code alone cannot establish this institutionally.
3. **Schedule publication:** Confirm whether published planning schedules also activate actual instructional sections for Student choice, or whether a separate Academic Coordinator/Registrar operational readiness action controls `sections.status='OPEN'`. A published block proposal alone is insufficient.
4. **Curriculum lifecycle:** Confirm allowed Draft, Active, Inactive and Archived transitions and whether multiple versions may remain concurrently active under different effective years or student cohorts. Source requires *preserving assigned versions* but does not explicitly require a universal one-active-version index.
5. **University policy inputs:** Official program tracks, room inventory, professor qualifications/workloads, passing rules, self-service unit limits, overload ceiling, promotion rules, and institutionally authorized subject exceptions remain unconfirmed.
6. **Existing data reconciliation:** Resolve the prior read-only database findings individually: five null curriculum statuses, five empty curricula, ten unmatched term/subject offerings, four repeated section display groups, and low Auth linkage. These are historic observations, not evidence that all are invalid records.
7. **Official grade import extension:** Verify real source approval, signatories, grade scale, publication and retention policy before creating new import workflow tables; no academic grades computation in the Coordinator role.

## 5. Evidence and implementation boundary

The source DOCX files were inspected as documents, with attention to their tables and the simplified Coordinator's explicit workflow. No new production Supabase inspection is claimed in this source review: existing 46-table findings in the Phase 3A audit/proposal are **dated snapshots**, and must be rechecked immediately before Phase 3B. No app source, role interfaces, database schema, RLS policies, Auth account, migrations or mock data were changed as part of this documentation verification.

**Approval requirement:** Review the updated [schema proposal](phase-3a-schema-finalization-proposal.md), especially the latest addendum and its outstanding decisions. Only explicit approval authorizes the separately planned Phase 3B implementation.
