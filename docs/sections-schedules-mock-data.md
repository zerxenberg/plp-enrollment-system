# Sections and Schedules: demonstration data and future database integration

The Academic Coordinator prepares block sections and class timetables in an isolated browser demonstration store. No change in this module inserts, updates, or migrates a live Supabase record. All generated student and faculty names, teaching assignments, classroom inventories, and example curriculum timetables are fictional demonstration data. Academic Setup remains the authority for the configured college, program, specialization, subject, and curriculum catalog.

## Concepts and relationships

* `academic_terms` identify an academic year and semester. The active term is shared across the colleges. Future terms can be planned without making their sections eligible for current enrollment.
* `block_sections` contain a stable identifier, academic term, college, program, optional specialization, curriculum version, year level, letter, capacity, and planning status. Their display `code` uses `PROGRAMCODE-YEARLEVELLETTER`, such as `BSIT-3A`. This display label is **not** the primary or historical database key. The same code may reoccur in a different term.
* `semester_block_configurations` connect a block and its term to the curriculum assignments applicable to its year level and semester. Curricula and curriculum subject requirements remain independently managed in Academic Setup.
* `subject_offerings` continue to identify which curriculum subjects may actually be offered in a term, including subjects used by irregular students. `subject_classes` link one offered subject to a block section and professor. A block owns many subject classes; a class owns many `class_meetings`.
* `class_meetings` carry a day, start, end, room, and foreign key to the subject class. Different meetings for one class do not create multiple professor teaching assignments.
* `student_block_assignments` associate one student with a block and term, with proposed status and a record of authorized planning changes. Confirmed enrollment is a distinct Registrar authority, represented through `student_enrollments` and `enrollment_subjects`. A proposed assignment is not proof of confirmed enrollment.
* `professors`, `professor_qualifications`, `rooms`, and room availability provide shared scheduling references across colleges. Specialized rooms, teaching workload limits, and weekly hour limits remain configurable demonstration policy inputs until institutionally verified.

All relationships should use stable identifiers and foreign keys, with snake_case columns in the eventual PostgreSQL adapter. Preserve a canonical program master and a separate specialization field even when the display code needs an unambiguous track abbreviation.

## Validation and authority

The Academic Coordinator can prepare, edit, assign, transfer and schedule proposed records. The Registrar is the authority for official term confirmation, confirmed subject enrollments and corrections. Changes to proposed blocks cannot silently modify confirmed transactions or historical enrollment snapshots. Every block proposal and transfer should preserve the previous assignment and action metadata.

Use half open meeting intervals: `[start, end)`. A shared room, professor or block conflicts only when the academic term and day are equal and `startA < endB && startB < endA`. Adjacent meetings with equal end/start boundaries are valid. On edit, exclude the meeting with the same stable ID. Validate professor subject qualification, availability, assignment counts, weekly teaching hours, room accessibility/type, room capacity and equipment, and timetable conflicts across all colleges. A draft may be incomplete; publishing requires complete, conflict free subject class meetings and valid resources. For irregular students, inspect each confirmed subject class registration when assembling a personal schedule.

Capacity metrics must be derived from student assignments and confirmed enrollment references, never from independent hardcoded count fields. Proposed assignment count and confirmed enrollment count must remain distinct. An unresolved result or failed prerequisite must restrict the affected subject and may require academic review; it does not automatically make all the student's other subjects ineligible. Institutional year promotion, overload and prerequisite exception policies require explicit configuration before they can authorize progression.

## Expected Supabase migration steps

1. Review and approve exact program and specialization identifiers, institutional progression policy, teaching load limits, official subject curriculum assignments, room inventory and academic term dates with PLP stakeholders.
2. Create normalized PostgreSQL tables with stable UUID primary keys, foreign keys to academic master records, and uniqueness for `(academic_term_id, program_id, specialization_id, year_level, section_letter)` while handling nullable specializations properly.
3. Add PostgreSQL constraints for positive capacity, valid meeting intervals, term consistency, and unique active student block membership where the institutional rules require it. Use transactions or equivalent locking to protect capacity updates and final enrollment confirmation.
4. Move all sensitive mutations to authorized server actions or Supabase RPC functions with per role Row Level Security. Provide audit records for section edits, assignment transfers, meeting edits, publication and authorized Registrar corrections.
5. Introduce a database adapter under the same block planning service interface, migrate authoritative historical records by stable IDs using an explicit vetted mapping, and run cross role acceptance tests before switching off the demonstration store.

Reset Demo Data applies only to the mock store. It must never reset authoritative academic, enrollment or grade import records.
