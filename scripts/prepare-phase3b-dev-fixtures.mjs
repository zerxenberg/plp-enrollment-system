/**
 * Prepare a deterministic development-only crosswalk from the pristine Phase 3A
 * reference fixture. This file never accesses Supabase and never publishes grades.
 *
 * Usage: node scripts/prepare-phase3b-dev-fixtures.mjs
 *        node scripts/prepare-phase3b-dev-fixtures.mjs --write
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureFile = path.join(root, "docs", "phase-3a-fixture-manifest.json");
const output = path.join(root, "supabase", "seed", "development-academic-fixtures.json");
const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
const records = fixture.records;
const devOnly = "SYNTHETIC_DEVELOPMENT_ONLY";

const digest = createHash("sha256").update(JSON.stringify(records)).digest("hex");
if (digest !== fixture.sourceSha256) {
  throw new Error("Fixture checksum mismatch. Preserve and review the source before processing.");
}

// RFC 4122 name-based version 5 UUIDs with a fixed local namespace. Stable
// across repeated preparations; IDs are not derived from private credentials.
const namespace = Buffer.from("e30d5903502d4fb6b2892702fbc96d83", "hex");
function fixtureUuid(entity, key) {
  const hash = createHash("sha1").update(namespace).update(`plp-fixture:${entity}:${key}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function tagged(entity, item, sourceId) {
  return {
    fixture_id: fixtureUuid(entity, String(sourceId)),
    source_key: String(sourceId),
    provenance: devOnly,
    source_payload: item,
  };
}
const model = {
  programs: records.academicCoordinatorCatalog.programs.map((record) => ({
    ...tagged("programs", record, record.code),
    code: record.code,
    name: record.name,
    organizational_unit_source_key: record.departmentId,
    status: String(record.status).toUpperCase(),
  })),
  organizational_units: records.academicCoordinatorCatalog.departments.map((record) => ({
    ...tagged("organizational_units", record, record.id),
    code: record.id,
    name: record.name,
  })),
  subjects: records.academicCoordinatorCatalog.subjects.map((record) => ({
    ...tagged("subjects", record, record.code),
    code: record.code,
    name: record.name,
    units: record.units,
    status: String(record.status || "Active").toUpperCase(),
  })),
  curricula: records.academicCoordinatorCurricula.map((record) => ({
    ...tagged("curricula", record, record.id),
    code: record.id,
    program_code: record.program,
    program_track_label: record.major || null,
    version_label: record.version,
    effective_academic_year: record.effectiveAcademicYear,
    status: String(record.status || "Draft").toUpperCase(),
  })),
  curriculum_subjects: records.academicCoordinatorCurricula.flatMap((curriculum) =>
    (curriculum.assignments || []).map((record) => ({
      ...tagged("curriculum_subjects", record, `${curriculum.id}:${record.subjectCode}`),
      curriculum_code: curriculum.id,
      subject_code: record.subjectCode,
      year_level: record.yearLevel,
      semester: record.semester,
    }))),
  subject_prerequisites: records.academicCoordinatorCurricula.flatMap((curriculum) =>
    (curriculum.assignments || []).flatMap((record) =>
      (record.prerequisites || []).map((prerequisiteCode) => ({
        ...tagged("subject_prerequisites", { ...record, prerequisiteCode },
          `${curriculum.id}:${record.subjectCode}:${prerequisiteCode}`),
        curriculum_code: curriculum.id,
        subject_code: record.subjectCode,
        prerequisite_subject_code: prerequisiteCode,
      })))),
  academic_terms: records.blockPlanning.terms.map((record) => ({
    ...tagged("academic_terms", record, record.id),
    source_term_code: record.id,
  })),
  block_sections: records.blockPlanning.blockSections.map((record) => ({
    ...tagged("block_sections", record, record.id),
    code: record.code,
    source_term_code: record.termId,
    program_code: record.programCode,
    curriculum_code: record.curriculumId,
    year_level: record.yearLevel,
    capacity: record.capacity,
    planning_status: record.status,
  })),
  proposed_block_rosters: records.blockPlanning.assignments.map((record) => ({
    ...tagged("block_student_assignments", record, record.id),
    source_student_key: record.studentId,
    source_block_key: record.sectionId,
    source_term_code: record.termId,
    status: record.status,
  })),
  synthetic_students: records.blockPlanning.students.map((record) => ({
    ...tagged("synthetic_students", record, record.id),
    // Never map these invented people to live student_profiles or auth.users.
    program_code: record.programCode,
    source_curriculum_code: record.curriculumId,
  })),
  block_subject_classes: records.blockPlanning.subjectClasses.map((record) => ({
    ...tagged("subject_classes", record, record.id),
    source_block_key: record.sectionId,
    source_term_code: record.termId,
    subject_code: record.subjectCode,
    source_professor_key: record.professorId,
  })),
  class_meetings: records.blockPlanning.classMeetings.map((record) => ({
    ...tagged("class_meetings", record, record.id),
    source_subject_class_key: record.subjectClassId,
    day: record.day,
    start_time: record.start,
    end_time: record.end,
    source_room_key: record.roomId,
  })),
  synthetic_instructors: records.blockPlanning.professors.map((record) => ({
    ...tagged("synthetic_instructors", record, record.id),
    display_name: record.name,
  })),
  synthetic_rooms: records.blockPlanning.rooms.map((record) => ({
    ...tagged("synthetic_rooms", record, record.id),
    room_code: record.name,
  })),
};

for (const [table, entries] of Object.entries(model)) {
  const keys = entries.map((entry) => entry.fixture_id);
  if (keys.length !== new Set(keys).size) {
    throw new Error(`Duplicate deterministic fixture UUID in ${table}`);
  }
}

const summaries = Object.fromEntries(
  Object.entries(model).map(([table, entries]) => [table, entries.length]),
);
console.log(JSON.stringify({ provenance: devOnly, sourceSha256: digest, counts: summaries }, null, 2));

if (process.argv.includes("--write")) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({
    classification: devOnly,
    warning: "Synthetic fixture, never seed official student, grades, staff or enrollment tables.",
    sourceSha256: digest,
    records: model,
  }, null, 2) + "\n");
  console.log(`Wrote ${path.relative(root, output)}`);
}
