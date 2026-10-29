import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

// Inspect and execute the actual server-action function bodies in an isolated
// context. All auth, database and RPC dependencies are injected test doubles;
// no Supabase credentials, network access or project records are modified.
const source = readFileSync(new URL("./registrar-project-grade-actions.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
const LEGACY_BLOCK = "456b850d-3241-505f-a718-f35ff3ce4be1";
const OTHER_BLOCK = "7be25ea7-bfd1-4ffd-ac0c-723bc7b2d581";
const HISTORICAL_TERM = "TERM-2025-2";
const CHECKSUM = "a".repeat(64);

const ROUTES = [
  ["stageProjectGradeFile", "registrar_project_grade_stage_v1",
    "registrar_project_grade_stage_dynamic_v1", "legacyBlock"],
  ["validateProjectGradeBatch", "registrar_project_grade_validate_v1",
    "registrar_project_grade_validate_dynamic_v1", "legacyBatch"],
  ["attestProjectGradeBatch", "registrar_project_grade_verify_v1",
    "registrar_project_grade_verify_dynamic_v1", "legacyBatch"],
  ["publishProjectGradeBlock", "registrar_project_grade_publish_block_v1",
    "registrar_project_grade_publish_dynamic_v1", null],
];

function descendants(node, predicate, matches = []) {
  if (node === null || typeof node !== "object") return matches;
  if (Array.isArray(node)) {
    for (const child of node) descendants(child, predicate, matches);
    return matches;
  }
  if (predicate(node)) matches.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (key !== "loc" && key !== "extra" && key !== "comments" &&
        key !== "leadingComments" && key !== "trailingComments" &&
        key !== "innerComments" && value && typeof value === "object") {
      descendants(value, predicate, matches);
    }
  }
  return matches;
}

function functionDeclaration(name) {
  const wrapper = ast.program.body.find((node) =>
    node.type === "ExportNamedDeclaration" &&
      node.declaration?.type === "FunctionDeclaration" &&
      node.declaration.id?.name === name);
  const declaration = wrapper?.declaration ||
    ast.program.body.find((node) =>
      node.type === "FunctionDeclaration" && node.id?.name === name);
  assert.ok(declaration, `Missing actual server function: ${name}`);
  return declaration;
}

function functionSource(name) {
  const node = functionDeclaration(name);
  return source.slice(node.start, node.end);
}

function rpcCalls(declaration) {
  return descendants(declaration, (node) =>
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === "client" &&
    node.callee.property?.name === "rpc");
}

function memberName(node) {
  return node?.type === "MemberExpression" &&
    node.object?.type === "Identifier" && node.property?.type === "Identifier"
    ? `${node.object.name}.${node.property.name}` : null;
}

function assertBlockIdentityCheck(node, member) {
  assert.equal(node?.type, "BinaryExpression");
  assert.equal(node.operator, "===");
  assert.equal(memberName(node.left), member);
  assert.equal(node.right?.name, "CURRENT_BLOCK_ID");
}

test("four exported Registrar actions select exact legacy/dynamic RPC names by server-verified block identity", () => {
  assert.equal(ast.program.directives[0]?.value.value, "use server");
  const workspace = functionDeclaration("projectWorkspace");
  const roleCheck = descendants(workspace, (node) => node.type === "CallExpression" &&
    node.callee?.name === "requireRole" && node.arguments[0]?.value === "registrar");
  assert.equal(roleCheck.length, 1, "workspace must require the Registrar role");

  for (const [actionName, legacyRpc, dynamicRpc, selector] of ROUTES) {
    const action = functionDeclaration(actionName);
    assert.equal(action.async, true);
    assert.ok(ast.program.body.some((node) =>
      node.type === "ExportNamedDeclaration" && node.declaration === action),
    `${actionName} must remain a server action export`);
    assert.ok(descendants(action, (node) => node.type === "CallExpression" &&
      node.callee?.name === "projectWorkspace").length ||
      actionName === "stageProjectGradeFile" &&
      descendants(action, (node) => node.type === "CallExpression" &&
        node.callee?.name === "prepareProjectUpload").length,
    `${actionName} must resolve trusted server-side project context`);
    const calls = rpcCalls(action);
    assert.equal(calls.length, 1, `${actionName} must have one authenticated RPC route`);
    const chosen = calls[0].arguments[0];
    assert.equal(chosen.type, "ConditionalExpression", `${actionName} must branch by block`);
    assert.equal(chosen.consequent.value, legacyRpc);
    assert.equal(chosen.alternate.value, dynamicRpc);
    if (selector) {
      assert.equal(chosen.test.type, "Identifier");
      assert.equal(chosen.test.name, selector);
      const variable = descendants(action, (node) => node.type === "VariableDeclarator" &&
        node.id?.name === selector);
      assert.equal(variable.length, 1);
      assertBlockIdentityCheck(variable[0].init,
        actionName === "stageProjectGradeFile" ? "block.id" :
          actionName === "validateProjectGradeBatch" ? "chosenBatch.block_id" :
            "selected.block_id");
    } else {
      assertBlockIdentityCheck(chosen.test, "block.id");
    }
  }
});

function harness(actionName, { legacy = false, rpcError = null, rpcData } = {}) {
  const blockId = legacy ? LEGACY_BLOCK : OTHER_BLOCK;
  const calls = [];
  const writes = [];
  const batchId = "staged-project-batch";
  const subjectCode = "P8F26-TEST-T02-M1";
  const block = {
    id: blockId, termId: HISTORICAL_TERM, currentTermId: "TERM-2026-1",
    curriculumCode: "P8F26-TEST-V1", code: "TEST-1A", release: null,
    subjects: [{ code: subjectCode, expected: [{ studentId: "student-1" }] }],
  };
  const batch = {
    id: batchId, block_id: blockId, term_id: HISTORICAL_TERM,
    source_system: "PROJECT_ONLY", subject_code: subjectCode,
    status: "READY_FOR_REVIEW", verified_at: "2026-10-29T00:00:00Z",
    source_reference: "DOCUMENT-EVIDENCE-001", source_checksum: CHECKSUM,
    row_count: 1, conflict_rows: 0,
    rows: [{ id: "row-1", validation_status: "ALREADY_PRESENT", canonical_result_id: "canonical-1" }],
  };
  const workspace = { publicationAvailable: true, blocks: [block], batches: [batch] };
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      return rpcError
        ? { data: null, error: { code: rpcError, message: "Unavailable SQL RPC" } }
        : { data: rpcData, error: null };
    },
  };
  const admin = {
    from(table) {
      writes.push(table);
      throw new Error(`Unexpected privileged service-role operation on ${table}`);
    },
  };
  const context = {
    CURRENT_BLOCK_ID: LEGACY_BLOCK,
    PROJECT_GRADE_WORKSPACE_PERMISSION_CODE: "42501",
    PROJECT_GRADE_WORKSPACE_PERMISSION_MESSAGE: "Project workspace access denied",
    normalize: (value) => String(value ?? "").trim(),
    key: (value) => String(value ?? "").trim().toUpperCase(),
    revalidatePath: (path) => calls.push({ revalidated: path }),
    prepareProjectUpload: async () => ({
      client, block, subject: block.subjects[0],
      parsed: { fileName: "source.csv", checksum: CHECKSUM, records: [{ source_row_number: 2 }] },
      preview: { invalidRows: 0, missingStudents: [], rowCount: 1, requiredRows: 1 },
    }),
    projectWorkspace: async () => ({ client, admin, actor: { id: "registrar" }, data: workspace }),
  };
  runInNewContext(
    `${functionSource("failure")}\n${functionSource(actionName)}\nthis.invoke = ${actionName};`,
    context,
  );
  const args = {
    stageProjectGradeFile: [{
      get: (key) => ({
        source_system: "PROJECT_ONLY", source_reference: "DOCUMENT-EVIDENCE-001",
        issuer: "Project Registrar",
      })[key],
    }],
    validateProjectGradeBatch: [batchId],
    attestProjectGradeBatch: [{
      batchId, sourceReference: batch.source_reference,
      checksum: CHECKSUM, method: "Independent evidence verification",
    }],
    publishProjectGradeBlock: [blockId, HISTORICAL_TERM, [batchId]],
  };
  return { invoke: () => context.invoke(...args[actionName]), calls, writes };
}

