import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261023153500_coordinator_provenance_service_read.sql", import.meta.url),
  "utf8",
);
const serverAction = readFileSync(
  new URL("../src/features/academic/coordinator-curriculum-provenance.js", import.meta.url),
  "utf8",
);

test("private curriculum provenance is readable only by the trusted Coordinator server action", () => {
  assert.match(migration, /GRANT SELECT ON TABLE public\.phase8_fictional_curriculum_provenance TO service_role;/);
  assert.doesNotMatch(migration, /GRANT\s+SELECT\b[^;]*\bTO\s+(?:authenticated|anon|PUBLIC)\b/i);
  assert.match(migration, /pg_catalog\.has_table_privilege\('anon'/);
  assert.match(migration, /pg_catalog\.has_table_privilege\('authenticated'/);
  assert.match(serverAction, /await requireRole\("academic-coordinator"\)/);
  assert.match(serverAction, /\.select\("curriculum_code,is_official,source_type"\)/);
});
