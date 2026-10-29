import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

// Exercise the production server loader directly with role and PostgREST
// dependencies mocked. These tests never read/write a live student record.
const source = readFileSync(new URL("./project-grade-correction-review-actions.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
const declaration = ast.program.body.find((node) =>
  node.type === "ExportNamedDeclaration" &&
  node.declaration?.id?.name === "loadProjectGradeCorrectionReviews")?.declaration;
assert.ok(declaration?.async, "Production Academic Coordinator review loader must be exported and async");

const componentSource = readFileSync(new URL("../../components/academic-coordinator/AcademicCoordinatorAcademicReview.js", import.meta.url), "utf8");
const componentAST = parse(componentSource, { sourceType: "module", plugins: ["jsx"] });

function findNodes(node, accepts, matches = []) {
  if (!node || typeof node !== "object") return matches;
  if (Array.isArray(node)) {
    for (const entry of node) findNodes(entry, accepts, matches);
    return matches;
  }
  if (accepts(node)) matches.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "extra", "comments", "leadingComments", "trailingComments"].includes(key)) continue;
    if (value && typeof value === "object") findNodes(value, accepts, matches);
  }
  return matches;
}

function memberProperty(node) {
  return node?.type === "MemberExpression" && !node.computed ? node.property?.name : null;
}

const BLOCK_ID = "456b850d-3241-505f-a718-f35ff3ce4be1";
const COHORT = "PLP_PROJECT_600_2026_1";
const HISTORICAL_TERM = "TERM-2025-2";
const BATCH_ID = "37371c3f-9c4e-48ba-9330-1bf47a0d6482";
const ROW_ID = "e6c68054-8500-48af-b9b9-a0e2d8118e12";
const REQUEST_ID = "b611138f-0fa4-4fb5-9da7-c140096007a5";

function makeData() {
  return {
    project_grade_import_batches: [{
      id: BATCH_ID, block_id: BLOCK_ID, target_term_id: "TERM-2026-1",
      term_id: HISTORICAL_TERM, previous_block_code: "BSIT-1A",
      subject_code: "P8F26-BSIT-T02-M1",
      source_reference: "HISTORICAL-SOURCE-001", file_name: "BSIT-source.xlsx",
      source_checksum: "a".repeat(64), status: "CONFLICT_REVIEW",
    }],
    project_grade_correction_requests: [{
      id: REQUEST_ID, batch_id: BATCH_ID, source_row_id: ROW_ID,
      previous_grade: 2.75, previous_status: "COMPLETED",
      proposed_grade: 2.5, proposed_status: "COMPLETED",
      reason: "Source document grade differs from existing project record",
      requested_by: "registrar-app-user-id", requested_at: "2026-10-26T00:00:00+00:00",
      status: "REQUESTED", reviewed_at: null, review_reference: null,
    }],
    project_grade_import_rows: [{
      id: ROW_ID, batch_id: BATCH_ID, source_student_number: "25-50001",
      source_record_reference: "SOURCE-ROW-1", validation_status: "CONFLICT",
    }],
  };
}

function mockServiceTables({ data = makeData(), errors = {}, roleAllowed = true } = {}) {
  const calls = [];
  let serviceInitialized = false;

  function query(table) {
    const call = { table, columns: "", eq: [], in: [], order: [], ranges: [] };
    calls.push(call);
    const builder = {
      select: (columns) => { call.columns = columns; return builder; },
      eq: (field, value) => { call.eq.push([field, value]); return builder; },
      in: (field, values) => { call.in.push([field, values]); return builder; },
      order: (field, opts) => { call.order.push([field, opts]); return builder; },
      range: (start, end) => { call.ranges.push([start, end]); return builder; },
      then: (resolve, reject) => Promise.resolve({
        data: data[table] ?? [], error: errors[table] || null,
      }).then(resolve, reject),
    };
    return builder;
  }

  const dependencies = {
    CURRENT_BLOCK_ID: BLOCK_ID, PROJECT_COHORT: COHORT, HISTORICAL_TERM,
    readProjectReviewPages: async (queryFactory) => {
      const { data: rows, error } = await queryFactory().range(0, 499);
      if (error) throw error;
      return rows || [];
    },
    readProjectReviewChunks: async (ids, queryFactory) => {
      const { data: rows, error } = await queryFactory(ids).range(0, 499);
      if (error) throw error;
      return rows || [];
    },
    requireRole: async (role) => {
      calls.push({ role });
      if (!roleAllowed) throw new Error("Academic Coordinator authorization denied");
    },
    createAdminClient: () => {
      calls.push({ serviceRoleReader: true });
      serviceInitialized = true;
      return { from: query };
    },
  };
  runInNewContext(`${source.slice(declaration.start, declaration.end)}\nthis.loader = loadProjectGradeCorrectionReviews;`, dependencies);
  return { load: dependencies.loader, calls, get serviceInitialized() { return serviceInitialized; } };
}

