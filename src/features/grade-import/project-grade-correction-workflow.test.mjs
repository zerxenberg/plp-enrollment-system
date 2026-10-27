import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

// Parse the actual UI and server-action contracts. These regression checks
// never invoke privileged actions or write to the live database. Atomic
// version checks/audit writes remain the protected PostgreSQL RPC's job.
const dir = new URL("./", import.meta.url);
const actionPaths = {
  ac: new URL("project-grade-correction-review-actions.js", dir),
  registrar: new URL("registrar-project-grade-actions.js", dir),
};
const uiPaths = {
  ac: new URL("../../components/academic-coordinator/AcademicCoordinatorAcademicReview.js", dir),
  registrar: new URL("RegistrarProjectGradeWorkspace.js", dir),
};

function sourceAt(path) {
  assert.ok(existsSync(path), `Protected correction contract file is missing: ${path.pathname}`);
  return readFileSync(path, "utf8");
}

function moduleAt(path) {
  return parse(sourceAt(path), { sourceType: "module", plugins: ["jsx"] });
}

function nodes(node, accept, found = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) nodes(item, accept, found);
    return found;
  }
  if (accept(node)) found.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (!["loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(key) &&
        value && typeof value === "object") nodes(value, accept, found);
  }
  return found;
}

function calleeName(callee) {
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression") {
    const property = callee.computed ? callee.property?.value : callee.property?.name;
    const owner = calleeName(callee.object);
    return owner && property ? `${owner}.${property}` : property;
  }
  if (callee?.type === "OptionalMemberExpression") return calleeName({ ...callee, type: "MemberExpression" });
  return null;
}

function calls(node) {
  return nodes(node, (item) => ["CallExpression", "OptionalCallExpression"].includes(item.type));
}

function callsNamed(node, name) {
  return calls(node).filter((call) => calleeName(call.callee)?.split(".").at(-1) === name);
}

function stringLiterals(node) {
  return new Set(nodes(node, (item) => item.type === "StringLiteral").map((item) => item.value));
}

function names(node) {
  return new Set(nodes(node, (item) => item.type === "Identifier").map((item) => item.name));
}

function exportedAction(ast, name) {
  const declaration = ast.program.body.find((item) =>
    item.type === "ExportNamedDeclaration" &&
    item.declaration?.type === "FunctionDeclaration" &&
    item.declaration.id?.name === name)?.declaration;
  assert.ok(declaration?.async, `${name} must remain an exported async server action`);
  return declaration;
}

function serverModule(path) {
  const ast = moduleAt(path);
  assert.equal(ast.program.directives[0]?.value.value, "use server", `${path.pathname} must be server-only`);
  return ast;
}

function rpcCalls(node, rpcName) {
  return callsNamed(node, "rpc").filter((call) =>
    call.arguments[0]?.type === "StringLiteral" && call.arguments[0].value === rpcName);
}

function payloadKeys(rpcCall) {
  const payload = rpcCall?.arguments[1];
  if (payload?.type !== "ObjectExpression") return new Set();
  return new Set(payload.properties.filter((item) => item.type === "ObjectProperty")
    .map((item) => item.key.name ?? item.key.value));
}

function invokesCorrectRole(ast, action, role) {
  const gate = callsNamed(action, "requireRole").find((call) =>
    call.arguments[0]?.value === role);
  if (gate) return gate.start < Math.min(...callsNamed(action, "rpc").map((item) => item.start), action.end);
  // Registrar operations use projectWorkspace(), which performs the role check
  // before returning an authenticated client and verified project scope.
  const helpers = ast.program.body.filter((item) => item.type === "FunctionDeclaration");
  return callsNamed(action, "projectWorkspace").length > 0 && helpers.some((fn) =>
    fn.id?.name === "projectWorkspace" &&
    callsNamed(fn, "requireRole").some((call) => call.arguments[0]?.value === role));
}

