import test from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_GRADE_WORKSPACE_PERMISSION_CODE,
  PROJECT_GRADE_WORKSPACE_PERMISSION_MESSAGE,
  resolveProjectGradeWorkspaceContract,
  unwrapProjectGradeWorkspaceQuery,
} from "./project-grade-workspace-contract.mjs";

const VALID = { blocks: [{ id: "fixed-block" }], batches: [], releases: [], publicationAvailable: true };

test("missing workspace RPC PGRST202 uses the already role-checked scoped reader", async () => {
  let calls = 0;
  const data = await resolveProjectGradeWorkspaceContract({
    error: { code: "PGRST202", message: "function missing" }, data: null,
  }, async () => { calls += 1; return VALID; });
  assert.deepEqual(data, VALID);
  assert.equal(calls, 1);
});

test("PostgreSQL undefined-function error 42883 also uses scoped reader", async () => {
  const data = await resolveProjectGradeWorkspaceContract({
    error: { code: "42883" }, data: null,
  }, async () => VALID);
  assert.deepEqual(data, VALID);
});

test("missing project grade SELECT grant 42501 shows actionable safe diagnostic, not generic error", async () => {
  let passes = 0;
  const readFallback = async () => {
    passes += 1;
    unwrapProjectGradeWorkspaceQuery({
      data: null, error: { code: "42501", message: "permission denied for table project_grade_import_batches" },
    }, "Protected project grade batches");
  };
  await assert.rejects(
    resolveProjectGradeWorkspaceContract({ error: { code: "PGRST202" } }, readFallback),
    (error) => {
      assert.equal(error.code, PROJECT_GRADE_WORKSPACE_PERMISSION_CODE);
      assert.equal(error.message, PROJECT_GRADE_WORKSPACE_PERMISSION_MESSAGE);
      assert.doesNotMatch(error.message, /project_grade_import_batches|42501|SQL/i);
      return true;
    },
  );
  assert.equal(passes, 1);
});

test("valid role-bound workspace RPC response skips fallback entirely", async () => {
  let read = false;
  const data = await resolveProjectGradeWorkspaceContract({ data: VALID, error: null }, async () => {
    read = true;
    return VALID;
  });
  assert.deepEqual(data, VALID);
  assert.equal(read, false);
});

test("permission and other errors from a present RPC never fall through to admin", async () => {
  let read = false;
  const operation = resolveProjectGradeWorkspaceContract({
    error: { code: "42501", message: "Registrar authorization required" }, data: null,
  }, async () => { read = true; return VALID; });
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, "42501");
    assert.equal(error.message, "Registrar authorization required");
    return true;
  });
  assert.equal(read, false);
});

test("malformed workspace contract fails closed, including malformed admin fallback", async () => {
  await assert.rejects(resolveProjectGradeWorkspaceContract({ data: { blocks: [] }, error: null },
    async () => VALID), /Invalid protected project grade workspace response/);
  await assert.rejects(resolveProjectGradeWorkspaceContract({ error: { code: "PGRST202" } },
    async () => ({ batches: [], blocks: [], releases: null })), /Invalid protected project grade workspace response/);
});
