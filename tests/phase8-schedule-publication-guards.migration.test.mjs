import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL(
  "../supabase/migrations/20261022085011_phase8_schedule_publication_guards.sql",
  import.meta.url,
), "utf8");
const body = sql.split("AS $phase8$")[1]?.split("$phase8$;")[0] || "";

test("guard is an isolated migration that preserves live scheduling RPC signatures and draft data", () => {
  assert.ok(body, "publication guard function must exist");
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /RETURNS trigger/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.block_sections/);
  assert.match(sql, /FOR EACH ROW[\s\S]*EXECUTE FUNCTION public\.phase8_guard_block_schedule_publication/);
  assert.match(body, /IF TG_OP = 'INSERT' THEN[\s\S]*NEW\.planning_status = 'PUBLISHED'/);
  assert.match(body, /OLD\.planning_status IS DISTINCT FROM 'DRAFT'/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.(?:publish_proposed_block_schedule|save_proposed_class_meeting|save_academic_block)\s*\(/);
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\.(?:block_sections|block_subject_sections|block_student_assignments|sections|section_meetings)\b/i);
  assert.match(body, /RETURN NEW;/);
});

test("publication is restricted to authenticated Academic Coordinator and approved curriculum", () => {
  assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'authenticated'/);
  assert.match(body, /auth\.uid\(\) IS NULL/);
  assert.match(body, /public\.has_role\('academic-coordinator'\)/);
  assert.match(body, /v_curriculum\.status IS DISTINCT FROM 'Active'/);
  assert.match(body, /v_curriculum\.program_code IS DISTINCT FROM NEW\.program_code/);
  assert.match(body, /v_curriculum\.program_track_code[\s\S]*?IS DISTINCT FROM NEW\.program_track_code/);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.phase8_guard_block_schedule_publication\(\)/);
});

test("class counts follow each approved curriculum year and semester, never meeting count", () => {
  assert.match(body, /public\.curriculum_subjects cs/);
  assert.match(body, /cs\.curriculum_code = NEW\.curriculum_code/);
  assert.match(body, /lower\(btrim\(cs\.year_level\)\) = lower\(v_year_label\)/);
  assert.match(body, /lower\(btrim\(cs\.semester\)\) = lower\(btrim\(v_term\.semester\)\)/);
  assert.match(body, /v_expected_subjects NOT IN \(6, 7\)/);
  assert.match(body, /count\(DISTINCT s\.subject_code\)/);
  assert.match(body, /v_section_count <> v_expected_subjects/);
  assert.match(body, /v_distinct_subjects <> v_expected_subjects/);
  assert.match(body, /o\.status IS DISTINCT FROM 'ACTIVE'/);
  assert.match(body, /subject\.units IS NULL OR subject\.units <= 0/);
});

test("weekday coverage and every active meeting require a valid instructor and room", () => {
  assert.match(body, /m\.day_of_week BETWEEN 1 AND 5/);
  assert.match(body, /m\.day_of_week NOT BETWEEN 1 AND 5/);
  assert.match(body, /v_term\.academic_year = '2026 to 2027' AND v_taught_days <> 5/);
  assert.match(body, /count\(DISTINCT m\.day_of_week\)/);
  assert.match(body, /m\.meeting_status = 'ACTIVE'/);
  assert.match(body, /m\.start_time < m\.end_time/);
  assert.match(body, /public\.rooms r ON r\.id = m\.room_id AND r\.is_active/);
  assert.match(body, /si\.assignment_role = 'PRIMARY'/);
  assert.match(body, /public\.instructors i ON i\.id = si\.instructor_id/);
});

test("conflict gate covers overlaps of rooms, all assigned instructors, and the same block", () => {
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /'MEETINGS:' \|\| NEW\.term_id/);
  assert.match(body, /other\.day_of_week = m\.day_of_week/);
  assert.match(body, /other\.start_time < m\.end_time AND m\.start_time < other\.end_time/);
  assert.match(body, /m\.room_id = other\.room_id/);
  assert.match(body, /theirs\.instructor_id = ours\.instructor_id/);
  assert.match(body, /same_block\.block_id = NEW\.id/);
  assert.match(body, /other_section\.term_id = NEW\.term_id/);
});

test("capacity limits and overlapping student class selections block publication", () => {
  assert.match(body, /NEW\.capacity IS DISTINCT FROM 40/);
  assert.match(body, /s\.capacity IS DISTINCT FROM 40/);
  assert.match(body, /SELECT count\(\*\) INTO v_occupied FROM \(/);
  assert.match(body, /SELECT a\.student_id[\s\S]*?UNION[\s\S]*?SELECT e\.student_id/);
  assert.match(body, /v_occupied > NEW\.capacity/);
  assert.match(body, /e\.status = 'CONFIRMED'/);
  assert.match(body, /theirs\.student_id = ours\.student_id/);
  assert.match(body, /theirs\.block_id <> NEW\.id/);
  assert.match(body, /affected_students AS \(/);
  assert.match(body, /public\.enrollment_subjects es ON es\.enrollment_id = e\.id/);
  assert.match(body, /e\.status NOT IN \('CANCELLED', 'NOT_ELIGIBLE'\)/);
  assert.match(body, /already_in_block\.section_id = other\.section_id/);
});
