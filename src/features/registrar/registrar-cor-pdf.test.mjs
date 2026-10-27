import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { buildVerifiedCorDocument } from "../cor/cor-document.mjs";
import { buildProjectCorPdf, renderVerifiedCorPdf } from "../cor/cor-pdf.mjs";

const original = {
  simulation_only: true,
  official: false,
  certificate_of_official_registration: false,
  registration_status: "CONFIRMED FOR PROJECT SIMULATION",
  registration_snapshot_complete: true,
  simulation_id: "test-simulation",
  registration_reference: "PROJECT-TEST-123",
  academic_year: "2026 to 2027",
  semester: "First Semester",
  confirmed_at: "2026-10-27T05:05:00+08:00",
  confirmed_by_registrar: "Authorized Test Registrar",
  registered_units: 3,
  student: {
    student_name: "Fictional Test Student",
    student_number: "TEST-001",
    program_code: "BSIT",
    year_level: 2,
    home_block: "BSIT-2A",
    curriculum_code: "P8F26-BSIT-V1",
  },
  registered_subjects: [{
    subject_code: "P8F26-TEST-1",
    subject_name: "Example Subject",
    section_id: "test-section-id",
    section_code: "BSIT-2A",
    academic_units: 3,
  }],
  registered_schedule: [{
    subject_code: "P8F26-TEST-1",
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:00",
    room: "Lab A",
    professor: "Fictional Instructor",
  }],
};
const fee = {
  official: false, assessmentIssued: false, subjectCount: 1,
  totalUnits: 3, estimatedAmount: 300,
  subjects: [{
    code: "P8F26-TEST-1", units: 3, ratePerUnit: 100, estimatedFee: 300,
  }],
};

test("a single A4 COR PDF contains the template structure and confirmed record", async () => {
  const pdf = await buildProjectCorPdf(original, { projectFeeEstimate: fee });
  const raw = pdf.toString("latin1");
  assert.match(raw, /^%PDF-/);
  assert.match(raw, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.equal((raw.match(/\/Type \/Page\b/g) || []).length, 1);
  assert.ok(pdf.length > 5000);
  const normalized = buildVerifiedCorDocument(original, { projectFeeEstimate: fee });
  assert.equal(normalized.totalUnits, 3);
  assert.equal(normalized.totalFee, 300);
  assert.equal(normalized.subjects[0].meetings[0].professor, "Fictional Instructor");
  assert.equal(normalized.project, true);
});

test("verified project Registrar name is printed above its signature line without a crowded confirmation caption", async () => {
  const pdf = await buildProjectCorPdf({
    ...original, confirmed_by_registrar: "Maria Santos",
  });
  const source = pdf.toString("latin1");
  const contents = [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      } catch {
        return "";
      }
    }).join("\n");
  const registrarName = Buffer.from("Maria Santos").toString("hex");
  const registrarLabel = Buffer.from("UNIVERSITY REGISTRAR").toString("hex");
  const namePosition = contents.toLowerCase().indexOf(registrarName);
  const labelPosition = contents.toLowerCase().indexOf(registrarLabel);
  assert.ok(namePosition >= 0, "registered confirming actor must appear in the PDF");
  assert.ok(labelPosition > namePosition, "the confirming actor must be placed above the Registrar label");
  assert.doesNotMatch(contents.toLowerCase(), new RegExp(
    Buffer.from("Recorded project confirmation:").toString("hex"), "i"));
  assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 1);
});

test("COR embeds the high resolution Pasig seal rather than the old thumbnail", async () => {
  const image = readFileSync(join(process.cwd(), "public", "assets", "images",
    "cor_pasig_seal_highres.png"));
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(image.readUInt32BE(16) >= 1000, "Pasig City seal must be high resolution");
  assert.ok(image.readUInt32BE(20) >= 1000, "Pasig City seal must be high resolution");
  const pdf = await buildProjectCorPdf(original);
  const raw = pdf.toString("latin1");
  assert.match(raw, /\/Width 1280\b/);
  assert.match(raw, /\/Height 1281\b/);
});