test("authorized Academic Coordinator sees project-scoped REQUESTED records across academic blocks", async () => {
  const scenario = mockServiceTables();
  const result = await scenario.load();
  assert.equal(result.ok, true);
  assert.equal(result.data.requests.length, 1);
  const request = result.data.requests[0];
  assert.equal(request.status, "REQUESTED");
  assert.equal(request.id, REQUEST_ID);
  assert.equal(request.student_number, "25-50001");
  assert.equal(request.subject_code, "P8F26-BSIT-T02-M1");
  assert.equal(request.current_block_id, BLOCK_ID);
  assert.equal(request.historical_term_id, HISTORICAL_TERM);
  assert.equal(request.previous_block_code, "BSIT-1A");
  assert.equal(request.batch_status, "CONFLICT_REVIEW");
  assert.equal(request.source_validation_status, "CONFLICT");
  assert.equal(request.source_checksum, "a".repeat(64));

  const operations = scenario.calls.filter((call) => call.table);
  assert.deepEqual(operations.map((call) => call.table), [
    "project_grade_import_batches", "project_grade_correction_requests", "project_grade_import_rows",
  ]);
  assert.deepEqual(operations[0].eq, [
    ["project_cohort_id", COHORT], ["source_system", "PROJECT_ONLY"],
  ]);
  assert.deepEqual(operations[0].ranges[0], [0, 499]);
  assert.equal(operations[1].in[0][0], "batch_id");
  assert.equal(operations[1].in[0][1][0], BATCH_ID);
  assert.deepEqual(operations[1].ranges[0], [0, 499]);
  assert.equal(operations[2].in[0][0], "id");
  assert.equal(operations[2].in[0][1][0], ROW_ID);
  assert.equal(scenario.calls[0].role, "academic-coordinator");
});

test("role authorization precedes creating service-role reader or reading protected records", async () => {
  const scenario = mockServiceTables({ roleAllowed: false });
  await assert.rejects(scenario.load(), /Academic Coordinator authorization denied/);
  assert.equal(scenario.serviceInitialized, false);
  assert.equal(scenario.calls.length, 1);
  assert.equal(scenario.calls[0].role, "academic-coordinator");
});

test("service_role SELECT denial on batches, requests, or source rows is a fail-closed error, never a zero queue", async () => {
  for (const table of [
    "project_grade_import_batches", "project_grade_correction_requests", "project_grade_import_rows",
  ]) {
    const scenario = mockServiceTables({ errors: {
      [table]: { code: "42501", message: `permission denied for table ${table}` },
    } });
    const result = await scenario.load();
    assert.equal(result.ok, false, `${table} permission failure must not masquerade as no pending cases`);
    assert.equal(result.data?.requests, undefined);
    assert.ok(typeof result.message === "string" && result.message.length > 0);
    assert.doesNotMatch(result.message, /42501|permission denied|project_grade_correction_requests/);
  }
});

test("no matching authorized batches safely returns an empty list without further protected reads", async () => {
  const data = makeData();
  data.project_grade_import_batches = [];
  const scenario = mockServiceTables({ data });
  const result = await scenario.load();
  assert.equal(result.ok, true);
  assert.equal(result.data.requests.length, 0);
  assert.equal(scenario.calls.filter((call) => call.table).length, 1);
});

