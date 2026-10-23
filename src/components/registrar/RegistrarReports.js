"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, DataTable, FilterControl, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";
import { Feedback, Metric, Tabs } from "./RegistrarShared";
import { displaySubjectCode, displayCurriculumCode } from "@/features/academic/project-academic-display-aliases.mjs";
import { loadRegistrarReports } from "@/features/reporting/registrar-reports-server";

const REPORTS = [
  "Enrollment Report", "Student Enrollment Report", "Enrollment Status Report",
  "Program Enrollment Report", "Section Capacity Report", "Academic Term Report",
];
const ALL = "ALL";
const choice = (value, label = value) => ({ value, label });
const groupRows = (rows, fields) => {
  const groups = new Map();
  for (const row of rows) {
    const key = fields.map((field) => String(row[field] ?? "")).join("|");
    if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(fields.map((field) => [field, row[field]])), students: 0 });
    groups.get(key).students += 1;
  }
  return [...groups.values()].sort((a, b) => b.students - a.students);
};
function exportCsv(rows, filename) {
  const columns = Object.keys(rows[0] || { message: "No matching records" });
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [columns.join(","), ...rows.map((row) => columns.map((key) => quote(row[key])).join(","))];
  const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function displayValue(key, value) {
  if (key === "subject" || key === "subjectCode") return displaySubjectCode(value);
  if (key === "curriculum") return displayCurriculumCode(value);
  return value ?? "";
}
function columnsFor(rows, fallback = []) {
  const keys = Object.keys(rows[0] || Object.fromEntries(fallback.map((item) => [item, ""])));
  return keys.filter((key) => key !== "id").map((key) => ({
    key, label: key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()),
    render: (row) => key === "status"
      ? <StatusBadge value={row.status} label={row.status.replaceAll("_", " ")} />
      : displayValue(key, row[key]),
  }));
}

