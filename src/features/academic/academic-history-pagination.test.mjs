import test from "node:test";
import assert from "node:assert/strict";
import {
  ACADEMIC_HISTORY_MODULES, ACADEMIC_HISTORY_PAGE_SIZE,
  academicHistorySearchFilter, queryAcademicHistoryPage, toAcademicHistoryRow,
} from "./academic-history-pagination.mjs";

function fakeRlsClient({ fail = false } = {}) {
  const queries = [];
  const moduleCounts = {
    "Academic Setup": 1200,
    "Sections & Schedules": 2300,
    "Academic Review": 300,
  };
  const client = {
    from(table) {
      assert.equal(table, "academic_change_history");
      const query = { table, calls: [] };
      queries.push(query);
      const builder = {
        select(columns, options) { query.columns = columns; query.options = options; return this; },
        in(column, values) { query.calls.push(["in", column, values]); return this; },
        eq(column, value) { query.calls.push(["eq", column, value]); return this; },
        or(filter) { query.calls.push(["or", filter]); return this; },
        order(column, options) { query.calls.push(["order", column, options]); return this; },
        range(from, to) { query.calls.push(["range", from, to]); return this; },
        then(onFulfilled, onRejected) {
          const scope = query.calls.find(([method]) => method === "eq")?.[2];
          const count = scope ? moduleCounts[scope] : 3800;
          const range = query.calls.find(([method]) => method === "range");
          const data = range ? Array.from({ length: Math.min(ACADEMIC_HISTORY_PAGE_SIZE, 3800 - range[1]) },
            (_, index) => ({
              id: `event-${range[1] + index}`,
              module: ACADEMIC_HISTORY_MODULES[0],
              occurred_at: "2026-10-22T04:00:00Z",
              actor_user_id: null, actor_role_code: null,
              action: "Updated", record_reference: "BSIT-2024",
            })) : null;
          return Promise.resolve({ data, count, error: fail ? { code: "42501" } : null })
            .then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  return { client, queries };
}

test("history query requests only one authorized 25-row page and exact scoped counts", async () => {
  const { client, queries } = fakeRlsClient();
  const result = await queryAcademicHistoryPage(client, { page: 3 });
  assert.equal(queries.length, 4);
  assert.equal(result.rows.length, ACADEMIC_HISTORY_PAGE_SIZE);
  assert.equal(result.rows[0].id, "event-50");
  assert.equal(result.total, 3800);
  assert.deepEqual(result.byModule, {
    "Academic Setup": 1200,
    "Sections & Schedules": 2300,
    "Academic Review": 300,
  });
  assert.deepEqual(queries[0].calls.find(([method]) => method === "in"),
    ["in", "module", ACADEMIC_HISTORY_MODULES]);
  assert.deepEqual(queries[0].calls.filter(([method]) => method === "order").map((entry) => entry[1]),
    ["occurred_at", "id"]);
  assert.deepEqual(queries[0].calls.find(([method]) => method === "range"), ["range", 50, 74]);
  for (const query of queries.slice(1)) {
    assert.equal(query.options.head, true);
    assert.equal(query.options.count, "exact");
  }
  assert.equal(result.rows[0].coordinator, "System / Unattributed");
});

test("search escapes PostgREST syntax and applies identical predicate to rows and counts", async () => {
  const { client, queries } = fakeRlsClient();
  const search = 'BSIT_42%"),module.eq.Evil';
  await queryAcademicHistoryPage(client, { search });
  const filters = queries.map((query) => query.calls.find(([method]) => method === "or")?.[1]);
  assert.equal(filters.length, 4);
  assert.ok(filters.every((filter) => filter === filters[0]));
  assert.ok(filters[0].includes('BSIT\\_42\\%\\\"),module.eq.Evil'));
  assert.equal(academicHistorySearchFilter("   "), "");
  assert.ok(academicHistorySearchFilter("x".repeat(200)).length < 700);
});

test("invalid pages and query failures fail closed", async () => {
  const { client, queries } = fakeRlsClient();
  for (const page of [0, -1, 1.5, "1", 10001, Number.POSITIVE_INFINITY]) {
    await assert.rejects(queryAcademicHistoryPage(client, { page }), /Invalid academic history page/);
  }
  assert.equal(queries.length, 0);
  const failed = fakeRlsClient({ fail: true });
  await assert.rejects(queryAcademicHistoryPage(failed.client), /Unable to load authorized academic history/);
});

test("mapping preserves existing staff attribution and field names", () => {
  assert.deepEqual(toAcademicHistoryRow({
    id: "a", occurred_at: "2026-10-22T00:00:00Z", actor_user_id: "a",
    actor_role_code: "academic-coordinator", module: "Academic Setup",
    record_reference: "BSIT", action: "Updated", previous_value: "A",
    new_value: "B", reason: "Corrected",
  }), {
    id: "a", dateTime: "2026-10-22T00:00:00Z",
    coordinator: "academic-coordinator", module: "Academic Setup",
    record: "BSIT", action: "Updated", previousValue: "A",
    newValue: "B", reason: "Corrected",
  });
});
