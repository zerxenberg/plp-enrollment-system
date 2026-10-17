/**
 * Read-only inventory of the exact Phase 3A Coordinator fixture manifest.
 * Reports missing/ambiguous relationships without fabricating matching rows.
 * Official Supabase counts are compared in the separately recorded SQL audit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const manifest = JSON.parse(readFileSync("docs/phase-3a-fixture-manifest.json", "utf8"));
const sha = createHash("sha256").update(JSON.stringify(manifest.records)).digest("hex");
if (sha !== manifest.sourceSha256) throw new Error("Fixture source hash differs. Refuse to audit.");
const groups = {};
for (const [parent, value] of Object.entries(manifest.records)) {
  if (Array.isArray(value)) groups[parent] = value;
  else for (const [child, entries] of Object.entries(value)) {
    if (Array.isArray(entries)) groups[`${parent}.${child}`] = entries;
  }
}
const keyOf = (record, index) => String(record?.id || record?.code ||
  record?.reference || record?.studentNumber || `row_${index}`);
// The archive's immutable row key prefers `id`; relationship fields often
// use the business code instead (e.g. subject IT001 vs id subject-it001).
// Validate every reference against both recorded aliases, never invent keys.
const keys = Object.fromEntries(Object.entries(groups).map(([group, entries]) =>
  [group, new Set(entries.flatMap((item, index) =>
    [keyOf(item, index), item.code, item.studentNumber].filter(Boolean).map(String)))]));

const relationalRules = [
  ["blockPlanning.assignments", "studentId", "blockPlanning.students"],
  ["blockPlanning.assignments", "sectionId", "blockPlanning.blockSections"],
  ["blockPlanning.subjectClasses", "sectionId", "blockPlanning.blockSections"],
  ["blockPlanning.subjectClasses", "subjectCode", "blockPlanning.subjects"],
  ["blockPlanning.subjectClasses", "professorId", "blockPlanning.professors"],
  ["blockPlanning.classMeetings", "subjectClassId", "blockPlanning.subjectClasses"],
  ["blockPlanning.classMeetings", "roomId", "blockPlanning.rooms"],
  ["blockPlanning.blockSections", "termId", "blockPlanning.terms"],
  ["blockPlanning.blockSections", "programCode", "blockPlanning.programs"],
  ["blockPlanning.blockSections", "curriculumId", "blockPlanning.curricula"],
  ["blockPlanning.students", "programCode", "blockPlanning.programs"],
  ["blockPlanning.students", "curriculumId", "blockPlanning.curricula"],
  ["blockPlanning.curricula", "program", "blockPlanning.programs"],
  ["academicCoordinatorCurricula", "program", "academicCoordinatorCatalog.programs"],
];

const references = relationalRules.map(([group, field, parent]) => {
  let total = 0;
  let resolved = 0;
  const examples = [];
  for (const [index, record] of groups[group].entries()) {
    const value = record[field];
    if (value == null || value === "") continue;
    total++;
    if (keys[parent].has(String(value))) resolved++;
    else if (examples.length < 5) examples.push({
      sourceKey: keyOf(record, index), field, missingValue: value,
    });
  }
  return { group, field, target: parent, total, resolved, missing: total - resolved, examples };
});

const sourceCounts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
const sourceTotal = Object.values(sourceCounts).reduce((sum, n) => sum + n, 0);
const originalRegistrar = JSON.parse(readFileSync("src/data/mock/registrar.json", "utf8"));
const report = {
  classification: "SYNTHETIC_DEVELOPMENT_ONLY",
  sourceSha256: sha,
  sourceTotal,
  groups: sourceCounts,
  relations: references,
  missingRelationships: references.reduce((sum, row) => sum + row.missing, 0),
  sourceLimitations: {
    "blockPlanning.history": "Zero pristine records",
    academicCoordinatorActivityExamples: "Two hardcoded academic history examples exist in DemoDataProvider.js, but were not in the Phase 3A archive",
    registrarAcademicReviewExample: originalRegistrar.enrollments
      .filter((row) => row.status === "NEEDS_ACADEMIC_REVIEW" || row.academicReviewDecision)
      .map((row) => ({ reference: row.reference, status: row.status })),
    reportTypes: "Five calculated reports, not independently stored mock report rows",
  },
};
if (process.argv.includes("--write")) {
  writeFileSync("docs/phase-3b-mock-reconciliation.json", JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
if (report.missingRelationships) process.exitCode = 2;
