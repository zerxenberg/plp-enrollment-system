"use client";

import { useMemo, useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { downloadGradeTemplate, GRADE_IMPORT_HEADERS, GRADE_IMPORT_SCOPE, parseGradeFile } from "@/features/grade-import/grade-import-service";
import { Button, DataTable, FilterControl, InternalTabs, Modal, SearchControl, StatusBadge, TableActionButton, TableActions } from "@/components/ui/PortalUI";
import { Feedback, Info, Metric, Panel } from "./RegistrarShared";
import RegistrarGradeUploadPicker from "./RegistrarGradeUploadPicker";

const INNER_TABS = [
  { value: "overview", label: "Overview" },
  { value: "upload", label: "Upload Grades" },
  { value: "review", label: "Validate & Review" },
  { value: "pending", label: "Pending Imports" },
];

const SCOPE_FIELDS = [
  ["academicYear", "Academic Year"],
  ["semester", "Semester"],
  ["department", "Department"],
  ["program", "Program"],
  ["subjectCode", "Subject Code"],
  ["subjectName", "Subject Name"],
  ["sectionCode", "Section Code"],
  ["facultyMember", "Faculty Member"],
  ["sourceReference", "Demo Source Verification Reference"],
];
const FIXED_DEMO_SCOPE = new Set([
  "academicYear", "semester", "department", "program", "subjectCode", "subjectName", "sectionCode",
]);

const ALL = { value: "ALL", label: "All" };
const labelFor = (value) => String(value ?? "").replaceAll("_", " ").trim() || "Not recorded";
const batchReference = (batch) => batch?.reference || batch?.id || "Not recorded";
const isPublished = (batch) => String(batch?.status || "").toUpperCase().includes("PUBLISHED") || Boolean(batch?.publishedAt);
const isCancelled = (batch) => String(batch?.status || "").toUpperCase().includes("CANCEL");
const isEditable = (batch) => Boolean(batch && !isPublished(batch) && !isCancelled(batch));
const isVerified = (batch) => Boolean(
  batch?.verified?.confirmed ||
  batch?.verification?.confirmed || batch?.verification?.verified ||
  batch?.verification?.status === "VERIFIED" || batch?.sourceVerified ||
  batch?.verifiedAt
);
const isValidated = (batch) => Boolean(
  /VALIDATED|READY|VERIFIED|PUBLISH/.test(String(batch?.status || "").toUpperCase()) ||
  batch?.validatedAt || batch?.validation?.completedAt ||
  batch?.validation?.status === "VALIDATED"
);
const displayDate = (value) => {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
};
const rowNumber = (row, index) => row.rowNumber ?? row.row_number ?? index + 1;
const studentNumber = (row) => row.student_number ?? row.studentNumber ?? "";
const studentName = (row) => row.student_full_name ?? row.studentName ?? "";
const gradeValue = (row) => row.grade_value ?? row.gradeValue ?? "";
const completionStatus = (row) => row.completion_status ?? row.completionStatus ?? "";
const sourceReference = (row) => row.source_record_reference ?? row.sourceReference ?? row.sourceRecordReference ?? "";
const rowIssues = (row) => Array.isArray(row.issues) ? row.issues : [];
const errorIssues = (row) => rowIssues(row).filter((issue) => ["ERROR", "BLOCK"].includes(String(issue.severity || "").toUpperCase()));
const warningIssues = (row) => rowIssues(row).filter((issue) => ["WARNING", "WARN"].includes(String(issue.severity || "").toUpperCase()));
const isBlocking = (issue) => ["ERROR", "BLOCK"].includes(String(issue.severity || "").toUpperCase());
const isWarning = (issue) => ["WARNING", "WARN"].includes(String(issue.severity || "").toUpperCase());

function collectIssues(batch) {
  const issues = (batch?.rows || []).flatMap((row, index) =>
    rowIssues(row).map((issue) => ({
      ...issue,
      rowNumber: rowNumber(row, index),
      studentNumber: studentNumber(row),
    }))
  );
  const batchIssues = Array.isArray(batch?.issues) ? batch.issues : [];
  return [...issues, ...batchIssues.map((issue) => ({
    ...issue,
    rowNumber: issue.rowNumber ?? issue.row_number ?? "",
    studentNumber: issue.studentNumber ?? issue.student_number ?? "",
  }))];
}

function batchCounts(batch) {
  const rows = Array.isArray(batch?.rows) ? batch.rows : [];
  const issues = collectIssues(batch);
  const errorRows = rows.filter((row) => errorIssues(row).length > 0).length;
  const warningRows = rows.filter((row) => warningIssues(row).length > 0).length;
  const errorCount = issues.filter(isBlocking).length;
  const warningCount = issues.filter(isWarning).length;
  return { total: rows.length, errorRows, warningRows, errorCount, warningCount, validRows: rows.length - errorRows };
}

function downloadCsv(name, rows) {
  const quote = (value) => {
    const cell = String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&");
    return `"${cell.replaceAll('"', '""')}"`;
  };
  const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ScopeFields({ scope, onChange }) {
  return <div className="form-grid">
    {SCOPE_FIELDS.map(([key, label]) => <label key={key} className="field">
      {label}
      {FIXED_DEMO_SCOPE.has(key)
        ? <select defaultValue={GRADE_IMPORT_SCOPE[key]} aria-label={`${label} (supported demo offering)`}>
          <option value={GRADE_IMPORT_SCOPE[key]}>{GRADE_IMPORT_SCOPE[key]}</option>
        </select>
        : <input required value={scope[key] ?? ""} onChange={(event) => onChange((current) => ({ ...current, [key]: event.target.value }))} />}
    </label>)}
  </div>;
}

function ImportRowTable({ batch, onAmend, published = false, displayedRows }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [detailRow, setDetailRow] = useState(null);
  const originalRows = displayedRows || batch?.rows || [];
  const rows = originalRows.filter((row) => {
    const hasErrors = errorIssues(row).length > 0;
    const hasWarnings = warningIssues(row).length > 0;
    const matchesFilter = filter === "ALL" || (filter === "ERROR" && hasErrors) ||
      (filter === "WARNING" && hasWarnings) || (filter === "VALID" && Boolean(batch?.validatedAt) && !hasErrors && !hasWarnings);
    return matchesFilter && `${studentNumber(row)} ${studentName(row)} ${sourceReference(row)} ${gradeValue(row)}`.toLowerCase().includes(search.toLowerCase());
  });
  return <>
    <div className="toolbar">
      <SearchControl label="Search grade rows" placeholder="Student number, name, grade or source reference" value={search} onChange={setSearch} />
      <FilterControl label="Row Results" value={filter} onChange={setFilter} options={[ALL, { value: "VALID", label: "No issues" }, { value: "WARNING", label: "Warnings" }, { value: "ERROR", label: "Errors" }]} />
    </div>
    <DataTable
      rows={rows}
      rowKey={(row) => `${rowNumber(row, originalRows.indexOf(row))}:${studentNumber(row)}`}
      emptyMessage="No grade rows match these filters."
      columns={[
        { key: "row", label: "Row", render: (row) => rowNumber(row, originalRows.indexOf(row)) },
        { key: "student", label: "Student", render: (row) => <><strong>{studentNumber(row)}</strong><div>{studentName(row)}</div></> },
        { key: "subject", label: "Subject / Section", render: (row) => <>{row.subject_code || batch?.scope?.subjectCode || ""}<div>{row.section_code || batch?.scope?.sectionCode || ""}</div></> },
        { key: "grade", label: "Grade", render: gradeValue },
        { key: "completion", label: "Completion", render: (row) => <StatusBadge value={completionStatus(row)} /> },
        { key: "source", label: "Source Ref.", render: sourceReference },
        { key: "issues", label: "Review", render: (row) => rowIssues(row).length
          ? <div className="list-stack">{rowIssues(row).map((issue, index) =>
            <span key={`${issue.code || "issue"}:${index}`} title={issue.message}><StatusBadge value={isBlocking(issue) ? "FAILED" : "REQUIRES_REVIEW"} label={issue.code ? `${labelFor(issue.severity)}: ${labelFor(issue.code)}` : labelFor(issue.severity)} /> <span>{issue.message}</span></span>)}</div>
          : batch?.validatedAt ? <StatusBadge value="VALIDATED" label="No issues" /> : <StatusBadge value="UPLOADED" label="Pending validation" /> },
        { key: "actions", label: "Actions", render: (row) => <TableActions>
          <TableActionButton icon="eye" tone="view" type="button" onClick={() => setDetailRow(row)}>View Row Details</TableActionButton>
          {published && onAmend ? <TableActionButton icon="edit" tone="edit" type="button" onClick={() => onAmend(row)}>Amend Demo Result</TableActionButton> : null}
        </TableActions> },
      ]}
    />
    <Modal open={Boolean(detailRow)} title="Grade Row Details" onClose={() => setDetailRow(null)}
      footer={<Button variant="ghost" onClick={() => setDetailRow(null)}>Close Details</Button>}>
      {detailRow ? <>
        <p className="notice" style={{ marginBottom: 12 }}>This row is part of a simulated grade import batch. It does not represent an authenticated PLP grade record.</p>
        <div className="info-grid">
          <Info label="Spreadsheet Row" value={rowNumber(detailRow, originalRows.indexOf(detailRow))} />
          <Info label="Student Number" value={studentNumber(detailRow)} />
          <Info label="Student Name" value={studentName(detailRow)} />
          <Info label="Subject Code" value={detailRow.subject_code || batch?.scope?.subjectCode} />
          <Info label="Subject Name" value={detailRow.Subject_name || batch?.scope?.subjectName} />
          <Info label="Academic Year" value={detailRow.academic_year || batch?.scope?.academicYear} />
          <Info label="Semester" value={detailRow.semester || batch?.scope?.semester} />
          <Info label="Section" value={detailRow.section_code || batch?.scope?.sectionCode} />
          <Info label="Grade Value" value={gradeValue(detailRow)} />
          <Info label="Completion Status" value={labelFor(completionStatus(detailRow))} />
          <Info label="Source Record Reference" value={sourceReference(detailRow)} />
          <Info label="Validation" value={!batch?.validatedAt ? "Pending validation" : errorIssues(detailRow).length ? "Blocking errors" : warningIssues(detailRow).length ? "Warnings" : "No issues"} />
        </div>
        {rowIssues(detailRow).length ? <div style={{ marginTop: 15 }}>
          <h3 style={{ marginBottom: 9 }}>Validation Findings</h3>
          <div className="list-stack">{rowIssues(detailRow).map((issue, index) => <div className="list-item" key={`${issue.code || "issue"}:${index}`}>
            <div className="list-item-header"><strong>{issue.code || "Validation finding"}</strong><StatusBadge value={isBlocking(issue) ? "FAILED" : "REQUIRES_REVIEW"} label={labelFor(issue.severity)} /></div>
            <p>{issue.message}</p>
          </div>)}</div>
        </div> : null}
      </> : null}
    </Modal>
  </>;
}

export default function RegistrarGradeImports({ mode = "import", onNavigate = () => {} }) {
  const {
    gradeImports = { batches: [], publications: [], revisions: [], notifications: [] },
    createMockGradeImport, validateMockGradeImport, verifyMockGradeSource,
    publishMockGrades, replaceMockGradeFile, cancelMockGradeImport, amendMockPublishedResult,
  } = useDemoData();
  const batches = Array.isArray(gradeImports?.batches) ? gradeImports.batches : [];
  const publications = Array.isArray(gradeImports?.publications) ? gradeImports.publications : [];
  const revisions = Array.isArray(gradeImports?.revisions) ? gradeImports.revisions : [];
  const notifications = Array.isArray(gradeImports?.notifications) ? gradeImports.notifications : [];
  const [tab, setTab] = useState("overview");
  const [scope, setScope] = useState(() => Object.fromEntries(SCOPE_FIELDS.map(([key]) => [key, GRADE_IMPORT_SCOPE?.[key] ?? ""])));
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [isBusy, setBusy] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [method, setMethod] = useState("Signed faculty grade submission");
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [publishAcknowledged, setPublishAcknowledged] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState("");
  const [replacementFile, setReplacementFile] = useState(null);
  const [amendment, setAmendment] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("ALL");
  const [showHistoryDetails, setShowHistoryDetails] = useState(false);

  const selected = batches.find((batch) => batch.id === selectedBatchId) || (selectedBatchId ? null : batches[0]);
  const counts = batchCounts(selected);
  const issues = useMemo(() => collectIssues(selected), [selected]);
  const hasBlockingIssues = issues.some(isBlocking);
  const publishReady = Boolean(selected && isEditable(selected) && isValidated(selected) && isVerified(selected) && !hasBlockingIssues);

  function report(result, successText) {
    const ok = Boolean(result?.ok);
    setIsError(!ok);
    setMessage(result?.message || (ok ? successText : "The action could not be completed. Review the batch and try again."));
    return ok;
  }

  function changeTab(next) {
    setTab(next);
    setMessage("");
    setIsError(false);
  }

  function selectBatch(batch) {
    setSelectedBatchId(batch.id);
    setSourceConfirmed(false);
    setPublishAcknowledged(false);
    changeTab("review");
  }

  async function parseSelectedFile() {
    if (!file) { setIsError(true); setMessage("Choose a demo grade file before parsing."); return; }
    setBusy(true);
    setParsed(null);
    try {
      const result = await parseGradeFile(file);
      if (!Array.isArray(result?.rows) || !result.rows.length) throw new Error("This file has no importable grade rows.");
      setParsed(result);
      setIsError(false);
      setMessage(`Parsed ${result.rows.length} rows from ${result.filename || file.name}. Review the scope, then create the batch.`);
    } catch (error) {
      setIsError(true);
      setMessage(error?.message || "The file could not be parsed.");
    } finally {
      setBusy(false);
    }
  }

  function createBatch(event) {
    event.preventDefault();
    if (!parsed) { setIsError(true); setMessage("Parse the selected grade file first."); return; }
    if (typeof createMockGradeImport !== "function") { report(null); return; }
    const fixedScope = Object.fromEntries([...FIXED_DEMO_SCOPE].map((key) => [key, GRADE_IMPORT_SCOPE[key]]));
    const result = createMockGradeImport({ scope: { ...scope, ...fixedScope }, filename: parsed.filename || file?.name, rows: parsed.rows, checksum: parsed.checksum });
    if (report(result, "Import batch created. Validate the rows before publishing.")) {
      setSelectedBatchId(result.batch?.id ?? null);
      setFile(null);
      setParsed(null);
      setSourceConfirmed(false);
      setTab("review");
    }
  }

  function validateBatch() {
    if (!selected || typeof validateMockGradeImport !== "function") { report(null); return; }
    report(validateMockGradeImport(selected.id), "Batch validation finished. Review any row issues before publication.");
  }

  function verifySource(event) {
    event.preventDefault();
    if (!selected || !sourceConfirmed || typeof verifyMockGradeSource !== "function") {
      setIsError(true); setMessage("Confirm the demo source statement before recording simulated verification."); return;
    }
    const ok = report(verifyMockGradeSource(selected.id, { method, confirmed: true }), "Simulated Verification recorded for this demo grade source.");
    if (ok) setSourceConfirmed(false);
  }

  function publishBatch() {
    if (!publishReady || !publishAcknowledged || typeof publishMockGrades !== "function") {
      setIsError(true); setMessage("Complete validation and demo source verification before publishing demo results."); return;
    }
    const result = publishMockGrades(selected.id);
    if (report(result, "Demo grade results published to the simulated student academic records.")) {
      setDialog(null);
      setPublishAcknowledged(false);
    }
  }

  async function replaceFile(event) {
    event.preventDefault();
    if (!selected || !replacementFile || typeof replaceMockGradeFile !== "function") return;
    setBusy(true);
    try {
      const result = await parseGradeFile(replacementFile);
      if (!Array.isArray(result?.rows) || !result.rows.length) throw new Error("The replacement file has no importable rows.");
      if (report(replaceMockGradeFile(selected.id, {
        filename: result.filename || replacementFile.name, rows: result.rows, checksum: result.checksum,
      }), "File replaced. Validate the replacement rows again.")) {
        setDialog(null); setReplacementFile(null); setSourceConfirmed(false);
      }
    } catch (error) {
      setIsError(true); setMessage(error?.message || "The replacement file could not be parsed.");
    } finally {
      setBusy(false);
    }
  }

  function cancelBatch(event) {
    event.preventDefault();
    if (!selected || !reason.trim() || typeof cancelMockGradeImport !== "function") return;
    if (report(cancelMockGradeImport(selected.id, reason.trim()), "Import batch cancelled and retained in history.")) {
      setDialog(null); setReason("");
    }
  }

  function openAmendment(row, batch) {
    setSelectedBatchId(batch.id);
    setAmendment({
      batchId: batch.id, studentNumber: studentNumber(row),
      gradeValue: String(gradeValue(row)), completionStatus: String(completionStatus(row)),
      sourceReference: String(sourceReference(row)), reason: "",
      method: "Demo verified correction record", confirmed: false,
    });
    setDialog("amend");
  }

  function saveAmendment(event) {
    event.preventDefault();
    if (!amendment?.confirmed || !amendment?.reason.trim() || !amendment?.sourceReference.trim() || typeof amendMockPublishedResult !== "function") {
      setIsError(true); setMessage("Provide a source reference, correction reason and source confirmation."); return;
    }
    if (report(amendMockPublishedResult({
      ...amendment, gradeValue: amendment.gradeValue.trim(),
      sourceReference: amendment.sourceReference.trim(), reason: amendment.reason.trim(),
      method: amendment.method.trim(),
    }), "Authorized grade amendment recorded in revision history.")) {
      setDialog(null); setAmendment(null);
    }
  }

  function downloadIssues() {
    if (!selected || !issues.length) return;
    downloadCsv(`grade-import-issues-${selected.reference || selected.id}.csv`, [
      ["Row", "Student Number", "Severity", "Code", "Message"],
      ...issues.map((issue) => [issue.rowNumber, issue.studentNumber, issue.severity, issue.code, issue.message]),
    ]);
  }

  const orderedBatches = [...batches].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const pending = orderedBatches.filter(isEditable);
  const historyBatches = orderedBatches.filter((batch) =>
    (historyStatus === "ALL" || (historyStatus === "PUBLISHED" && isPublished(batch)) ||
      (historyStatus === "CANCELLED" && isCancelled(batch)) || (historyStatus === "OTHER" && isEditable(batch))) &&
    `${batchReference(batch)} ${batch.filename || ""} ${batch.scope?.subjectCode || ""} ${batch.status || ""}`.toLowerCase().includes(historySearch.toLowerCase())
  );
  const summary = {
    total: batches.length,
    pending: pending.length,
    validated: batches.filter((batch) => batch.validatedAt && !batch.counts?.invalidRows && !isCancelled(batch)).length,
    published: batches.filter(isPublished).length,
    requiresCorrection: batches.filter((batch) => batch.status === "NEEDS_CORRECTION").length,
    publishedGradeRecords: publications.length,
  };

  return <>
    {mode === "import" ? <InternalTabs items={INNER_TABS} selected={tab} onSelect={changeTab} label="Official grade import workflow" panelCard>
      {tab === "overview" ? <>
        <div className="section-header"><div><h2>Official Grades Import Demo</h2><p>Explore sample academic result imports, validation and Registrar publication workflows.</p></div></div>
        <p className="notice warning" style={{ marginBottom: 16 }}>Demonstration only. Source verification is simulated, and published results are stored as demo data. This workflow does not authenticate or publish actual PLP academic records.</p>
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <Metric label="Total Import Batches" value={summary.total} />
          <Metric label="Pending Imports" value={summary.pending} />
          <Metric label="Validated Imports" value={summary.validated} hint="Includes subsequently published batches" />
          <Metric label="Published Imports" value={summary.published} />
          <Metric label="Imports Requiring Correction" value={summary.requiresCorrection} />
          <Metric label="Total Published Grade Records" value={summary.publishedGradeRecords} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Panel title="Recent Import Activity" subtitle="Most recently created demo grade import batches. Open an import to continue review or inspect results.">
            <DataTable rows={orderedBatches.slice(0, 8)} rowKey="id" emptyMessage="No demo grade import activity yet. Upload a file to create the first batch."
              columns={[
                { key: "reference", label: "Batch Reference", render: batchReference },
                { key: "term", label: "Academic Term", render: (batch) => [batch.scope?.semester, batch.scope?.academicYear].filter(Boolean).join(" · ") },
                { key: "subject", label: "Subject", render: (batch) => <>{batch.scope?.subjectCode}<div>{batch.scope?.subjectName}</div></> },
                { key: "section", label: "Section", render: (batch) => batch.scope?.sectionCode || "Not recorded" },
                { key: "faculty", label: "Faculty Source", render: (batch) => batch.scope?.facultyMember || "Not recorded" },
                { key: "count", label: "Grade Rows", render: (batch) => batch.rows?.length || 0 },
                { key: "status", label: "Status", render: (batch) => <StatusBadge value={batch.status} /> },
                { key: "date", label: "Date", render: (batch) => displayDate(batch.createdAt) },
                { key: "action", label: "Action", render: (batch) => <TableActions><TableActionButton icon={isEditable(batch) ? "review" : "eye"} tone={isEditable(batch) ? "review" : "view"} type="button" onClick={() => selectBatch(batch)}>{isEditable(batch) ? "Review Import" : "View Batch"}</TableActionButton></TableActions> },
              ]} />
          </Panel>
        </div>
        <Panel title="How demo grade publication works" subtitle="A simulated Registrar workflow with validation and traceable demo results.">
          <div className="list-stack">
            {[
              ["1. Prepare the sample source file", "Download the template and enter grade examples with their demo source references."],
              ["2. Upload and create a batch", "Use the fixed demo offering, parse the file, and save the import for review."],
              ["3. Validate every row", "Review student identity, scope, duplicate, grade and completion issues flagged by the validator."],
              ["4. Simulated Verification", "Record a demo source confirmation and review the simulated verification method and timestamp."],
              ["5. Publish Demo Results", "Publish only a validated, verified demo batch with no blocking errors. Amendments are tracked."],
            ].map(([title, description]) => <div className="list-item" key={title}><strong>{title}</strong><p>{description}</p></div>)}
          </div>
        </Panel>
        <div className="action-row" style={{ marginTop: 14 }}>
          <Button onClick={() => changeTab("upload")}>Start New Import</Button>
          <Button variant="secondary" onClick={() => changeTab("pending")}>Open Pending Imports ({summary.pending})</Button>
          <Button variant="ghost" onClick={() => onNavigate("history")}>View Import History</Button>
        </div>
      </> : null}

      {tab === "upload" ? <>
        <div className="section-header">
          <div><h2>Upload Demo Grade File</h2><p>Use the supported sample offering and a simulated faculty source reference for this demo.</p></div>
          <Button type="button" variant="secondary" onClick={() => {
            try { downloadGradeTemplate(); setIsError(false); setMessage("Template download started."); }
            catch (error) { setIsError(true); setMessage(error?.message || "Could not download the grade template."); }
          }}>Download Excel Template</Button>
        </div>
        <div className="notice" style={{ marginBottom: 15 }}>
          Required columns: {Array.isArray(GRADE_IMPORT_HEADERS) ? GRADE_IMPORT_HEADERS.join(", ") : "Use every header in the grade template."}.
          Sample rows must match the fixed historical offering. Source references here are simulated and do not establish official PLP authenticity.
        </div>
        <form onSubmit={createBatch}>
          <h3 style={{ marginBottom: 12 }}>Supported Demo Academic Scope</h3>
          <ScopeFields scope={scope} onChange={setScope} />
          <div className="form-grid" style={{ marginTop: 15 }}>
            <RegistrarGradeUploadPicker file={file} disabled={isBusy} onFileSelected={(nextFile) => {
                setFile(nextFile);
                setParsed(null);
                setMessage("");
                setIsError(false);
              }} />
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button type="button" variant="secondary" disabled={!file || isBusy} onClick={parseSelectedFile}>
              {isBusy ? "Reading File..." : "Parse & Preview File"}
            </Button>
            <Button type="submit" disabled={!parsed || isBusy}>Create Import Batch</Button>
          </div>
        </form>
        {parsed ? <div style={{ marginTop: 15 }}>
          <div className="summary-strip">
            <span>File: <strong>{parsed.filename || file?.name}</strong></span>
            <span>Rows parsed: <strong>{parsed.rows.length}</strong></span>
            <span>Checksum: <strong>{parsed.checksum || "Generated by parser"}</strong></span>
          </div>
          <p className="notice" style={{ marginTop: 10 }}>The parser has read the file. Create the batch and run validation to identify issues before publishing.</p>
        </div> : null}
      </> : null}

      {tab === "pending" ? <>
        <div className="section-header"><div><h2>Pending Imports</h2><p>Review uploaded batches and finish validation, source verification or publication.</p></div>
          <Button onClick={() => changeTab("upload")}>Upload New File</Button></div>
        <DataTable rows={pending} rowKey="id" emptyMessage="No pending demo grade imports."
          columns={[
            { key: "reference", label: "Batch Ref.", render: batchReference },
            { key: "filename", label: "File" },
            { key: "subject", label: "Subject / Section", render: (batch) => `${batch.scope?.subjectCode || ""} · ${batch.scope?.sectionCode || ""}` },
            { key: "count", label: "Rows", render: (batch) => batch.rows?.length || 0 },
            { key: "status", label: "Status", render: (batch) => <StatusBadge value={batch.status} /> },
            { key: "created", label: "Uploaded", render: (batch) => displayDate(batch.createdAt) },
            { key: "action", label: "Action", render: (batch) => <TableActions><TableActionButton icon="review" tone="review" type="button" onClick={() => selectBatch(batch)}>Validate / Review</TableActionButton></TableActions> },
          ]} />
      </> : null}

      {tab === "review" ? <>
        <div className="section-header">
          <div><h2>Validate & Review</h2><p>Inspect demo grade rows and record simulated source verification before demo publication.</p></div>
          <Button variant="ghost" onClick={() => changeTab("pending")}>Pending Imports</Button>
        </div>
        <p className="notice warning" style={{ marginBottom: 14 }}>Demo workflow only. Validation and source attestation cannot authenticate actual PLP grade submissions.</p>
        <div className="toolbar">
          <FilterControl label="Select Import Batch" value={selected?.id || ""} onChange={(id) => {
            setSelectedBatchId(id);
            setSourceConfirmed(false);
          }} options={batches.length ? batches.map((batch) => ({ value: batch.id, label: `${batchReference(batch)} · ${batch.filename || "Grade file"}` })) : [{ value: "", label: "No grade batches" }]} />
        </div>
        {selected ? <>
          <div className="summary-strip" style={{ marginBottom: 12 }}>
            <span>Batch: <strong>{batchReference(selected)}</strong></span>
            <span>File: <strong>{selected.filename}</strong></span>
            <span>Status: <strong>{labelFor(selected.status)}</strong></span>
            <span>Source: <strong>{isVerified(selected) ? "Simulated Verification complete" : "Demo source verification pending"}</strong></span>
          </div>
          <div className="info-grid" style={{ marginBottom: 14 }}>
            <Info label="Academic Year" value={selected.scope?.academicYear} />
            <Info label="Semester" value={selected.scope?.semester} />
            <Info label="Program" value={selected.scope?.program} />
            <Info label="Subject / Section" value={`${selected.scope?.subjectCode || ""} · ${selected.scope?.sectionCode || ""}`} />
            <Info label="Faculty Member" value={selected.scope?.facultyMember} />
            <Info label="Demo Source Reference" value={selected.scope?.sourceReference} />
          </div>
          <div className="stats-grid" style={{ marginBottom: 15 }}>
            <Metric label="Grade Rows" value={counts.total} />
            <Metric label="Rows without Errors" value={selected.validatedAt ? counts.validRows : "Not checked"} />
            <Metric label="Blocking Errors" value={counts.errorCount} />
            <Metric label="Warnings" value={counts.warningCount} />
          </div>
          <div className="action-row" style={{ marginBottom: 15 }}>
            <Button onClick={validateBatch} disabled={!["UPLOADED", "NEEDS_CORRECTION", "VALIDATED", "READY_TO_PUBLISH"].includes(selected.status)}>Run Validation</Button>
            <Button variant="secondary" disabled={!issues.length} onClick={downloadIssues}>Download Issues CSV</Button>
            <Button variant="ghost" disabled={!isEditable(selected)} onClick={() => { setReplacementFile(null); setDialog("replace"); }}>Replace File</Button>
            <Button variant="danger" disabled={!isEditable(selected)} onClick={() => { setReason(""); setDialog("cancel"); }}>Cancel Import</Button>
          </div>
          {hasBlockingIssues ? <p className="notice danger" role="status" style={{ marginBottom: 15 }}>
            This batch has {counts.errorCount} blocking issue(s). Correct the source file and revalidate before publication.
          </p> : null}
          <h3 style={{ marginBottom: 12 }}>Imported rows and validation details</h3>
          <ImportRowTable key={selected.id} batch={selected} />
          <div style={{ marginTop: 18 }}>
            <Panel title="Simulated Verification" subtitle="Demo source verification records a simulated Registrar attestation. It does not authenticate actual PLP grades.">
              <div className="info-grid" style={{ marginBottom: 13 }}>
                <Info label="Verification Method" value={selected.verified?.method || "Not yet recorded"} />
                <Info label="Verification Date" value={selected.verified?.verifiedAt ? displayDate(selected.verified.verifiedAt) : "Not yet recorded"} />
                <Info label="Demo Source Reference" value={selected.verified?.sourceReference || selected.scope?.sourceReference} />
                <Info label="Demo Faculty Source" value={selected.verified?.facultyMember || selected.scope?.facultyMember} />
              </div>
              {isEditable(selected) && !isVerified(selected) ? <form onSubmit={verifySource}>
                <div className="form-grid">
                  <label className="field">Simulated Verification Method
                    <select value={method} onChange={(event) => setMethod(event.target.value)}>
                      <option value="Signed faculty grade submission">Demo signed faculty grade submission</option>
                      <option value="Registrar verified official record">Demo Registrar source comparison</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12, fontSize: ".75rem" }}>
                  <input type="checkbox" checked={sourceConfirmed} onChange={(event) => setSourceConfirmed(event.target.checked)} />
                  For this simulation, I confirm that the sample file matches the demo source reference.
                </label>
                <div className="action-row" style={{ marginTop: 12 }}>
                  <Button type="submit" variant="secondary" disabled={!sourceConfirmed || selected.status !== "VALIDATED"}>Record Simulated Verification</Button>
                </div>
              </form> : isVerified(selected) ? <StatusBadge value="VALIDATED" label="Simulated Verification complete" /> : <p className="notice">Source verification is unavailable for this batch status.</p>}
            </Panel>
            {isEditable(selected) ? <Panel title="Publish Demo Results" subtitle="Demo publication updates simulated student academic records. Any later corrections are tracked in demo revision history.">
              <div className="summary-strip" style={{ marginBottom: 12 }}>
                <span>Validation: <strong>{isValidated(selected) ? "Complete" : "Required"}</strong></span>
                <span>Demo source verification: <strong>{isVerified(selected) ? "Simulated Verification complete" : "Required"}</strong></span>
                <span>Blocking errors: <strong>{counts.errorCount}</strong></span>
              </div>
              <Button disabled={!publishReady} onClick={() => { setPublishAcknowledged(false); setDialog("publish"); }}>Publish Demo Results</Button>
            </Panel> : null}
          </div>
          {isPublished(selected) ? <div className="notice" style={{ marginTop: 14 }}>This demo batch is published to simulated records. <button className="table-action" type="button" onClick={() => { setShowHistoryDetails(true); onNavigate("history"); }}>View Demo History & Amendments</button></div> : null}
        </> : <div className="empty-state"><strong>No batch selected</strong><p>Upload a grade file to create an import batch.</p><Button onClick={() => changeTab("upload")}>Upload Grades</Button></div>}
      </> : null}
    </InternalTabs> : null}

    {mode === "history" ? <Panel title="Grade Import History" subtitle="Read demo imports, simulated publications, corrections and grade import notifications.">
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <Metric label="Published Batches" value={summary.published} />
        <Metric label="All Batches" value={summary.total} />
        <Metric label="Publications" value={publications.length} />
        <Metric label="Recorded Amendments" value={revisions.length} />
      </div>
      <div className="toolbar">
        <SearchControl label="Search import history" value={historySearch} onChange={setHistorySearch} placeholder="Batch, filename, subject or status" />
        <FilterControl label="Import Status" value={historyStatus} onChange={setHistoryStatus} options={[ALL, { value: "PUBLISHED", label: "Published" }, { value: "CANCELLED", label: "Cancelled" }, { value: "OTHER", label: "Pending" }]} />
        <Button variant="secondary" onClick={() => onNavigate("import")}>Open Grade Import</Button>
      </div>
      <DataTable rows={historyBatches} rowKey="id" emptyMessage="No grade imports match the history filters."
        columns={[
          { key: "batch", label: "Batch", render: batchReference },
          { key: "file", label: "File / Subject", render: (batch) => <>{batch.filename}<div>{batch.scope?.subjectCode} · {batch.scope?.sectionCode}</div></> },
          { key: "rows", label: "Rows", render: (batch) => batch.rows?.length || 0 },
          { key: "status", label: "Status", render: (batch) => <StatusBadge value={batch.status} /> },
          { key: "date", label: "Uploaded / Published", render: (batch) => <>{displayDate(batch.createdAt)}<div>{batch.publishedAt ? displayDate(batch.publishedAt) : ""}</div></> },
          { key: "reference", label: "Publication Ref.", render: (batch) => batch.publicationReference || "Not published" },
          { key: "action", label: "Action", render: (batch) => <TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => { setSelectedBatchId(batch.id); setShowHistoryDetails(true); }}>View Rows</TableActionButton></TableActions> },
        ]} />
      {showHistoryDetails && selected && historyBatches.some((batch) => batch.id === selected.id) ? <div style={{ marginTop: 17 }}>
        <div className="section-header"><div><h2>Batch {batchReference(selected)}</h2><p>{selected.filename} · {labelFor(selected.status)} · {selected.publicationReference || "No publication reference"}</p></div>
          <Button variant="ghost" onClick={() => setShowHistoryDetails(false)}>Close Details</Button></div>
        <div className="info-grid" style={{ marginBottom: 15 }}>
          <Info label="Uploaded By" value={selected.uploadedBy} />
          <Info label="Demo Faculty Source" value={selected.scope?.facultyMember} />
          <Info label="Demo Verification Reference" value={selected.verified?.sourceReference || selected.scope?.sourceReference} />
          <Info label="Simulated Verification Method" value={selected.verified?.method || "Not yet recorded"} />
          <Info label="Simulated Verification Date" value={selected.verified?.verifiedAt ? displayDate(selected.verified.verifiedAt) : "Not yet recorded"} />
          {selected.cancellationReason ? <Info label="Cancellation Reason" value={selected.cancellationReason} /> : null}
        </div>
        <ImportRowTable key={selected.id} batch={selected} published={isPublished(selected)} onAmend={(row) => openAmendment(row, selected)}
          displayedRows={isPublished(selected) ? (selected.rows || []).map((row) => {
            const current = publications.find((item) => item.batchId === selected.id && item.studentNumber === studentNumber(row));
            return current ? { ...row, grade_value: current.gradeValue, completion_status: current.completionStatus, source_record_reference: current.sourceRecordReference } : row;
          }) : selected.rows} />
        {selected.statusHistory?.length ? <div style={{ marginTop: 17 }}>
          <h3 style={{ marginBottom: 10 }}>Batch Status History</h3>
          <div className="list-stack">{selected.statusHistory.map((entry, index) => <div className="list-item" key={`${entry.status}:${entry.at}:${index}`}>
            <div className="list-item-header"><strong>{labelFor(entry.status)}</strong><span>{displayDate(entry.at)}</span></div>
          </div>)}</div>
        </div> : null}
      </div> : null}
      {publications.length ? <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Current Published Demo Results</h3>
        <DataTable rows={publications} rowKey={(row) => row.id || row.publicationReference || JSON.stringify(row)}
          columns={[
            { key: "reference", label: "Publication Reference", render: (row) => row.publicationReference || row.reference || row.id },
            { key: "student", label: "Student", render: (row) => <>{row.studentNumber}<div>{row.studentName}</div></> },
            { key: "result", label: "Grade / Completion", render: (row) => <>{row.gradeValue} <StatusBadge value={row.completionStatus} /></> },
            { key: "version", label: "Version", render: (row) => row.version },
            { key: "published", label: "Published", render: (row) => displayDate(row.publishedAt || row.createdAt || row.date) },
          ]} />
      </div> : null}
      {revisions.length ? <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Simulated Grade Revisions</h3>
        <DataTable rows={revisions} rowKey={(row) => row.id || JSON.stringify(row)}
          columns={[
            { key: "student", label: "Student", render: (row) => row.studentNumber || row.student_number || "" },
            { key: "batch", label: "Batch", render: (row) => row.batchReference || row.batchId || "" },
            { key: "grade", label: "Previous → New", render: (row) => `${row.previousValue ?? ""} → ${row.newValue ?? ""}` },
            { key: "reason", label: "Reason", render: (row) => row.reason || "" },
            { key: "date", label: "Recorded", render: (row) => displayDate(row.at || row.createdAt || row.amendedAt || row.date) },
          ]} />
      </div> : null}
      {notifications.length ? <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Import Notifications</h3>
        <div className="list-stack">{notifications.map((item, index) => <div className="list-item" key={item.id || index}>
          <div className="list-item-header"><strong>{item.title || labelFor(item.type || "Import update")}</strong><span>{displayDate(item.createdAt || item.date)}</span></div>
          <p>{item.message || item.description}</p>
        </div>)}</div>
      </div> : null}
    </Panel> : null}

    <Feedback message={message} warning={isError} />

    <Modal open={dialog === "publish" && Boolean(selected)} title="Publish Demo Results" onClose={() => setDialog(null)}
      footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Back to Review</Button><Button onClick={publishBatch} disabled={!publishReady || !publishAcknowledged}>Publish Demo Results</Button></>}>
      <p className="notice">Demo batch {batchReference(selected)} contains {counts.total} grade rows with {counts.errorCount} blocking errors. Publication updates only simulated academic records in this demonstration, not actual PLP grades.</p>
      <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 15, fontSize: ".78rem" }}>
        <input type="checkbox" checked={publishAcknowledged} onChange={(event) => setPublishAcknowledged(event.target.checked)} />
        I have reviewed the demo validation results and completed simulated source verification. Publish these sample grades to demo student records.
      </label>
    </Modal>

    <Modal open={dialog === "replace" && Boolean(selected)} title="Replace Import File" onClose={() => setDialog(null)}
      footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="grade-file-replacement" disabled={!replacementFile || isBusy}>Replace File</Button></>}>
      <p className="notice" style={{ marginBottom: 12 }}>Replacing the sample source file resets validation and simulated verification. Review the demo batch again before publication.</p>
      <form id="grade-file-replacement" onSubmit={replaceFile}>
        <label className="field">Corrected Demo Grade File (XLSX or CSV)
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={(event) => setReplacementFile(event.target.files?.[0] || null)} />
        </label>
      </form>
    </Modal>

    <Modal open={dialog === "cancel" && Boolean(selected)} title="Cancel Grade Import" onClose={() => setDialog(null)}
      footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Back</Button><Button variant="danger" type="submit" form="cancel-grade-import" disabled={!reason.trim()}>Confirm Cancellation</Button></>}>
      <form id="cancel-grade-import" onSubmit={cancelBatch}>
        <label className="field">Cancellation Reason
          <textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this import must be cancelled" />
        </label>
      </form>
    </Modal>

    <Modal open={dialog === "amend" && Boolean(amendment)} title="Published Demo Grade Amendment" onClose={() => setDialog(null)}
      footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="grade-amendment" disabled={!amendment?.confirmed}>Record Grade Amendment</Button></>}>
      {amendment ? <form id="grade-amendment" onSubmit={saveAmendment} className="form-grid">
        <Info label="Student Number" value={amendment.studentNumber} />
        <Info label="Batch" value={batchReference(selected)} />
        <label className="field">Corrected Grade
          <input required value={amendment.gradeValue} onChange={(event) => setAmendment((item) => ({ ...item, gradeValue: event.target.value }))} />
        </label>
        <label className="field">Completion Status
          <select required value={amendment.completionStatus} onChange={(event) => setAmendment((item) => ({ ...item, completionStatus: event.target.value }))}>
            {["COMPLETED", "FAILED", "INCOMPLETE"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
          </select>
        </label>
        <label className="field full">New Demo Correction Source Reference
          <input required value={amendment.sourceReference} onChange={(event) => setAmendment((item) => ({ ...item, sourceReference: event.target.value }))} />
        </label>
        <p className="notice field full">Enter the new document reference for this correction. It must differ from the previously published source record reference.</p>
        <label className="field full">Verification Method
          <input required value={amendment.method} onChange={(event) => setAmendment((item) => ({ ...item, method: event.target.value }))} />
        </label>
        <label className="field full">Reason for Amendment
          <textarea required value={amendment.reason} onChange={(event) => setAmendment((item) => ({ ...item, reason: event.target.value }))} />
        </label>
        <label className="field full" style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <input type="checkbox" checked={amendment.confirmed} onChange={(event) => setAmendment((item) => ({ ...item, confirmed: event.target.checked }))} />
          For this demo, I confirm that the sample correction matches the new source reference.
        </label>
      </form> : null}
    </Modal>
  </>;
}
