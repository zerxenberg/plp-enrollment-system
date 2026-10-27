export function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  return String(value);
}

export function titleStatus(value) {
  if (!value) return "Not available";
  return String(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function downloadCsv(rows, filename) {
  if (typeof window === "undefined") return;
  const safeRows = rows?.length ? rows : [{ message: "No records" }];
  const headings = Object.keys(safeRows[0]);
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [
    headings.map(escape).join(","),
    ...safeRows.map((row) => headings.map((heading) => escape(row[heading])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}


export function registrarDebug(level, area, message, details = null) {
  if (typeof window === "undefined") return;
  const normalizedLevel = String(level || "info").toLowerCase();
  const method = ["error", "warn", "info", "debug"].includes(normalizedLevel)
    ? normalizedLevel
    : "info";
  const label = `[Registrar][${area || "General"}][${method.toUpperCase()}]`;
  if (details === null || details === undefined) {
    console[method](`${label} ${message}`);
  } else {
    console[method](`${label} ${message}`, details);
  }
}

export function registrarResultDebug(result, area = "Action") {
  if (typeof window === "undefined" || !result) return;
  // Expected, safely returned action refusals are not runtime exceptions.
  // Next.js development overlays console.error calls even for valid
  // fail-closed validations such as a missing COR registration snapshot.
  const level = result.ok ? "info" : "warn";
  const label = `[Registrar][${result.debug?.scope || area}][${level.toUpperCase()}]`;
  console.groupCollapsed(`${label} ${result.message || "Registrar action result"}`);
  if (result.debug) console[level]("Technical details", result.debug);
  if (result.data?.blocking_issues || result.data?.blockingIssues) {
    console.info("Validation details", result.data.blocking_issues || result.data.blockingIssues);
  }
  if (result.data?.results) console.info("Batch result details", result.data.results);
  if (!result.debug && !result.data) console[level](result);
  console.groupEnd();
}

export function registrarSafeMessage(message, ok = false) {
  const value = String(message || "").trim();
  if (!value) return ok ? "Action completed." : "The action could not be completed.";
  const technical = /supabase|postgrest|database|schema|rpc|row level|\brls\b|sql|relation|function public\.|jwt|uuid|grade_import_|public\.|service role|backend|project_only|p8f26|checksum|batch id/i;
  if (!technical.test(value)) return value;
  return ok
    ? "Action completed."
    : "The action could not be completed. Please try again or contact the system administrator if the problem continues.";
}
