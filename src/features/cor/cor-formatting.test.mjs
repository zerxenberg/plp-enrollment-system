import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { buildVerifiedCorDocument, verifiedCorStudentSex } from "./cor-document.mjs";
import { corPdfFilename, corFilenameFromDisposition } from "./cor-filename.mjs";
import { renderVerifiedCorPdf } from "./cor-pdf.mjs";
import { verifiedCorSubjectDisplayCodes } from "./cor-subjects.mjs";

const studentRoute = readFileSync(
  new URL("../../app/api/student/project-cor/route.js", import.meta.url), "utf8");
const registrarRoute = readFileSync(
  new URL("../../app/api/registrar/project-cor/[simulationId]/route.js", import.meta.url), "utf8");
const officialStudentRoute = readFileSync(
  new URL("../../app/api/student/official-cor/[enrollmentId]/route.js", import.meta.url), "utf8");
const officialRegistrarRoute = readFileSync(
  new URL("../../app/api/registrar/official-cor/[enrollmentId]/route.js", import.meta.url), "utf8");
const preview = readFileSync(
  new URL("../../components/cor/CorDocumentPreview.js", import.meta.url), "utf8");
const renderer = readFileSync(new URL("./cor-pdf.mjs", import.meta.url), "utf8");
const response = readFileSync(new URL("./cor-response.js", import.meta.url), "utf8");
const documentSource = readFileSync(new URL("./cor-document.mjs", import.meta.url), "utf8");
const accessSource = readFileSync(new URL("./cor-access-server.js", import.meta.url), "utf8");

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
  assert.match(preview, /href=\{document\.url\} target="_blank"/);
  assert.match(preview, /<iframe ref=\{viewer\} src=\{document\.url\}/);
  assert.doesNotMatch(preview, /<iframe ref=\{viewer\} src=\{\`\$\{documentUrl\}/);
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

test("Student and Registrar preview, print and download share the verified subject-code PDF route", () => {
  assert.match(accessSource, /verifiedCorSubjectDisplayCodes\(subjects, data\)/);
  assert.match(accessSource, /verifiedProjectCorDocument\(await readProjectDemonstrationCOR/);
  assert.match(accessSource, /officialCorDocument\(enrollmentId, role = "registrar"\)/);
  assert.match(studentRoute, /verifiedProjectCorDocument\(cor, cor\.projectFeeEstimate\)/);
  assert.match(registrarRoute, /registrarProjectCorDocument\(simulationId\)/);
  assert.match(officialStudentRoute, /officialCorDocument\(enrollmentId, "student"\)/);
  assert.match(officialRegistrarRoute, /officialCorDocument\(enrollmentId\)/);
  assert.ok([studentRoute, registrarRoute, officialStudentRoute, officialRegistrarRoute]
    .every((route) => route.includes("verifiedCorResponse")));
  assert.match(preview, /fetch\(\`\$\{documentUrl\}\?view=1\`/);
  assert.match(preview, /viewer\.current\?\.contentWindow\?\.print\(\)/);
  assert.match(preview, /download=\{document\.filename\}/);
  assert.match(documentSource, /displaySubjectCode\(subject\.code\)/);
});

test("verified project and official COR documents preserve the full canonical middle name and Jr. exactly once", () => {
  const canonicalName = "Miguel Antonio Rafael Garcia Jr.";
  const subjectCode = "P8F26-BSIT-T03-M1";
  const subject = {
    subject_code: subjectCode, subject_name: "Data Structures and Algorithms for IT",
    section_id: "verified-section", academic_units: 3,
  };
  const meeting = {
    subject_code: subjectCode, day_of_week: 1, start_time: "08:00", end_time: "10:00",
    room: "BSIT-201",
  };
  const student = {
    student_number: "25-50001", student_name: canonicalName,
    program_code: "BSIT", home_block: "BSIT-2A", year_level: 2,
  };
  const projectCor = {
    simulation_only: true, official: false, certificate_of_official_registration: false,
    registration_status: "CONFIRMED FOR PROJECT SIMULATION", registration_snapshot_complete: true,
    simulation_id: "project-jr", confirmed_at: "2026-10-29T08:30:00+08:00",
    registered_units: 3, academic_year: "2026 to 2027", semester: "First Semester",
    student, registered_subjects: [subject], registered_schedule: [meeting],
  };
  const officialCor = {
    official: true, status: "OFFICIALLY ENROLLED", ready_to_print: true,
    schedule_complete: true, registration_reference_complete: true,
    confirmed_at: "2026-10-29T09:00:00+08:00", ...student,
    subjects: [subject], schedule: [meeting],
  };

  for (const cor of [projectCor, officialCor]) {
    const original = structuredClone(cor);
    const document = buildVerifiedCorDocument(cor);
    assert.equal(document.studentName, canonicalName,
      "COR must use the complete canonical student_name without rebuilding or shortening it");
    assert.ok(document.studentName.includes("Antonio Rafael"), "both middle names must survive");
    assert.equal(document.studentName.match(/Jr\./g)?.length, 1,
      "the suffix must appear exactly once in the COR model");
    assert.deepEqual(cor, original, "mapping must leave the verified source snapshot unchanged");
  }
});

test("confirmed project COR resolves Male, Female and unknown sex through matching synthetic identity records", () => {
  const name = "Miguel Antonio Rafael Garcia Jr.";
  const studentNumber = "25-50001";
  const sourceKey = `PROJECT_ONLY:TERM-2026-1:${studentNumber}`;
  const cor = {
    simulation_only: true, simulation_id: "confirmed-simulation",
    student: { student_number: studentNumber, student_name: name },
  };
  const registration = {
    id: "confirmed-simulation", student_id: "profile-one", term_id: "TERM-2026-1",
    status: "CONFIRMED_SIMULATION", source_provenance: "GENERATED_PROJECT",
    verified_institutionally: false,
  };
  const profile = {
    id: "profile-one", user_id: "account-one", student_number: studentNumber,
    record_kind: "PROJECT_ONLY", project_cohort_id: "PLP_PROJECT_600_2026_1",
    is_synthetic_demo: true, synthetic_source_key: sourceKey,
  };
  const account = {
    id: "account-one", role_code: "student", full_name: name,
    is_synthetic_demo: true, source_account_key: sourceKey,
    project_cohort_id: "PLP_PROJECT_600_2026_1",
  };
  const records = { registration, profile, account };
  for (const sex of ["Male", "Female", null]) {
    const actual = verifiedCorStudentSex(cor, {
      ...records, account: { ...account, sex },
    });
    assert.equal(actual, sex);
  }
  assert.throws(() => verifiedCorStudentSex(cor, {
    ...records, profile: { ...profile, student_number: "another-student" },
  }), /could not be verified/);
  assert.throws(() => verifiedCorStudentSex(cor, {
    ...records, account: { ...account, full_name: "Different Student" },
  }), /could not be verified/);
  assert.throws(() => verifiedCorStudentSex(cor, {
    ...records, account: { ...account, project_cohort_id: "wrong-cohort" },
  }), /provenance/);
  assert.throws(() => verifiedCorStudentSex(cor, {
    ...records, registration: { ...registration, source_provenance: "UNVERIFIED" },
  }), /provenance/);
  assert.throws(() => verifiedCorStudentSex(cor, {
    ...records, account: { ...account, sex: "Other" },
  }), /sex value is invalid/);
});

test("official COR sex lookup accepts a matching confirmed institutional student only", () => {
  const cor = {
    official: true, enrollment_id: "enrollment-one", term_id: "TERM-2026-1",
    student_number: "24-10022", student_name: "Ana Reyes Jr.",
  };
  const registration = {
    id: "enrollment-one", student_id: "profile-two", term_id: "TERM-2026-1",
    status: "CONFIRMED",
  };
  const profile = {
    id: "profile-two", user_id: "account-two", student_number: "24-10022",
    record_kind: "INSTITUTIONAL", is_synthetic_demo: false,
  };
  const account = {
    id: "account-two", role_code: "student", full_name: "Ana Reyes Jr.",
    is_synthetic_demo: false, sex: "Female",
  };
  const records = { registration, profile, account };
  assert.equal(verifiedCorStudentSex(cor, records), "Female");
  assert.equal(verifiedCorStudentSex(cor, { ...records,
    account: { ...account, sex: null },
  }), null);
  assert.throws(() => verifiedCorStudentSex(cor, {
    ...records, registration: { ...registration, status: "DRAFT" },
  }), /could not be verified/);
  assert.throws(() => verifiedCorStudentSex(cor, {
    ...records, profile: { ...profile, record_kind: "PROJECT_ONLY" },
  }), /could not be verified/);
});

test("COR PDF prints the verified Sex field without changing the canonical name or suffix", async () => {
  const name = "Miguel Antonio Rafael Garcia Jr.";
  const code = "P8F26-BSIT-T03-M1";
  const cor = {
    simulation_only: true, official: false, certificate_of_official_registration: false,
    registration_status: "CONFIRMED FOR PROJECT SIMULATION", registration_snapshot_complete: true,
    simulation_id: "sex-pdf", confirmed_at: "2026-10-29T08:30:00+08:00",
    registered_units: 3, academic_year: "2026 to 2027", semester: "First Semester",
    student: { student_number: "25-50001", student_name: name, program_code: "BSIT",
      home_block: "BSIT-2A", year_level: 2 },
    registered_subjects: [{ subject_code: code, subject_name: "Data Structures",
      academic_units: 3, section_id: "section-one" }],
    registered_schedule: [{ subject_code: code, day_of_week: 1,
      start_time: "08:00", end_time: "10:00" }],
  };
  for (const sex of ["Male", "Female", null]) {
    const model = buildVerifiedCorDocument(cor, { studentSex: sex });
    assert.equal(model.studentName, name);
    assert.equal(model.studentName.match(/Jr\./g)?.length, 1);
    assert.equal(model.sex, sex || "Not recorded");
    const pdfText = decodedPdfText(await renderVerifiedCorPdf(model));
    assert.ok(pdfText.includes("Sex"), "the PDF includes the Student Information Sex label");
    assert.ok(pdfText.includes(model.sex),
      "the PDF prints the resolved sex or its unknown-value placeholder");
    assert.equal(pdfText.split("Jr.").length - 1, 1,
      "the PDF prints the complete canonical suffix exactly once");
  }
  assert.match(accessSource, /loadCorStudentSex\(admin, cor\)/);
  assert.match(accessSource, /\.eq\("id", registration\.student_id\)/);
});

function decodedPdfContent(pdf) {
  const text = pdf.toString("latin1");
  return [...text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      } catch {
        return "";
      }
    }).join("\n");
}

function decodedPdfText(pdf) {
  // PDFKit may split a word into separately kerned hex runs inside one TJ.
  // Decode those runs together so rendered words remain readable in tests.
  return [...decodedPdfContent(pdf).matchAll(/\[([^\]]+)\]\s*TJ/g)]
    .map((match) => [...match[1].matchAll(/<([0-9a-f]+)>/gi)]
      .map((item) => Buffer.from(item[1], "hex").toString("latin1")).join(""))
    .join("\n");
}

function assertPdfSubjectCode(pdf, displayCode, internalCode) {
  const content = decodedPdfContent(pdf);
  assert.match(content, new RegExp(Buffer.from(displayCode).toString("hex"), "i"),
    `PDF must print the canonical academic subject code ${displayCode}`);
  assert.doesNotMatch(content, new RegExp(Buffer.from(internalCode).toString("hex"), "i"),
    "PDF must not display its internal P8F26 subject key");
}

test("Student and Registrar demonstration COR default preview and PDF use CS 151, retaining the original key", async () => {
  const code = "P8F26-BSCS-T02-M1";
  const cor = {
    simulation_only: true, official: false, certificate_of_official_registration: false,
    registration_status: "CONFIRMED FOR PROJECT SIMULATION", registration_snapshot_complete: true,
    simulation_id: "project-registration-001", confirmed_at: "2026-10-29T08:30:00+08:00",
    registered_units: 3, academic_year: "2025 to 2026", semester: "Second Semester",
    student: {
      student_number: "25-01001", student_name: "Verified Student",
      program_code: "BSCS", home_block: "BSCS-2A", year_level: 2,
    },
    registered_subjects: [{
      subject_code: code, subject_name: "Example Computing Subject",
      section_id: "confirmed-section-1", academic_units: 3,
    }],
    registered_schedule: [{
      subject_code: code, day_of_week: 2, start_time: "08:00", end_time: "11:00",
      room: "Room 201", professor: "Fictional Demonstration Instructor",
    }],
  };
  const original = structuredClone(cor);
  const preview = buildVerifiedCorDocument(cor);
  assert.equal(preview.subjects[0].displayCode, "CS 151");
  assert.equal(preview.subjects[0].code, code);
  assert.equal(preview.subjects[0].meetings[0].subject_code, code);
  assert.deepEqual(cor, original, "formatting must not modify the confirmed registration snapshot");
  assertPdfSubjectCode(await renderVerifiedCorPdf(preview), "CS 151", code);
});

test("Student and Registrar official COR also display academic subject codes without changing registered keys", async () => {
  const general = "P8F26-GE-T02-2";
  const major = "P8F26-BSCS-T02-M1";
  const official = {
    official: true, status: "OFFICIALLY ENROLLED", ready_to_print: true,
    schedule_complete: true, registration_reference_complete: true,
    confirmed_at: "2026-10-29T09:00:00+08:00",
    student_number: "25-01001", student_name: "Verified Student",
    program_name: "Bachelor of Science in Computer Science", year_level: 2,
    home_block: "BSCS-2A", confirmation_reference: "OFFICIAL-2026-1",
    subjects: [general, major].map((subject_code, index) => ({
      subject_code, subject_name: `Verified Subject ${index + 1}`,
      section_id: `confirmed-section-${index + 1}`, units: 3,
    })),
    schedule: [general, major].map((subject_code, index) => ({
      subject_code, day_of_week: index + 1, start_time: "08:00", end_time: "10:00",
      room: "Room 201",
    })),
  };
  const original = structuredClone(official);
  const document = buildVerifiedCorDocument(official, {
    academicYear: "2025 to 2026", semester: "Second Semester",
  });
  assert.deepEqual(document.subjects.map((subject) => subject.displayCode), ["GE 152", "CS 151"]);
  assert.deepEqual(document.subjects.map((subject) => subject.code), [general, major]);
  assert.deepEqual(official, original);
  const pdf = await renderVerifiedCorPdf(document);
  assertPdfSubjectCode(pdf, "GE 152", general);
  assertPdfSubjectCode(pdf, "CS 151", major);
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