function hasNoOfficialWrites(action) {
  const directTableWrites = calls(action).filter((call) => {
    if (!["update", "insert", "upsert", "delete"].includes(calleeName(call.callee)?.split(".").at(-1))) {
      return false;
    }
    const sqlTable = callsNamed(call.callee, "from").find((from) =>
      ["academic_results", "academic_result_revisions", "enrollments", "enrollment_subjects"]
        .includes(from.arguments[0]?.value));
    return Boolean(sqlTable);
  });
  assert.equal(directTableWrites.length, 0, "correction actions must never modify official academic records");
  assert.equal(callsNamed(action, "publishProjectGradeBlock").length, 0,
    "decisions and cancellations never trigger block publication");
  assert.equal(callsNamed(action, "publishRegistrarGradeImport").length, 0,
    "decisions and cancellations never publish official grades");
  assert.equal(callsNamed(action, "createAdminClient").length, 0,
    "correction mutations must use the role-bound transactional RPC, not a service-role bypass");
}

function mockedAction(path, actionName, dependencies) {
  const src = sourceAt(path);
  const action = exportedAction(moduleAt(path), actionName);
  const scope = { ...dependencies, revalidatePath: dependencies.revalidatePath || (() => {}) };
  const code = src.slice(action.start, action.end);
  runInNewContext(`${code}\nthis.invoke = ${actionName};`, scope);
  return scope.invoke;
}

const REQUEST_ID = "5ea148d4-aa66-44e9-b9a0-e814a63a0d44";

function acActionHarness({ authorized = true, rpcResult = {
  data: { decision_status: "APPLIED", official_records_unchanged: true,
    review_reference: "PRJ-AC-TEST" }, error: null,
} } = {}) {
  const events = [];
  const invoke = mockedAction(actionPaths.ac, "decideProjectGradeCorrection", {
    requireRole: async (role) => {
      events.push(`role:${role}`);
      if (!authorized) throw new Error("Unauthorized");
    },
    createClient: async () => ({ rpc: async (name, payload) => {
      events.push({ name, payload });
      return rpcResult;
    } }),
    trim: (value) => String(value ?? "").trim(),
    VALID_DECISIONS: new Set(["APPROVE_IMPORTED", "REJECT_IMPORTED"]),
    revalidatePath: (path) => events.push(`invalidate:${path}`),
  });
  return { invoke, events };
}

test("runtime AC action rejects wrong role and invalid decision/reason/evidence before RPC", async () => {
  const denied = acActionHarness({ authorized: false });
  await assert.rejects(denied.invoke(REQUEST_ID, "APPROVE_IMPORTED",
    "Independent grade evidence is verified", "EVIDENCE-1"), /Unauthorized/);
  assert.deepEqual(denied.events, ["role:academic-coordinator"]);

  const { invoke, events } = acActionHarness();
  for (const inputs of [
    [REQUEST_ID, "INVALID", "An independently documented finding", "SOURCE-1"],
    [REQUEST_ID, "APPROVE_IMPORTED", "short", "SOURCE-1"],
    [REQUEST_ID, "REJECT_IMPORTED", "An independently documented finding", "  "],
    ["not-a-uuid", "APPROVE_IMPORTED", "An independently documented finding", "SOURCE-1"],
  ]) {
    const result = await invoke(...inputs);
    assert.equal(result.ok, false);
  }
  assert.equal(events.filter((event) => typeof event === "object").length, 0,
    "no protected RPC runs for invalid review input");
});

test("runtime AC requires audited SQL result and correct APPLIED/REJECTED status", async () => {
  for (const response of [
    { data: null, error: { code: "42501" } },
    { data: { decision_status: "APPLIED", official_records_unchanged: false,
      review_reference: "REF" } },
    { data: { decision_status: "REQUESTED", official_records_unchanged: true,
      review_reference: "REF" } },
    { data: { decision_status: "APPLIED", official_records_unchanged: true,
      review_reference: "  " } },
  ]) {
    const { invoke, events } = acActionHarness({ rpcResult: response });
    const result = await invoke(REQUEST_ID, "APPROVE_IMPORTED",
      "An independently documented finding", "SOURCE-1");
    assert.equal(result.ok, false, "SQL response must not be promoted to success");
    assert.equal(events.some((item) => typeof item === "string" &&
      item.startsWith("invalidate:")), false,
    "failed decisions cannot invalidate routes as though approved");
  }
  const rejected = acActionHarness({ rpcResult: {
    data: { decision_status: "REJECTED", official_records_unchanged: true,
      review_reference: "PRJ-AC-REJECTION" }, error: null,
  } });
  assert.equal((await rejected.invoke(REQUEST_ID, "REJECT_IMPORTED",
    "The imported source cannot be substantiated", "SOURCE-1")).ok, true);
  assert.equal(rejected.events.filter((item) => typeof item === "object").length, 1);
});

