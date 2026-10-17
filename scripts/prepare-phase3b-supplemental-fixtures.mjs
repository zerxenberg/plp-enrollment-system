/**
 * Extract only the exact original supplemental sources missing from Phase 3A:
 * Registrar mock enrollment cases, two Coordinator sample history events,
 * and the original generated demonstration subject offerings.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const registrar = JSON.parse(readFileSync("src/data/mock/registrar.json", "utf8"));
const catalog = JSON.parse(readFileSync("src/data/mock/catalog.json", "utf8"));
const source = readFileSync("src/features/demo-data/DemoDataProvider.js", "utf8");
const start = source.indexOf("  history: [", source.indexOf("const ACADEMIC_COORDINATOR_INITIAL_DATA"));
const end = start === -1 ? -1 : source.indexOf("\n  ],", start);
if (start < 0 || end < 0) throw new Error("Original history literal was not found.");
const literal = source.slice(start + "  history: ".length, end + "\n  ]".length);
const history = runInNewContext(literal, Object.create(null), { timeout: 1000 });
if (!Array.isArray(history) || history.length !== 2) {
  throw new Error("Original Coordinator history source changed: manual review required.");
}
const offerings = catalog.subjects.map((item, index) => ({
  id: `OFF-${item.code}`,
  academicTerm: "First Semester 2026 to 2027",
  program: "BSIT",
  curriculum: "BSIT Curriculum 2024",
  subjectCode: item.code,
  subjectName: item.name,
  yearLevel: item.yearLevel,
  semester: item.semester,
  status: index < 6 ? "Active" : "Planned",
  plannedSections: index < 4 ? 2 : 1,
}));
const groups = {
  "registrar.enrollments": registrar.enrollments,
  "academicCoordinator.history": history,
  "academicCoordinator.offerings": offerings,
};
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = hash(groups);
const records = Object.entries(groups).flatMap(([source_group, items]) =>
  items.map((source_payload) => ({
    source_group,
    source_key: String(source_payload.id || source_payload.reference),
    payload_sha256: hash(source_payload),
    source_payload,
  })));
if (records.length !== 17) throw new Error("Supplemental fixture count changed unexpectedly.");
const contents = JSON.stringify(records);
if (contents.includes("$original_demo$")) throw new Error("SQL payload delimiter conflict.");
const sql = `-- Generated from original mock source, SHA-256: ${digest}
INSERT INTO academic_demo.supplemental_records
 (source_sha256,source_group,source_key,payload_sha256,source_payload)
SELECT '${digest}',r.source_group,r.source_key,r.payload_sha256,r.source_payload
FROM jsonb_to_recordset($original_demo$${contents}$original_demo$::jsonb)
 AS r(source_group text,source_key text,payload_sha256 text,source_payload jsonb)
ON CONFLICT (source_sha256,source_group,source_key) DO NOTHING;
`;
if (process.argv.includes("--write")) {
  writeFileSync("supabase/seed/phase3b-original-supplemental.sql", sql);
}
console.log(JSON.stringify({ sourceSha256: digest, groups:
  Object.fromEntries(Object.entries(groups).map(([name, items]) => [name, items.length])),
  total: records.length, written: process.argv.includes("--write") }, null, 2));
