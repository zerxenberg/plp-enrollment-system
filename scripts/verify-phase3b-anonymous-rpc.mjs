/**
 * Negative security regression checks. Anonymous users MUST NOT be able to
 * call any protected Academic Coordinator transaction or reference resolver.
 * Intentionally supplies NULL/empty identifiers; never mutates real records.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const entries = readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z0-9_]+=/.test(line))
  .map((line) => {
    const idx = line.indexOf("=");
    return [line.slice(0, idx), line.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
  });
const env = Object.fromEntries(entries);
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const checks = [
  ["decide_academic_review", {
    p_enrollment_reference: null, p_decision: "APPROVED", p_reason: "negative auth test",
  }],
  ["assign_proposed_block_students", { p_block_id: null, p_student_ids: [] }],
  ["transfer_proposed_block_student", {
    p_student_id: null, p_from_block_id: null, p_to_block_id: null, p_reason: "auth test",
  }],
  ["coordinator_student_references", { p_program_code: "NOT_A_PROGRAM" }],
  ["save_curriculum_draft", {
    p_record: { program: "NOT_A_PROGRAM", version: "Negative Test",
      effectiveAcademicYear: "2026 to 2027", assignments: [] },
    p_existing_code: null,
  }],
  ["manage_curriculum_version", { p_code: "NOT_A_CURRICULUM", p_action: "VALIDATE" }],
  ["prepare_block_subject_classes", { p_block_id: null }],
  ["save_proposed_class_meeting", {
    p_block_id: null, p_section_id: null, p_meeting_id: null,
    p_day: 1, p_start: "08:00", p_end: "09:00",
    p_room_id: null, p_instructor_id: null,
  }],
  ["cancel_proposed_class_meeting", {
    p_block_id: null, p_section_id: null, p_meeting_id: null,
  }],
  ["publish_proposed_block_schedule", { p_block_id: null }],
  ["save_academic_block", {
    p_id: null, p_term_id: null, p_code: "AUTH_TEST",
    p_program_code: "NO_PROGRAM", p_curriculum_code: "NO_CURRICULUM",
    p_year_level: 1, p_section_letter: "A", p_capacity: 1,
    p_major_name: null,
  }],
  ["claim_identifier_login_budget", {
    p_key_hash: "0".repeat(64), p_kind: "IDENTIFIER",
  }],
  ["coordinator_synthetic_fixture_page", {
    p_group: "academicCoordinatorCatalog.subjects", p_after_key: "", p_limit: 1,
  }],
  ["coordinator_synthetic_supplemental", {
    p_group: "academicCoordinator.history",
  }],
];

let failures = 0;
for (const [functionName, payload] of checks) {
  const { data, error } = await client.rpc(functionName, payload);
  if (!error || error.code !== "42501") {
    failures++;
    console.error(`FAIL ${functionName}: anonymous caller was not explicitly denied (code ${error?.code || "success"})`);
  } else {
    console.log(`PASS ${functionName}: anonymous access denied`);
  }
  // Avoid returning sensitive rows even on an implementation regression.
  void data;
}
if (failures) process.exitCode = 1;
