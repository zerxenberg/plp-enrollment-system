/**
 * Generate sample official grades spreadsheets for the Registrar frontend demo.
 *
 * Run: node scripts/generate-grade-test-files.cjs
 * Requires the project's xlsx dependency.
 */
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const OUTPUT_DIR = path.join(__dirname, "..", "tests", "grade-import");

// Keep the exact order and capitalization used by the upload contract.
const HEADERS = [
  "student_number",
  "student_full_name",
  "subject_code",
  "academic_year",
  "semester",
  "section_code",
  "grade_value",
  "completion_status",
  "source_record_reference",
  "Subject_name",
];

const TERM = {
  subject_code: "IT204",
  academic_year: "2025 to 2026",
  semester: "Second Semester",
  section_code: "CTC 205",
  Subject_name: "Object Oriented Programming",
};

function gradeRow(student_number, student_full_name, grade_value, completion_status, source_record_reference, overrides = {}) {
  return {
    student_number,
    student_full_name,
    ...TERM,
    grade_value,
    completion_status,
    source_record_reference,
    ...overrides,
  };
}

const validRows = [
  gradeRow("2024-00123", "Juan Dela Cruz", "1.75", "COMPLETED", "MOCK-IT204-2026-V001"),
  gradeRow("2026-01896", "Katrina Mendoza", "5.00", "FAILED", "MOCK-IT204-2026-V002"),
  gradeRow("2026-00108", "Dencie Aquino", "INC", "INCOMPLETE", "MOCK-IT204-2026-V003"),
];

// One explicitly identified defect per invalid row, apart from the intended
// duplicate pair. References stay unique so row errors are easy to recognize.
const invalidRows = [
  gradeRow("2099-99999", "Unknown Test Student", "1.75", "COMPLETED", "MOCK-IT204-2026-E001"),
  gradeRow("2024-00123", "Juan Dela Cruz", "1.75", "COMPLETED", "MOCK-IT204-2026-E002", {
    subject_code: "IT999",
    Subject_name: "Unknown Subject",
  }),
  gradeRow("2026-01896", "Katrina Mendoza", "5.00", "FAILED", "MOCK-IT204-2026-E003", {
    semester: "First Semester",
  }),
  gradeRow("2026-00108", "Dencie Aquino", "INC", "INCOMPLETE", "MOCK-IT204-2026-E004"),
  gradeRow("2026-00108", "Dencie Aquino", "INC", "INCOMPLETE", "MOCK-IT204-2026-E005"),
  gradeRow("2024-00123", "Juan Dela Cruz", "1.75", "PASSED", "MOCK-IT204-2026-E006"),
  gradeRow("2026-01896", "Katrina Mendoza", "5.00", "FAILED", "MOCK-IT204-2026-E007", {
    section_code: "",
  }),
];

function writeFixture(filename, records, description) {
  const matrix = [
    HEADERS,
    ...records.map((record) => HEADERS.map((header) => record[header] ?? "")),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);

  // Excel can otherwise reinterpret student numbers or drop the trailing
  // zero in 5.00; text cells keep all user-facing test values unchanged.
  for (const cell of Object.values(worksheet)) {
    if (cell && typeof cell === "object" && "v" in cell) {
      cell.t = "s";
      cell.v = String(cell.v);
      cell.z = "@";
    }
  }

  worksheet["!cols"] = [
    { wch: 21 }, // student_number
    { wch: 24 }, // student_full_name
    { wch: 16 }, // subject_code
    { wch: 20 }, // academic_year
    { wch: 22 }, // semester
    { wch: 16 }, // section_code
    { wch: 16 }, // grade_value
    { wch: 22 }, // completion_status
    { wch: 32 }, // source_record_reference
    { wch: 35 }, // Subject_name
  ];
  worksheet["!autofilter"] = { ref: `A1:J${Math.max(matrix.length, 2)}` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Official Grades");
  workbook.Props = {
    Title: description,
    Subject: "Synthetic test data for official student grades import",
    Author: "PLP Enrollment System Demo",
  };

  const target = path.join(OUTPUT_DIR, filename);
  XLSX.writeFile(workbook, target, { bookType: "xlsx", compression: true });
  const file = fs.readFileSync(target);
  if (file[0] !== 0x50 || file[1] !== 0x4b) {
    throw new Error(`Generated workbook is not a ZIP-backed XLSX file: ${target}`);
  }

  const parsed = XLSX.read(file, { type: "buffer" });
  const parsedSheet = parsed.Sheets[parsed.SheetNames[0]];
  const parsedMatrix = XLSX.utils.sheet_to_json(parsedSheet, { header: 1, defval: "", raw: true });
  if (
    JSON.stringify(parsedMatrix[0]) !== JSON.stringify(HEADERS) ||
    parsedMatrix.length !== matrix.length ||
    parsedMatrix.some((row, i) => JSON.stringify(row) !== JSON.stringify(matrix[i]))
  ) {
    throw new Error(`XLSX roundtrip verification failed for ${filename}`);
  }
  console.log(`Created ${path.relative(process.cwd(), target)} (${records.length} data rows)`);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
writeFixture(
  "PLP_Mock_Official_Student_Grades_Valid.xlsx",
  validRows,
  "PLP Official Student Grades Valid Mock Batch",
);
writeFixture(
  "PLP_Mock_Official_Student_Grades_Invalid.xlsx",
  invalidRows,
  "PLP Official Student Grades Invalid Mock Batch",
);
writeFixture(
  "PLP_Official_Grades_Import_Template.xlsx",
  [],
  "PLP Official Grades Import Blank Template",
);
