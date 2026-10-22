import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const enrollment = read("../supabase/migrations/20261022092000_trusted_enrollment_lifecycle.sql");
const confirmation = read("../supabase/migrations/20261022094000_official_enrollment_confirmation_academic_gate.sql");
const contact = read("../supabase/migrations/20261022091500_phase8_lecture_laboratory_contact_hours.sql");
const classifier = read("../supabase/migrations/20261022093000_coordinator_classify_draft_class_meetings.sql");
const actions = read("../src/features/students/official-enrollment-actions.js");

test("an authenticated Student can only initiate a verified current-term enrollment", () => {
  assert.match(enrollment, /current_role_code\(\) IS DISTINCT FROM 'student'/);
  assert.match(enrollment, /v_student.record_kind='PROJECT_ONLY'/);
  assert.match(enrollment, /v_term.enrollment_start IS NULL/);
  assert.match(enrollment, /'IN_PROGRESS','ELIGIBLE'/);
  assert.match(enrollment, /admission_status='COMPLETED'/);
});

test("subject registration checks eligibility, term, room schedule and capacity", () => {
  assert.match(enrollment, /registration_status IN \('SELECTED','CONFIRMED'\)/);
  assert.match(enrollment, /eligibility_status IN \('ELIGIBLE','RETAKE'\)/);
  assert.match(enrollment, /v_section.schedule_status IS DISTINCT FROM 'FINALIZED'/);
  assert.match(enrollment, /v_count>=LEAST\(v_section.capacity,40\)/);
  assert.match(enrollment, /Selected classes overlap the student timetable/);
});

test("official enrollment needs a signed Registrar and prior validation", () => {
  assert.match(enrollment, /current_role_code\(\) IS DISTINCT FROM 'registrar'/);
  assert.match(enrollment, /v_enrollment.status<>'VALIDATED'/);
  assert.match(enrollment, /UPDATE public.enrollments SET status='CONFIRMED'/);
  assert.match(confirmation, /Only a signed Registrar can complete official enrollment/);
  assert.match(confirmation, /Official enrollment has overlapping subjects/);
});

test("lecture and laboratory classification is explicit and requires approved minutes", () => {
  assert.match(contact, /meeting_component_type IN/);
  assert.match(contact, /coordinator_set_subject_contact_requirement_v1/);
  assert.match(contact, /weekly_minutes IS DISTINCT FROM/);
  assert.match(contact, /approval_source_reference text NOT NULL/);
  assert.match(classifier, /coordinator_classify_draft_meeting_v1/);
  assert.match(classifier, /schedule_status='FINALIZED'/);
});

test("new Next.js actions never inject service-role credentials into student workflows", () => {
  assert.match(actions, /requireRole\(role\)/);
  assert.match(actions, /client.rpc\(functionName, args\)/);
  assert.match(actions, /"student_open_enrollment_v1"/);
  assert.match(actions, /"registrar_confirm_validated_enrollment_v1"/);
  assert.doesNotMatch(actions, /createAdminClient|SERVICE_ROLE_KEY|localStorage/);
});