function registrarCancelHarness({ requests = [{ source_row_id: "row-1", status: "REJECTED" }],
  rpcResponse = { data: { status: "CANCELLED", official_records_unchanged: true,
    audit_reference: "PRJ-CANCEL-TEST" }, error: null },
  authorized = true } = {}) {
  const events = [];
  const batch = {
    id: "batch-1", block_id: "correct-block", term_id: "TERM-2025-2",
    status: "CONFLICT_REVIEW", source_system: "PROJECT_ONLY",
    rows: [{ id: "row-1", validation_status: "CONFLICT" }],
    correctionRequests: requests,
  };
  const invoke = mockedAction(actionPaths.registrar, "cancelProjectGradeBatch", {
    projectWorkspace: async () => {
      events.push("role:registrar");
      if (!authorized) throw new Error("Unauthorized");
      return { data: { batches: [batch] }, client: { rpc: async (name, payload) => {
        events.push({ name, payload });
        return rpcResponse;
      } } };
    },
    normalize: (value) => String(value ?? "").trim(),
    CURRENT_BLOCK_ID: "correct-block",
    HISTORY_TERM_ID: "TERM-2025-2",
    revalidatePath: (path) => events.push(`invalidate:${path}`),
    failure: () => ({ ok: false, message: "Protected operation failed" }),
  });
  return { invoke, events };
}

test("runtime Registrar cannot cancel pending or unreviewed conflicts, or omit a reason", async () => {
  for (const requests of [
    [],
    [{ source_row_id: "row-1", status: "REQUESTED" }],
    [{ source_row_id: "row-1", status: "APPLIED" }],
    [{ source_row_id: "row-1", status: "UNDER_REVIEW" }],
  ]) {
    const { invoke, events } = registrarCancelHarness({ requests });
    assert.equal((await invoke("batch-1", "Conflicting source replacement is documented")).ok, false);
    assert.equal(events.some((item) => typeof item === "object"), false,
      "Registrar cancellation never invokes its RPC while AC review is unresolved");
  }
  const empty = registrarCancelHarness();
  assert.equal((await empty.invoke("batch-1", "  ")).ok, false);
  assert.equal(empty.events.some((item) => typeof item === "object"), false);
});

test("runtime Registrar requires auditable CANCELLED confirmation, never publishes implicitly", async () => {
  for (const rpcResponse of [
    { data: null, error: { code: "42501" } },
    { data: { status: "CANCELLED", official_records_unchanged: false,
      audit_reference: "REF" } },
    { data: { status: "CONFLICT_REVIEW", official_records_unchanged: true,
      audit_reference: "REF" } },
    { data: { status: "CANCELLED", official_records_unchanged: true,
      audit_reference: "" } },
  ]) {
    const { invoke, events } = registrarCancelHarness({ rpcResponse });
    const result = await invoke("batch-1", "The evidence was rejected; replace this source");
    assert.equal(result.ok, false);
    assert.equal(events.filter((item) => typeof item === "object").length, 1);
    assert.ok(events.some((item) => typeof item === "object" &&
      item.name === "registrar_project_grade_cancel_batch_v1"));
    assert.equal(events.some((item) => typeof item === "string" &&
      item.startsWith("invalidate:")), false);
  }
  const successful = registrarCancelHarness();
  const result = await successful.invoke("batch-1", "The evidence was rejected; replace this source");
  assert.equal(result.ok, true);
  assert.equal(result.data.status, "CANCELLED");
  assert.equal(successful.events.filter((item) => typeof item === "object").length, 1,
    "a successful cancellation calls only its cancel RPC, not publication");
});