test("a normal seven-subject, ten-meeting registration fits one A4 page", async () => {
  const names = [
    "Data Structures and Algorithms for IT",
    "Networking Fundamentals and Configuration",
    "Object Oriented Programming",
    "Information Management and Systems",
    "Web Development and Design",
    "Human Computer Interaction",
    "Understanding the Self",
  ];
  const registered_subjects = names.map((subject_name, index) => ({
    ...original.registered_subjects[0],
    subject_code: `P8F26-BSIT-T03-M${index + 1}`,
    section_id: `section-${index + 1}`,
    subject_name,
    academic_units: index === 0 || index === 1 ? 2 : 3,
  }));
  const registered_schedule = registered_subjects.flatMap((subject, index) =>
    Array.from({ length: index < 3 ? 2 : 1 }, (_, meetingIndex) => ({
      ...original.registered_schedule[0],
      subject_code: subject.subject_code,
      day_of_week: meetingIndex + 1,
      room: index < 3 ? "Computer Laboratory 204" : "Lecture Room 305",
    })));
  const cor = {
    ...original, registered_subjects, registered_schedule, registered_units: 19,
  };
  const pdf = await buildProjectCorPdf(cor);
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length, 1);
});

test("confirmed registrations with many subjects paginate rather than clipping", async () => {
  const registered_subjects = Array.from({ length: 34 }, (_, index) => ({
    ...original.registered_subjects[0],
    subject_code: `TEST-SUBJECT-${index}`,
    section_id: `section-${index}`,
  }));
  const registered_schedule = registered_subjects.map((row) => ({
    ...original.registered_schedule[0], subject_code: row.subject_code,
  }));
  const long = {
    ...original, registered_subjects, registered_schedule, registered_units: 102,
  };
  const pdf = await buildProjectCorPdf(long);
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length >= 2);
});

test("unconfirmed project, legacy confirmation, missing evidence and duplicates fail closed", () => {
  for (const invalid of [
    { registration_snapshot_complete: false },
    { registration_status: "SUBMITTED" },
    { registered_subjects: [] },
    { registered_schedule: [] },
    { registered_units: 5 },
    { registered_schedule: [{ ...original.registered_schedule[0], subject_code: "OTHER" }] },
    { registered_subjects: [original.registered_subjects[0], original.registered_subjects[0]] },
  ]) {
    assert.throws(() => buildVerifiedCorDocument({ ...original, ...invalid }));
  }
  assert.throws(() => buildVerifiedCorDocument(original, {
    projectFeeEstimate: { ...fee, estimatedAmount: 1 },
  }), /fees do not reconcile/i);
});

test("official COR requires a genuinely printable confirmed snapshot", async () => {
  const official = {
    official: true, status: "OFFICIALLY ENROLLED",
    ready_to_print: true, schedule_complete: true,
    registration_reference_complete: true,
    confirmed_at: original.confirmed_at,
    student_number: original.student.student_number,
    student_name: original.student.student_name,
    program_name: "Bachelor of Science in Information Technology",
    year_level: 2, home_block: "BSIT-2A",
    confirmation_reference: "OFFICIAL-TEST-123",
    subjects: original.registered_subjects.map((row) => ({
      subject_code: row.subject_code,
      subject_name: row.subject_name, section_id: row.section_id, units: 3,
    })),
    schedule: original.registered_schedule,
  };
  const normalized = buildVerifiedCorDocument(official, {
    academicYear: "2026 to 2027", semester: "First Semester",
  });
  assert.equal(normalized.project, false);
  assert.equal(normalized.totalFee, null);
  const pdf = await renderVerifiedCorPdf(normalized);
  assert.match(pdf.toString("latin1"), /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.throws(() => buildVerifiedCorDocument({
    ...official, ready_to_print: false,
  }), /verified official confirmed enrollment/i);
});