const successfulResponses = {
  stageProjectGradeFile: "staged-project-batch",
  validateProjectGradeBatch: { invalid_rows: 0, already_present: 1, conflict_rows: 0 },
  attestProjectGradeBatch: true,
  publishProjectGradeBlock: {
    record_source: "PROJECT_ONLY", expected_result_count: 1,
    accepted_rows: 1, publication_reference: "PROJECT-RELEASE-001",
  },
};

for (const [actionName, legacyRpc, dynamicRpc] of ROUTES) {
  test(`${actionName} executes the selected trusted RPC for legacy and new blocks`, async () => {
    for (const legacy of [true, false]) {
      const probe = harness(actionName, {
        legacy, rpcData: successfulResponses[actionName],
      });
      const result = await probe.invoke();
      assert.equal(result.ok, true, `${actionName} should accept its protected SQL response`);
      assert.deepEqual(probe.calls.filter((call) => call.name).map((call) => call.name),
        [legacy ? legacyRpc : dynamicRpc]);
      assert.equal(probe.writes.length, 0, "success must not perform service-role writes");
      if (actionName === "stageProjectGradeFile" ||
          actionName === "publishProjectGradeBlock") {
        assert.equal(probe.calls[0].payload.p_block_id, legacy ? LEGACY_BLOCK : OTHER_BLOCK);
        assert.equal(probe.calls[0].payload.p_term_id, HISTORICAL_TERM);
      } else {
        assert.equal(probe.calls[0].payload.p_batch_id, "staged-project-batch");
      }
    }
  });

  test(`${actionName} fails closed if a dynamic RPC is absent (both PostgREST and SQL codes)`, async () => {
    for (const code of ["PGRST202", "42883"]) {
      const probe = harness(actionName, { rpcError: code });
      const result = await probe.invoke();
      assert.equal(result.ok, false,
        `${actionName} must fail closed on missing dynamic RPC ${code}`);
      assert.match(result.message, /database contract is not installed/i);
      assert.deepEqual(probe.calls.filter((call) => call.name).map((call) => call.name),
        [dynamicRpc], "must not retry using the legacy RPC");
      assert.equal(probe.writes.length, 0, "must not fall back to unaudited service-role mutations");
      assert.equal(probe.calls.some((call) => call.revalidated), false,
        "failed operations must not revalidate a published result");
    }
  });
}

test("dynamic RPC failures other than missing-function errors never retry legacy or privileged writes", async () => {
  for (const [actionName, , dynamicRpc] of ROUTES) {
    const probe = harness(actionName, { rpcError: "23514" });
    const result = await probe.invoke();
    assert.equal(result.ok, false);
    assert.deepEqual(probe.calls.filter((call) => call.name).map((call) => call.name), [dynamicRpc]);
    assert.equal(probe.writes.length, 0);
  }
});

test("publish refuses malformed dynamic response even with complete verified roster", async () => {
  const probe = harness("publishProjectGradeBlock", {
    rpcData: {
      record_source: "PROJECT_ONLY", expected_result_count: 1,
      accepted_rows: 0, publication_reference: "PROJECT-RELEASE-001",
    },
  });
  const result = await probe.invoke();
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be verified/i);
  assert.equal(probe.writes.length, 0);
  assert.equal(probe.calls.some((call) => call.revalidated), false);
});
