import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "../supabase/migrations/20261023141000_coordinator_project_curriculum_trigger_branch_fix.sql"),
  "utf8",
);

const subjectStart = migration.indexOf("IF TG_TABLE_NAME = 'subjects' THEN");
const curriculaStart = migration.indexOf("ELSIF TG_TABLE_NAME = 'curricula' THEN");
const placementStart = migration.indexOf("ELSIF TG_TABLE_NAME = 'curriculum_subjects' THEN");
const prerequisiteStart = migration.indexOf("ELSIF TG_TABLE_NAME = 'subject_prerequisites' THEN");
const unsupportedTable = migration.indexOf("Unexpected project curriculum guard table");

test("branch fix is additive and retains the applied guard function and trigger identity", () => {
  assert.match(migration, /BEGIN;\s*SET LOCAL lock_timeout = '3s';/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.coordinator_protect_project_curriculum_v1\(\)/);
  assert.match(migration, /RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''/);
  assert.doesNotMatch(migration, /\b(?:CREATE|DROP) TRIGGER\b/i);
  assert.doesNotMatch(migration, /\bALTER FUNCTION\b/i);
  assert.match(migration, /NOTIFY pgrst, 'reload schema';\s*COMMIT;/);
});

test("each table branches before OLD/NEW record field access", () => {
  assert.ok(subjectStart < curriculaStart &&
    curriculaStart < placementStart &&
    placementStart < prerequisiteStart &&
    prerequisiteStart < unsupportedTable);
  const subjectBranch = migration.slice(subjectStart, curriculaStart);
  const curriculaBranch = migration.slice(curriculaStart, placementStart);
  const curriculumSubjectBranch = migration.slice(placementStart, prerequisiteStart);
  const prerequisiteBranch = migration.slice(prerequisiteStart, unsupportedTable);
  assert.match(subjectBranch, /TG_OP = 'UPDATE' OR TG_OP = 'DELETE'/);
  assert.match(subjectBranch, /OLD\.code/);
  assert.doesNotMatch(subjectBranch, /(?:OLD|NEW)\.curriculum_code/);
  assert.match(curriculaBranch, /IF TG_OP = 'UPDATE' THEN[\s\S]+ELSIF TG_OP = 'DELETE' THEN/);
  assert.match(curriculaBranch, /OLD\.code/);
  assert.match(curriculaBranch, /NEW\.code/);
  assert.doesNotMatch(curriculaBranch, /(?:OLD|NEW)\.curriculum_code/);
  assert.match(curriculumSubjectBranch, /IF TG_OP = 'INSERT' THEN[\s\S]+ELSIF TG_OP = 'UPDATE' THEN[\s\S]+ELSIF TG_OP = 'DELETE' THEN/);
  assert.match(curriculumSubjectBranch, /NEW\.curriculum_code/);
  assert.match(curriculumSubjectBranch, /OLD\.curriculum_code/);
  assert.doesNotMatch(curriculumSubjectBranch, /(?:OLD|NEW)\.code\b/);
  assert.match(prerequisiteBranch, /IF TG_OP = 'INSERT' THEN[\s\S]+ELSIF TG_OP = 'UPDATE' THEN[\s\S]+ELSIF TG_OP = 'DELETE' THEN/);
  assert.match(prerequisiteBranch, /NEW\.prerequisite_subject_code/);
  assert.doesNotMatch(prerequisiteBranch, /(?:OLD|NEW)\.code\b/);
  assert.match(migration, /Unexpected project curriculum guard table/);
});

test("protected values fail closed while importer replay stays idempotent", () => {
  assert.match(migration, /A project simulation subject master cannot be changed/);
  assert.match(migration, /Project simulation subjects cannot be placed in institutional curricula/);
  assert.match(migration, /protected_subject\.subject_code = NEW\.subject_code/);
  assert.match(migration, /destination\.curriculum_code = NEW\.curriculum_code/);
  assert.match(migration, /Project simulation curriculum and its academic rules are immutable/);
  assert.match(migration, /p\.curriculum_code IN \(v_old_code, v_new_code\)/);
  assert.match(migration, /c\.curriculum_code = NEW\.curriculum_code\s+AND c\.subject_code = NEW\.subject_code/);
  assert.match(migration, /p\.prerequisite_subject_code = NEW\.prerequisite_subject_code/);
  assert.match(migration, /IF TG_OP = 'DELETE' THEN\s+RETURN OLD;/);
  assert.match(migration, /USING ERRCODE = '42501'/);
});
