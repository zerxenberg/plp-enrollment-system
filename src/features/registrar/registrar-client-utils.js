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
