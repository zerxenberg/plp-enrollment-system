import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseAdmissionsTerm, chooseInstitutionalBlock, admissionsAcademicBlockers,
} from "./live-institutional-preparation.mjs";

const term = { id: "TERM-2026-1", status: "Open",
  enrollment_start: "2026-10-01", enrollment_end: "2026-11-30" };
const profile = { program_code: "BSIT", student_type: "NEW_STUDENT", year_level_number: 1 };
const block = { id: "real-block", program_code: "BSIT", term_id: term.id,
  curriculum_code: "BSIT-2024", year_level: 1, is_synthetic_demo: false,
  planning_status: "PUBLISHED", capacity: 35 };

test("the school's enrollment calendar must identify exactly one open term", () => {
  assert.equal(chooseAdmissionsTerm([term], "2026-10-30")?.id, term.id);
  assert.equal(chooseAdmissionsTerm([term], "2026-12-01"), null);
  assert.equal(chooseAdmissionsTerm([term, { ...term, id: "another" }], "2026-10-30"), null);
});

test("synthetic, draft and mismatched block proposals are rejected for institutional students", () => {
  const args = { blocks: [block], programCode: "BSIT", termId: term.id,
    yearLevel: 1, curriculumCode: "BSIT-2024" };
  assert.equal(chooseInstitutionalBlock(args)?.id, block.id);
  for (const changed of [
    { is_synthetic_demo: true }, { planning_status: "DRAFT" },
    { capacity: 0 }, { year_level: 2 }, { curriculum_code: "P8F26-BSIT-V1" },
  ]) {
    assert.equal(chooseInstitutionalBlock({ ...args, blocks: [{ ...block, ...changed }] }), null);
  }
  assert.equal(chooseInstitutionalBlock({ ...args, blocks: [block, { ...block, id: "duplicate" }] }), null);
});

test("freshmen require validated real sections; transferees without evaluated year remain blocked", () => {
  const args = { student: profile, term, curriculum: { code: "BSIT-2024" },
    block, subjects: [{ subject_code: "IT101" }], sections: [], enrollments: [] };
  assert.match(admissionsAcademicBlockers(args).join(" "), /finalize the real subject sections/);
  const ready = { subject_code: "IT101", status: "OPEN", schedule_status: "FINALIZED",
    is_synthetic_demo: false, meetings: [{ day: 1 }],
    hasPrimaryInstructor: true, hasVerifiedRooms: true };
  assert.deepEqual(admissionsAcademicBlockers({ ...args, sections: [ready] }), []);
  assert.match(admissionsAcademicBlockers({
    ...args, student: { ...profile, student_type: "TRANSFEREE", year_level_number: null },
    sections: [ready],
  }).join(" "), /Transferee/);
});
