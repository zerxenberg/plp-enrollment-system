// Read-only Academic Coordinator history queries. The caller supplies its
// authenticated, RLS-bound Supabase client and checks the current role.
export const ACADEMIC_HISTORY_PAGE_SIZE = 25;
export const ACADEMIC_HISTORY_PREVIEW_SIZE = 100;
export const ACADEMIC_HISTORY_MODULES = Object.freeze([
  "Academic Setup", "Sections & Schedules", "Academic Review",
]);

const HISTORY_COLUMNS = [
  "id", "occurred_at", "actor_user_id", "actor_role_code", "module",
  "record_reference", "action", "previous_value", "new_value", "reason",
].join(",");
const SEARCH_COLUMNS = Object.freeze([
  "actor_role_code", "module", "record_reference", "action",
  "previous_value", "new_value",
]);

export function academicHistorySearchFilter(search) {
  const term = String(search ?? "").trim().slice(0, 80);
  if (!term) return "";
  // PostgREST logic expressions require quoting punctuation and escaping
  // wildcard characters so search text cannot change the filter structure.
  const escaped = term.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    .replace(/%/g, "\\%").replace(/_/g, "\\_");
  return SEARCH_COLUMNS.map((column) => `${column}.ilike."%${escaped}%"`).join(",");
}

export function toAcademicHistoryRow(row) {
  return {
    id: row.id,
    dateTime: row.occurred_at,
    coordinator: row.actor_user_id
      ? (row.actor_role_code || "Authenticated Staff")
      : (row.actor_role_code || "System / Unattributed"),
    module: row.module,
    record: row.record_reference,
    action: row.action,
    previousValue: row.previous_value || "",
    newValue: row.new_value || "",
    reason: row.reason || "",
  };
}

function applyHistorySearch(query, filter) {
  return filter ? query.or(filter) : query;
}

export async function queryAcademicHistoryPage(client, { page = 1, search = "" } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw new Error("Invalid academic history page.");
  }
  const filter = academicHistorySearchFilter(search);
  const firstRow = (page - 1) * ACADEMIC_HISTORY_PAGE_SIZE;
  const dataQuery = applyHistorySearch(
    client.from("academic_change_history")
      .select(HISTORY_COLUMNS, { count: "exact" })
      .in("module", ACADEMIC_HISTORY_MODULES),
    filter,
  ).order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(firstRow, firstRow + ACADEMIC_HISTORY_PAGE_SIZE - 1);

  const countQueries = ACADEMIC_HISTORY_MODULES.map((module) => applyHistorySearch(
    client.from("academic_change_history")
      .select("id", { count: "exact", head: true })
      .eq("module", module),
    filter,
  ));

  const [pageResult, ...countResults] = await Promise.all([dataQuery, ...countQueries]);
  if (pageResult.error || countResults.some((result) => result.error)) {
    throw new Error("Unable to load authorized academic history.");
  }

  const byModule = Object.fromEntries(ACADEMIC_HISTORY_MODULES.map(
    (module, index) => [module, countResults[index].count ?? 0],
  ));
  return {
    rows: (pageResult.data || []).map(toAcademicHistoryRow),
    total: pageResult.count ?? 0,
    byModule,
  };
}