export default function RegistrarReports() {
  const [result, setResult] = useState({ kind: "loading", records: [], sections: [], history: [] });
  const [view, setView] = useState("reports");
  const [report, setReport] = useState(REPORTS[0]);
  const [program, setProgram] = useState(ALL);
  const [term, setTerm] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [historySearch, setHistorySearch] = useState("");
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    loadRegistrarReports().then((data) => {
      if (active) { setResult(data); setPreview(false); }
    }).catch(() => {
      if (active) setResult({ kind: "unavailable", records: [], sections: [], history: [] });
    });
    return () => { active = false; };
  }, [refresh]);

  const records = result.records;
  const options = (field) => [
    choice(ALL, "All"),
    ...[...new Set(records.map((row) => row[field]).filter(Boolean))].sort().map((item) => choice(item, item)),
  ];
  const filtered = useMemo(() => records.filter((row) =>
    (source === ALL || row.source === source) &&
    (program === ALL || row.program === program) &&
    (term === ALL || row.term === term) &&
    (status === ALL || row.status === status)
  ), [records, program, term, source, status]);

  const sectionRows = useMemo(() => result.sections.filter((row) =>
    (source === ALL || row.source === source) &&
    (program === ALL || row.program === program) &&
    (term === ALL || row.term === term)
  ), [result.sections, source, program, term]);
  const reportRows = useMemo(() => {
    switch (report) {
      case "Student Enrollment Report":
        return filtered.map(({ studentNumber, studentName, studentType, classification, program, section, term, status, source }) =>
          ({ studentNumber, studentName, studentType, classification, program, section, term, status, source }));
      case "Enrollment Status Report":
        return groupRows(filtered, ["term", "status", "source"]);
      case "Program Enrollment Report":
        return groupRows(filtered, ["program", "term", "source"]);
      case "Section Capacity Report":
        return sectionRows.map(({ id, ...row }) => row);
      case "Academic Term Report":
        return groupRows(filtered, ["term", "source"]);
      default:
        return filtered.map(({ id, ...row }) => row);
    }
  }, [report, filtered, sectionRows]);

  const history = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    return (result.history || []).filter((row) =>
      (source === ALL || source === row.source) &&
      (!search || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(search))));
  }, [result.history, source, historySearch]);

  const ready = result.kind === "ready";
  const updateFilter = (setter) => (value) => { setter(value); setPreview(false); setFeedback(""); };
  return (
    <>
      <PageHeader title="Reports & Monitoring"
        description="Enrollment reports and Registrar transaction history from authorized records."
        actions={<Button type="button" variant="secondary" disabled={result.kind === "loading"}
          onClick={() => { setResult((prev) => ({ ...prev, kind: "loading" })); setRefresh((value) => value + 1); }}>
          Refresh Data
        </Button>} />
      {result.kind === "loading" ? <p className="notice" role="status">Loading Registrar records…</p> : null}
      {result.kind === "unavailable" ? <p className="notice warning" role="alert">
        Registrar reporting is temporarily unavailable. No sample values are shown.
      </p> : null}
      {ready ? <>
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <Metric label="Official Enrollment Records" value={result.officialCount} />
          <Metric label="Fictional Cohort Records" value={result.projectCount} hint="Demonstration only" />
          <Metric label="Officially Confirmed" value={records.filter((row) => row.source === "Official record" && row.status === "CONFIRMED").length} />
          <Metric label="Registrar History Events" value={result.history.length} />
        </div>
        <Tabs selected={view} onSelect={(next) => { setView(next); setFeedback(""); }}
          label="Registrar reporting sections" title="Registrar Reports"
          items={[choice("reports", "Registrar Reports"), choice("history", "Registrar Activity History")]}>
          <div className="toolbar">
            <FilterControl label="Data Source" value={source} onChange={updateFilter(setSource)}
              options={[choice(ALL, "All sources"), choice("Official record"), choice("Demonstration only"),
                ...(view === "history" ? [choice("Registrar audit")] : [])]} />
            {view === "reports" ? <>
              <FilterControl label="Program" value={program} onChange={updateFilter(setProgram)} options={options("program")} />
              <FilterControl label="Academic Term" value={term} onChange={updateFilter(setTerm)} options={options("term")} />
              {report !== "Section Capacity Report" ?
                <FilterControl label="Enrollment Status" value={status} onChange={updateFilter(setStatus)} options={options("status")} /> : null}
            </> : <SearchControl label="Search history" value={historySearch}
              onChange={setHistorySearch} placeholder="Search actions, records or reasons" />}
          </div>
          {view === "reports" ? <>
            <div className="toolbar">
              <FilterControl label="Report Type" value={report} onChange={updateFilter(setReport)}
                options={REPORTS.map((item) => choice(item))} />
              <Button type="button" onClick={() => { setPreview(true); setFeedback(`Showing ${reportRows.length} current records.`); }}>
                Generate & Preview
              </Button>
              <Button type="button" variant="secondary" disabled={reportRows.length === 0}
                onClick={() => exportCsv(reportRows, `${report.toLowerCase().replaceAll(" ", "-")}.csv`)}>
                Export Spreadsheet (CSV)
              </Button>
              <Button type="button" variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button>
            </div>
            {preview ? <DataTable rows={reportRows}
              rowKey={(row) => row.id || Object.values(row).join(":")}
              columns={columnsFor(reportRows, ["studentNumber", "program", "term", "status", "source"])}
              emptyMessage="No records match these report filters." />
              : <p className="notice">Select a report and generate a preview to inspect current records.</p>}
            <p className="notice">Fictional cohort entries and proposed block capacity are demonstration data. Only records labeled Official record are institutional enrollment records.</p>
          </> : <DataTable rows={history.slice(0, LIMIT_HISTORY)}
            rowKey="id" columns={columnsFor(history, ["date", "registrar", "record", "action", "source"])}
            emptyMessage="No Registrar transactions match these filters." />}
          <Feedback message={feedback} />
        </Tabs>
      </> : null}
    </>
  );
}

const LIMIT_HISTORY = 200;