test("AC correction read and decision actions are server-only and Academic-Coordinator authorized", () => {
  const ast = serverModule(actionPaths.ac);
  const load = exportedAction(ast, "loadProjectGradeCorrectionReviews");
  const decide = exportedAction(ast, "decideProjectGradeCorrection");
  assert.ok(invokesCorrectRole(ast, load, "academic-coordinator"), "AC review loading must be AC-only");
  assert.ok(invokesCorrectRole(ast, decide, "academic-coordinator"), "AC grade decisions must be AC-only");
  assert.equal(callsNamed(decide, "projectWorkspace").length, 0,
    "AC decision must not reuse the Registrar role-gated project workspace");
});

test("AC decision accepts only explicitly approved/rejected imports with reason and evidence", () => {
  const ast = serverModule(actionPaths.ac);
  const decide = exportedAction(ast, "decideProjectGradeCorrection");
  // A fixed module-level Set referenced by VALID_DECISIONS.has is safer than
  // reconstructing an allowlist for every action invocation.
  const allowed = stringLiterals(ast);
  assert.ok(allowed.has("APPROVE_IMPORTED") && allowed.has("REJECT_IMPORTED"),
    "AC action must explicitly allowlist approve/reject imported-grade decisions");
  assert.ok(callsNamed(decide, "has").some((call) =>
    calleeName(call.callee)?.includes("VALID_DECISIONS")),
  "AC decision must check both selections against the explicit decision allowlist");
  const identifiers = names(decide);
  assert.ok(identifiers.has("reason") || identifiers.has("justification"));
  assert.ok(identifiers.has("evidenceReference") || identifiers.has("evidence"));
  assert.ok(nodes(decide, (item) => item.type === "NumericLiteral" && item.value >= 8).length > 0,
    "nontrivial reason/evidence bounds must be checked before the RPC");
  assert.ok(callsNamed(decide, "trim").length || callsNamed(decide, "normalize").length,
    "blank whitespace-only evidence and reasons cannot pass through unchecked");
});

test("AC decision submits the exact protected RPC arguments and checks its response", () => {
  const decide = exportedAction(serverModule(actionPaths.ac), "decideProjectGradeCorrection");
  const rpc = rpcCalls(decide, "academic_coordinator_project_grade_decide_v1");
  assert.equal(rpc.length, 1, "exactly one protected atomic AC decision RPC is invoked");
  assert.deepEqual([...payloadKeys(rpc[0])].sort(), [
    "p_decision", "p_evidence_reference", "p_reason", "p_request_id",
  ]);
  const output = stringLiterals(decide);
  assert.ok(output.has("APPLIED") && output.has("REJECTED"),
    "only verified terminal AC decision statuses may be accepted");
  const identifiers = names(decide);
  assert.ok(identifiers.has("official_records_unchanged"),
    "AC result must prove official grade records were untouched");
  assert.ok(identifiers.has("review_reference"),
    "AC decision must return the independently audited review reference");
  hasNoOfficialWrites(decide);
});

test("AC review reads original/proposed grade versions and source checksum for evidence review", () => {
  const load = exportedAction(serverModule(actionPaths.ac), "loadProjectGradeCorrectionReviews");
  const selects = callsNamed(load, "select").map((call) => call.arguments[0]?.value || "").join(",");
  for (const required of [
    "previous_grade", "previous_status", "proposed_grade", "proposed_status",
    "source_checksum", "source_row_id",
  ]) {
    // Source version checks in the SQL RPC must use the original snapshot.
    assert.ok(selects.includes(required), `${required} must be available for review/version checks`);
  }
  const ui = moduleAt(uiPaths.ac);
  const readable = new Set([...names(ui), ...stringLiterals(ui)]);
  for (const required of ["previous_grade", "proposed_grade", "previous_status", "proposed_status", "source_checksum"]) {
    assert.ok(readable.has(required), `AC review should expose ${required} rather than only the requested new value`);
  }
});

