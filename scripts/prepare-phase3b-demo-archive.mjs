/**
 * Turns the pristine, approved Phase 3A fixture JSON into deterministic,
 * idempotent SQL batches for academic_demo.fixture_records.
 *
 * Only a PostgreSQL database operator should execute these files after
 * validating target, backup and migration 007. Do not place the archive in
 * official program, student, staff, curriculum or grade tables.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const source = JSON.parse(readFileSync(
  path.join(process.cwd(), "docs", "phase-3a-fixture-manifest.json"), "utf8",
));
const records = source.records;
const digest = (obj) => createHash("sha256")
  .update(typeof obj === "string" ? obj : JSON.stringify(obj)).digest("hex");
if (digest(records) !== source.sourceSha256) {
  throw new Error("Source fixture has changed. Abort import and review the source.");
}

const all = [];
for (const [parent, value] of Object.entries(records)) {
  const groups = Array.isArray(value) ? [[parent, value]] :
    value && typeof value === "object"
      ? Object.entries(value).filter(([, list]) => Array.isArray(list))
        .map(([child, list]) => [`${parent}.${child}`, list])
      : [];
  for (const [group, entries] of groups) {
    const seen = new Set();
    for (let index = 0; index < entries.length; index++) {
      const payload = entries[index];
      const rawId = payload?.id || payload?.code || payload?.reference ||
        payload?.studentNumber || `row_${index}`;
      const sourceKey = String(rawId);
      if (seen.has(sourceKey)) {
        throw new Error(`Ambiguous duplicated source key in ${group}: ${sourceKey}`);
      }
      seen.add(sourceKey);
      all.push({
        source_group: group,
        source_key: sourceKey,
        payload_sha256: digest(payload),
        source_payload: payload,
      });
    }
  }
}
const outputDir = path.join(process.cwd(), "supabase", "seed", ".phase3b-archive-batches");
const batches = [];
let current = [];
const maxChars = 75000;
for (const record of all) {
  const next = JSON.stringify(record);
  if (next.includes("$fixture_payload$")) {
    throw new Error("Reserved SQL string delimiter found in source record.");
  }
  if (current.length && JSON.stringify(current).length + next.length > maxChars) {
    batches.push(current);
    current = [];
  }
  current.push(record);
}
if (current.length) batches.push(current);

if (process.argv.includes("--write")) {
  mkdirSync(outputDir, { recursive: true });
  for (let i = 0; i < batches.length; i++) {
    const filename = `${String(i + 1).padStart(4, "0")}.sql`;
    const json = JSON.stringify(batches[i]);
    // No SQL from source strings is ever executed: all contents are data
    // inside a distinct, guarded PostgreSQL dollar-quoted JSONB literal.
    const sql = `INSERT INTO academic_demo.fixture_records
  (source_sha256,source_group,source_key,payload_sha256,source_payload)
SELECT '${source.sourceSha256}', r.source_group, r.source_key,
  r.payload_sha256, r.source_payload
FROM jsonb_to_recordset($fixture_payload$${json}$fixture_payload$::jsonb)
  AS r(source_group text,source_key text,payload_sha256 text,source_payload jsonb)
ON CONFLICT (source_sha256,source_group,source_key) DO NOTHING;
`;
    writeFileSync(path.join(outputDir, filename), sql);
  }
}

console.log(JSON.stringify({
  sourceSha256: source.sourceSha256,
  totalRows: all.length,
  sqlBatches: batches.length,
  batchesWritten: process.argv.includes("--write"),
  bySourceGroup: Object.fromEntries(
    [...new Set(all.map((r) => r.source_group))].map((group) =>
      [group, all.filter((r) => r.source_group === group).length]),
  ),
}, null, 2));
