import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { buildVerifiedCorDocument } from "./cor-document.mjs";
import { corPdfFilename, corFilenameFromDisposition } from "./cor-filename.mjs";
import { renderVerifiedCorPdf } from "./cor-pdf.mjs";
import { verifiedCorSubjectDisplayCodes } from "./cor-subjects.mjs";

const studentRoute = readFileSync(
  new URL("../../app/api/student/project-cor/route.js", import.meta.url), "utf8");
const registrarRoute = readFileSync(
  new URL("../../app/api/registrar/project-cor/[simulationId]/route.js", import.meta.url), "utf8");
const preview = readFileSync(
  new URL("../../components/cor/CorDocumentPreview.js", import.meta.url), "utf8");
const renderer = readFileSync(new URL("./cor-pdf.mjs", import.meta.url), "utf8");
const response = readFileSync(new URL("./cor-response.js", import.meta.url), "utf8");

const miguel = {
  studentNumber: "25-50001", studentName: "Miguel Marie Garcia",
  academicYear: "2026 to 2027", block: "BSIT-2A", semester: "First Semester",
};

test("the filename matches the required student-specific academic naming convention", () => {
  assert.equal(corPdfFilename(miguel),
    "COR_25_50001_MiguelMarieGarcia_AY2026_2027_BSIT2A_1stSem.pdf");
  assert.equal(corPdfFilename({
    studentNumber: "27-10021", studentName: "Ana María D. Reyes Jr.",
    academicYear: "2027–2028", block: "BSCS-3B", semester: "Second Semester",
  }), "COR_27_10021_AnaMariaDReyesJr_AY2027_2028_BSCS3B_2ndSem.pdf");
  assert.equal(corPdfFilename({
    ...miguel, academicYear: "AY 2031/2032", block: "BSIT 4C", semester: "Summer Term",
  }), "COR_25_50001_MiguelMarieGarcia_AY2031_2032_BSIT4C_Summer.pdf");
  assert.throws(() => corPdfFilename({ ...miguel, studentName: "Not recorded" }), /required/);
  assert.throws(() => corPdfFilename({ ...miguel, academicYear: "Unknown" }), /required/);
});

test("a PDF URL without a verified filename never falls back to a random or generic PDF name", () => {
  const file = corPdfFilename(miguel);
  for (const mode of ["inline", "attachment"]) {
    assert.equal(corFilenameFromDisposition(`${mode}; filename="${file}"`), file);
  }
  assert.equal(corFilenameFromDisposition("attachment; filename=\"12345678-abc.pdf\""), null);
  assert.equal(corFilenameFromDisposition(null), null);
  assert.match(preview, /download=\{document\.filename\}/);
  assert.match(preview, /href=\{\`\$\{documentUrl\}\?view=1\`\}/);
  assert.match(preview, /<iframe ref=\{viewer\} src=\{\`\$\{documentUrl\}\?view=1\`\}/);
  assert.match(response, /corPdfFilename\(record\)/);
  assert.match(response, /Content-Disposition.*filename/);
  assert.ok([studentRoute, registrarRoute].every((source) => source.includes("verifiedCorResponse")));
});

test("live catalog codes use the exact same Phase 8 display aliases as all three portals", () => {
  const rows = [
    ["P8F26-GE-T03-1", "The Contemporary World", "GE 201"],
    ["P8F26-GE-T03-2", "Ethics", "GE 202"],
    ["P8F26-GE-T03-3", "Physical Education and Wellness 1", "GE 203"],
    ["P8F26-BSIT-T03-M1", "Data Structures and Algorithms for IT", "IT 201"],
    ["P8F26-BSIT-T03-M2", "Database Management Systems 1", "IT 202"],
    ["P8F26-BSIT-T03-M3", "Object-Oriented Programming", "IT 203"],
    ["P8F26-BSIT-T03-M4", "Network Administration", "IT 204"],
  ];
  const registered = rows.map(([subject_code]) => ({ subject_code }));
  const subjects = rows.map(([code, name]) => ({ code, name }));
  const display = verifiedCorSubjectDisplayCodes(registered, subjects);
  assert.deepEqual([...display.values()], rows.map((row) => row[2]));
  assert.deepEqual(registered.map((row) => row.subject_code), rows.map((row) => row[0]));
  assert.throws(() => verifiedCorSubjectDisplayCodes(registered, subjects.slice(1)), /missing/);
  assert.throws(() => verifiedCorSubjectDisplayCodes(registered, [...subjects, subjects[0]]), /inconsistent/);
  assert.throws(() => verifiedCorSubjectDisplayCodes(registered, [
    ...subjects.slice(1), { code: "UNREGISTERED", name: "Unknown" },
  ]), /inconsistent/);
  assert.match(renderer, /record\.displayCode \|\| record\.code/);
});

test("rendered COR PDF prints the verified display code without mutating snapshot evidence", async () => {
  const rawCode = "P8F26-BSIT-T03-M1";
  const cor = {
    simulation_only: true, official: false, certificate_of_official_registration: false,
    registration_status: "CONFIRMED FOR PROJECT SIMULATION",
    registration_snapshot_complete: true, simulation_id: "verified-simulation",
    confirmed_at: "2026-10-27T12:59:33+08:00", registered_units: 3,
    academic_year: "2026 to 2027", semester: "First Semester",
    student: {
      student_number: "25-50001", student_name: "Miguel Marie Garcia",
      program_code: "BSIT", home_block: "BSIT-2A", year_level: 2,
    },
    registered_subjects: [{
      subject_code: rawCode, subject_name: "Data Structures and Algorithms for IT",
      academic_units: 3, section_id: "original-confirmed-section", section_code: "BSIT-2A",
    }],
    registered_schedule: [{
      subject_code: rawCode, day_of_week: 1, start_time: "08:00", end_time: "10:00",
      room: "BSIT-201", professor: "Project instructor",
    }],
  };
  const copy = structuredClone(cor);
  const mapped = buildVerifiedCorDocument(cor, {
    subjectDisplayCodes: new Map([[rawCode, "IT 201"]]),
  });
  assert.equal(mapped.subjects[0].code, rawCode);
  assert.equal(mapped.subjects[0].displayCode, "IT 201");
  assert.equal(mapped.subjects[0].meetings[0].subject_code, rawCode);
  assert.deepEqual(cor, copy);
  assert.equal(corPdfFilename(mapped),
    "COR_25_50001_MiguelMarieGarcia_AY2026_2027_BSIT2A_1stSem.pdf");
  const pdf = (await renderVerifiedCorPdf(mapped)).toString("latin1");
  const streams = [...pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      } catch {
        return "";
      }
    }).join("\n");
  assert.match(streams, /495420323031/i, "rendered PDF contains IT 201");
  assert.doesNotMatch(streams, /50384632362d425349542d5430332d4d31/i,
    "rendered PDF does not print the internal project subject identifier");
});
