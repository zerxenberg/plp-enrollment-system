import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildVerifiedCorDocument } from "./cor-document.mjs";
import { verifiedCorSubjectDisplayCodes } from "./cor-subjects.mjs";
import { corPdfFilename, corFilenameFromDisposition } from "./cor-filename.mjs";
import { renderVerifiedCorPdf } from "./cor-pdf.mjs";

const source = readFileSync(new URL("./admissions-demo-cor-server.js", import.meta.url), "utf8")
  .replace(/^import "server-only";\s*$/gm, "")
  .replace(/^import \{[^\n]+\} from "[^\n]+";\s*$/gm, "")
  .replace("export async function admissionsDemoCorDocument", "async function admissionsDemoCorDocument");

const admissionsDemoCorDocument = runInNewContext(`${source}\nadmissionsDemoCorDocument;`, {
  buildVerifiedCorDocument, verifiedCorSubjectDisplayCodes,
});

const DEMO_ID = "87583618-4daa-4c9d-b69c-cf714dde4e9d";
const STUDENT_ID = "c305c9d0-d74b-41e5-af47-570f68b96ba2";
const USER_ID = "student-user";
const REGISTRAR_ID = "registrar-user";
const CODE = "P8F26-BSIT-T01-M1";

function fixture() {
  return {
    admissions_phase8_demo_enrollments: [{
      id: DEMO_ID, student_id: STUDENT_ID, block_id: "block-1", term_id: "TERM-2026-1",
      source_kind: "ADMISSIONS_PHASE8_DEMONSTRATION", status: "CONFIRMED_SIMULATION",
      confirmed_at: "2026-10-30T14:16:28Z", confirmed_by: REGISTRAR_ID,
      simulation_only: true, is_official: false, curriculum_code: "P8F26-BSIT-V1",
      subject_snapshot: [{
        code: CODE, name: "Introduction to Computing", section_id: "section-1",
        section_code: "BSIT-1A", units: 3, ratePerUnit: 100, feeEstimate: 300,
        meetings: [{ day: 3, start: "08:30:00", end: "10:00:00",
          room: "BSIT-201", instructor: "Professor Test", component: "LECTURE" }],
      }],
      fee_estimate: { simulation_only: true, official: false, currency: "PHP",
        missingRateCount: 0, verifiedRateCount: 1, totalUnits: 3, estimatedAmount: 300 },
    }],
    student_profiles: [{ id: STUDENT_ID, user_id: USER_ID, student_number: "26-50604",
      program_code: "BSIT", year_level_number: 1, is_synthetic_demo: false,
      record_kind: "INSTITUTIONAL" }],
    block_sections: [{ id: "block-1", code: "BSIT-1A", term_id: "TERM-2026-1",
      program_code: "BSIT", year_level: 1, curriculum_code: "P8F26-BSIT-V1",
      is_synthetic_demo: true }],
    academic_terms: [{ id: "TERM-2026-1", academic_year: "2026 to 2027",
      semester: "First Semester" }],
    app_users: [{ id: REGISTRAR_ID, full_name: "Registrar Test", role_code: "registrar" },
      { id: USER_ID, full_name: "Manggi Miguelito Jr.", sex: "Male", role_code: "student",
        is_synthetic_demo: false, source_account_key: "PLP_ADMISSIONS:DEMO" }],
    admission_handoffs: [{ student_id: STUDENT_ID, source_name: "PLP Admissions",
      admission_status: "ACCEPTED", synchronization_status: "Successful" }],
    subjects: [{ code: CODE, name: "Introduction to Computing" }],
  };
}

function db(tables) {
  return {
    from(table) {
      let rows = tables[table] || [];
      const chain = {
        select() { return chain; },
        eq(field, value) { rows = rows.filter((row) => row[field] === value); return chain; },
        in(field, values) {
          return Promise.resolve({ data: rows.filter((row) => values.includes(row[field])), error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: rows.length === 1 ? rows[0] : null,
            error: rows.length > 1 ? { message: "Ambiguous" } : null });
        },
      };
      return chain;
    },
  };
}

test("confirmed Admissions record produces the shared PLP PDF and standardized verified filename", async () => {
  const record = await admissionsDemoCorDocument(db(fixture()), DEMO_ID, STUDENT_ID);
  assert.equal(record.project, true);
  assert.equal(record.studentNumber, "26-50604");
  assert.equal(record.block, "BSIT-1A");
  assert.equal(record.totalUnits, 3);
  assert.equal(record.totalFee, 300);
  assert.equal(record.subjects[0].code, CODE);
  assert.equal(record.subjects[0].displayCode, "IT 101");
  assert.equal(record.subjects[0].meetings[0].professor, "Professor Test");
  assert.match(corPdfFilename(record), /^COR_26_50604_ManggiMiguelitoJr_AY2026_2027_BSIT1A_1stSem\.pdf$/);
  const header = `inline; filename="${corPdfFilename(record)}"`;
  assert.equal(corFilenameFromDisposition(header), corPdfFilename(record));
  const pdf = await renderVerifiedCorPdf(record);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("registration ownership and Registrar confirmation are mandatory", async () => {
  await assert.rejects(admissionsDemoCorDocument(db(fixture()), DEMO_ID,
    "00000000-0000-4000-8000-000000000001"), /confirmed nonofficial/);
  const changed = fixture();
  changed.admissions_phase8_demo_enrollments[0].status = "SUBMITTED";
  await assert.rejects(admissionsDemoCorDocument(db(changed), DEMO_ID, STUDENT_ID), /confirmed nonofficial/);
  changed.admissions_phase8_demo_enrollments[0].status = "CONFIRMED_SIMULATION";
  changed.app_users[0].role_code = "student";
  await assert.rejects(admissionsDemoCorDocument(db(changed), DEMO_ID, STUDENT_ID), /provenance/);
});

test("official flags, forged subjects and incomplete meetings fail closed", async () => {
  const official = fixture();
  official.admissions_phase8_demo_enrollments[0].is_official = true;
  await assert.rejects(admissionsDemoCorDocument(db(official), DEMO_ID), /nonofficial/);
  const altered = fixture();
  altered.admissions_phase8_demo_enrollments[0].subject_snapshot[0].name = "Different course";
  await assert.rejects(admissionsDemoCorDocument(db(altered), DEMO_ID), /subject catalog/);
  const missing = fixture();
  missing.admissions_phase8_demo_enrollments[0].subject_snapshot[0].meetings = [];
  await assert.rejects(admissionsDemoCorDocument(db(missing), DEMO_ID), /meeting snapshot/);
});