test("no correction requests safely returns an empty list without a source-row read", async () => {
  const data = makeData();
  data.project_grade_correction_requests = [];
  const scenario = mockServiceTables({ data });
  const result = await scenario.load();
  assert.equal(result.ok, true);
  assert.equal(result.data.requests.length, 0);
  assert.equal(scenario.calls.filter((call) => call.table).length, 2);
});

test("loader excludes orphaned or cross-batch source rows rather than presenting an unverified decision", async () => {
  for (const mismatch of [
    { id: "wrong-source-row", batch_id: BATCH_ID },
    { id: ROW_ID, batch_id: "other-project-batch" },
  ]) {
    const data = makeData();
    data.project_grade_import_rows = [
      { ...data.project_grade_import_rows[0], ...mismatch },
    ];
    const result = await mockServiceTables({ data }).load();
    assert.equal(result.ok, true);
    assert.equal(result.data.requests.length, 0, "cross-source or cross-batch request must not be exposed");
  }
});

test("resolved requests are retained for review but never counted as REQUESTED", async () => {
  const data = makeData();
  data.project_grade_correction_requests.push({
    ...data.project_grade_correction_requests[0], id: "resolved-request-id",
    status: "REJECTED", reviewed_at: "2026-10-26T01:00:00+00:00",
  });
  const result = await mockServiceTables({ data }).load();
  assert.equal(result.ok, true);
  assert.equal(result.data.requests.length, 2);
  assert.equal(result.data.requests.filter((row) => row.status === "REQUESTED").length, 1);
});

test("AC count prefetches on mount and shows loading/error instead of an unfetched misleading zero", () => {
  const queueDeclaration = findNodes(componentAST, (node) => node.type === "VariableDeclarator" &&
    node.id?.type === "ArrayPattern" && node.id.elements[0]?.name === "gradeReviewQueue")[0];
  assert.ok(queueDeclaration, "protected correction count state must exist");
  const initialState = queueDeclaration.init?.arguments?.[0];
  const loading = initialState?.properties?.find((property) => property.key?.name === "loading")?.value;
  assert.equal(loading?.value, true, "before the first RPC, the count must explicitly be loading");

  const effects = findNodes(componentAST, (node) => node.type === "CallExpression" &&
    node.callee?.name === "useEffect");
  const fetchEffect = effects.find((effect) => findNodes(effect.arguments[0], (node) =>
    node.type === "CallExpression" && node.callee?.name === "loadProjectGradeCorrectionReviews").length);
  assert.ok(fetchEffect, "AC page must initiate protected grade review fetch");
  assert.equal(findNodes(fetchEffect.arguments[0], (node) => node.type === "Identifier" &&
    node.name === "view").length, 0,
  "loader may not wait for the user to select the correction tab before fetching its count");
  const dependencyNames = (fetchEffect.arguments[1]?.elements || []).map((node) => node.name);
  assert.ok(dependencyNames.includes("gradeReviewRefresh"), "manual refresh re-runs the count loader");

  const namedTab = findNodes(componentAST, (node) => node.type === "ObjectProperty" &&
    node.key?.name === "value" && node.value?.name === "PROJECT_GRADE_VIEW")[0];
  assert.ok(namedTab, "project grade corrections tab must remain selectable");
  const tabDefinition = findNodes(componentAST, (node) => node.type === "ObjectExpression" &&
    node.properties?.includes(namedTab))[0];
  const label = tabDefinition?.properties?.find((property) => property.key?.name === "label")?.value;
  assert.ok(label, "tab has an accessible count label");
  const loadingReferences = findNodes(label, (node) => memberProperty(node) === "loading" &&
    node.object?.name === "gradeReviewQueue");
  const errorReferences = findNodes(label, (node) => memberProperty(node) === "error" &&
    node.object?.name === "gradeReviewQueue");
  assert.ok(loadingReferences.length > 0, "tab count must distinguish pending fetch from verified zero");
  assert.ok(errorReferences.length > 0, "tab count must not imply zero when the protected fetch fails");
});