test("Registrar cancellation is role-gated and only calls its project-specific atomic RPC", () => {
  const ast = serverModule(actionPaths.registrar);
  const cancel = exportedAction(ast, "cancelProjectGradeBatch");
  assert.ok(invokesCorrectRole(ast, cancel, "registrar"),
    "Registrar role must be required before canceling any grade batch");
  const rpc = rpcCalls(cancel, "registrar_project_grade_cancel_batch_v1");
  assert.equal(rpc.length, 1, "cancel must invoke the protected transactional RPC exactly once");
  assert.deepEqual([...payloadKeys(rpc[0])].sort(), ["p_batch_id", "p_reason"]);
  assert.ok(callsNamed(cancel, "trim").length || callsNamed(cancel, "normalize").length,
    "cancellation reason is required and normalized");
  hasNoOfficialWrites(cancel);
});

test("Registrar cancel response must verify CANCELLED, official-data invariance, and audit receipt", () => {
  const cancel = exportedAction(serverModule(actionPaths.registrar), "cancelProjectGradeBatch");
  assert.ok(stringLiterals(cancel).has("CANCELLED"), "only CANCELLED is an accepted successful status");
  const checked = names(cancel);
  assert.ok(checked.has("official_records_unchanged"), "must reject any uncertain official-data status");
  assert.ok(checked.has("audit_reference"), "must require an auditable cancellation reference");
  assert.ok(nodes(cancel, (item) => item.type === "NumericLiteral" && item.value >= 15).length > 0,
    "cancellation reason must have a minimum length");
});

test("Registrar cancellation checks conflict-row and REJECTED version before RPC, without changing history", () => {
  const cancel = exportedAction(serverModule(actionPaths.registrar), "cancelProjectGradeBatch");
  const values = stringLiterals(cancel);
  for (const required of ["CONFLICT_REVIEW", "CONFLICT", "REJECTED", "REQUESTED", "PROJECT_ONLY"]) {
    assert.ok(values.has(required), `${required} must guard Registrar source replacement`);
  }
  const used = names(cancel);
  for (const identifier of ["source_row_id", "validation_status", "correctionRequests"]) {
    assert.ok(used.has(identifier), `${identifier} must be cross-checked before cancellation`);
  }
  assert.equal(callsNamed(cancel, "remove").length, 0,
    "cancelling a conflicting source never deletes its persisted history");
});

test("AC review UI only exposes REQUESTED decisions with explicit confirmation and evidence", () => {
  const ast = moduleAt(uiPaths.ac);
  const all = stringLiterals(ast);
  assert.ok(all.has("APPROVE_IMPORTED") && all.has("REJECT_IMPORTED"),
    "AC UI exposes both legal decisions");
  const used = names(ast);
  for (const item of ["loadProjectGradeCorrectionReviews", "decideProjectGradeCorrection",
    "gradeReviewReason", "gradeReviewEvidence", "gradeReviewConfirmed"]) {
    assert.ok(used.has(item), `${item} must remain wired in AC review UI`);
  }
  assert.ok(all.has("REQUESTED") || used.has("gradeReviewPending"),
    "only pending protected requests may be reviewed");
  assert.equal(callsNamed(ast, "cancelProjectGradeBatch").length, 0,
    "AC must not be able to cancel Registrar grade import batches");
});

test("Registrar UI offers explicit cancellation only after rejection, without bypassing review", () => {
  const ast = moduleAt(uiPaths.registrar);
  const all = stringLiterals(ast);
  const used = names(ast);
  assert.ok(used.has("cancelProjectGradeBatch"), "cancel action is reachable from Registrar UI");
  assert.ok(used.has("selectedCorrectionState") || all.has("REJECTED"),
    "cancellation must be conditioned on reviewed and rejected conflicts");
  assert.ok(callsNamed(ast, "confirm").length > 0,
    "cancelling a historical source requires an explicit confirmation dialog");
  assert.ok(used.has("cancellationReason"), "Registrar supplies independent cancellation reason");
  assert.equal(callsNamed(ast, "decideProjectGradeCorrection").length, 0,
    "Registrar must not have direct AC decision controls");
});
