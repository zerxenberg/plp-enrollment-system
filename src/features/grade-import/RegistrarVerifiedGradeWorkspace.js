"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  attestOfficialGradeSource,
  loadConfirmedGradeImportWorkspace,
  publishCompleteGradeBlock,
  stageConfirmedBlockGradeBatch,
  validateOfficialGradeImport,
} from "./registrar-grade-actions";
import { Button, DataTable, FilterControl, Modal, StatusBadge } from "@/components/ui/PortalUI";
import { Feedback, Metric, Panel } from "@/components/registrar/RegistrarShared";
import RegistrarGradeUploadPicker from "@/components/registrar/RegistrarGradeUploadPicker";
import { displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";

function downloadRosterCsv(subject) {
  const quote = (value) => {
    const safe = String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&");
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [
    ["term_id", "student_number", "student_full_name", "subject_code", "section_code",
      "grade_value", "completion_status", "source_record_reference"],
    ...subject.expected.map((attempt) => [
      attempt.termId, attempt.studentNumber, attempt.studentName, subject.code, attempt.sectionCode, "", "", "",
    ]),
  ];
  const blob = new Blob(["\uFEFF", rows.map((row) => row.map(quote).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `confirmed-grades-${subject.code.replace(/[^a-z0-9_-]/gi, "_")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const dateLabel = (value) => value ? new Date(value).toLocaleString() : "Pending";
const simpleStatus = (status) => String(status || "").replaceAll("_", " ");

function BlockReleaseHistory({ releases, batches }) {
  const [selectedReleaseId, setSelectedReleaseId] = useState(null);
  const selectedRelease = releases.find((release) => release.id === selectedReleaseId);
  const sourceBatches = selectedRelease
    ? batches.filter((batch) => selectedRelease.batch_ids.includes(batch.id)) : [];
  const subjectSnapshot = Array.isArray(selectedRelease?.expected_subject_snapshot)
    ? selectedRelease.expected_subject_snapshot : [];
  return <div style={{ marginBottom: 18 }}>
    <h3 style={{ marginBottom: 10 }}>Block Grade Publication History</h3>
    <DataTable rows={releases} rowKey="id" emptyMessage="No collective block grade publications have been recorded."
      columns={[
        { key: "reference", label: "Block Publication Reference", render: (item) => <strong>{item.publication_reference}</strong> },
        { key: "block", label: "Block / Academic Term", render: (item) => <>
          {item.blockCode || item.block_id}<div>{item.termLabel || item.term_id}</div>
        </> },
        { key: "subjects", label: "Subjects", render: (item) => item.expected_subject_count },
        { key: "grades", label: "Student Grades", render: (item) => item.expected_result_count },
        { key: "batches", label: "Source Batches", render: (item) => item.batch_ids.length },
        { key: "status", label: "Status", render: (item) => <StatusBadge value={item.status} /> },
        { key: "published", label: "Published At", render: (item) => dateLabel(item.published_at) },
        { key: "action", label: "Details", render: (item) =>
          <Button variant="ghost" size="sm" onClick={() => setSelectedReleaseId(
            (current) => current === item.id ? null : item.id,
          )}>{selectedReleaseId === item.id ? "Close" : "View Release"}</Button> },
      ]} />
    {selectedRelease ? <div style={{ marginTop: 12 }}>
      <p className="notice" style={{ marginBottom: 12 }}>
        Published block release <strong>{selectedRelease.publication_reference}</strong>:
        {" "}{selectedRelease.expected_subject_count} subjects and {selectedRelease.expected_result_count}
        {" "}student results in one atomic transaction on {dateLabel(selectedRelease.published_at)}.
      </p>
      <h3 style={{ marginBottom: 8 }}>Published Subject Snapshot</h3>
      <DataTable rows={subjectSnapshot}
        rowKey={(subject, index) => subject.subject_code || index}
        emptyMessage="This release has no readable subject snapshot."
        columns={[
          { key: "subject", label: "Subject", render: (subject) => displaySubjectCode(subject.subject_code || "") },
          { key: "count", label: "Student Grade Records", render: (subject) => subject.count ?? "Not recorded" },
        ]} />
      <h3 style={{ marginTop: 14, marginBottom: 8 }}>Published Source Batches</h3>
      <DataTable rows={sourceBatches} rowKey="id" emptyMessage="No matching source batches were returned."
        columns={[
          { key: "file", label: "Source Filename", render: (batch) => batch.file_name },
          { key: "subject", label: "Subject", render: (batch) => displaySubjectCode(batch.subject_code) },
          { key: "source", label: "Source Reference", render: (batch) => batch.source_reference },
          { key: "issuer", label: "Issuing Faculty", render: (batch) => batch.issuer },
          { key: "rows", label: "Grade Rows", render: (batch) => batch.row_count },
          { key: "batch", label: "Batch Reference", render: (batch) => batch.publication_reference || "Not recorded" },
        ]} />
    </div> : null}
  </div>;
}

export default function RegistrarVerifiedGradeWorkspace({ mode = "import" }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [blockId, setBlockId] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [file, setFile] = useState(null);
  const [sourceSystem, setSourceSystem] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [issuer, setIssuer] = useState("");
  const [method, setMethod] = useState("");
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState("");

  const reload = useCallback(async (keepNotice = true) => {
    const data = await loadConfirmedGradeImportWorkspace();
    setWorkspace(data);
    setLoading(false);
    if (!data?.ok) { setError(true); setNotice(data?.message || "Grade records could not be loaded."); }
    else if (!keepNotice) { setError(false); setNotice(""); }
    return data;
  }, []);

  useEffect(() => {
    let current = true;
    loadConfirmedGradeImportWorkspace().then((data) => {
      if (!current) return;
      setWorkspace(data);
      setLoading(false);
      if (!data?.ok) { setError(true); setNotice(data?.message || "Grade records could not be loaded."); }
    }).catch(() => {
      if (!current) return;
      setLoading(false); setError(true); setNotice("The protected grade service is unavailable.");
    });
    return () => { current = false; };
  }, []);

  const blocks = useMemo(() => workspace?.ok ? workspace.blocks : [], [workspace]);
  const batches = useMemo(() => workspace?.ok ? workspace.batches : [], [workspace]);
  const releases = useMemo(() => workspace?.ok ? workspace.releases : [], [workspace]);
  const block = blocks.find((item) => item.id === blockId) || blocks[0];
  const selectedSubject = block?.checklist?.subjects.find((item) => item.code === subjectCode) ||
    block?.checklist?.subjects[0];
  const studentNumbers = new Set(block?.attempts?.map((attempt) => attempt.studentNumber) ||
    block?.subjects?.flatMap((subject) => subject.expected.map((attempt) => attempt.studentNumber)) || []);
  const relevantBatches = mode === "history" ? batches : batches.filter((batch) =>
    batch.term_id === block?.termId &&
    block?.subjects.some((subject) => subject.code === batch.subject_code &&
      subject.expected.some((attempt) => attempt.sectionId === batch.section_id)) &&
    batch.rows.length > 0 && batch.rows.every((row) => studentNumbers.has(row.source_student_number)));
  const selectedBatch = relevantBatches.find((item) => item.id === selectedBatchId) || relevantBatches[0];
  const [historyRows, setHistoryRows] = useState(false);

  async function execute(callback, success) {
    setBusy(true); setError(false); setNotice("");
    try {
      await callback();
      await reload();
      setNotice(success);
      return true;
    } catch (issue) {
      setError(true);
      setNotice(issue?.message || "The grade action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function stageBatch(event) {
    event.preventDefault();
    if (!block || !selectedSubject || !file) {
      setError(true); setNotice("Choose a confirmed subject and grade file."); return;
    }
    const form = new FormData();
    form.set("block_id", block.id);
    form.set("subject_code", selectedSubject.code);
    form.set("file", file);
    form.set("source_system", sourceSystem.trim());
    form.set("source_reference", sourceReference.trim());
    form.set("issuer", issuer.trim());
    if (await execute(() => stageConfirmedBlockGradeBatch(form),
      "Source file staged privately. Validate every row, then verify its faculty source.")) setFile(null);
  }

  function verifySelected(event) {
    event.preventDefault();
    if (!selectedBatch || selectedBatch.status !== "PENDING_VERIFICATION" ||
      !verificationConfirmed || !method.trim()) return;
    execute(() => attestOfficialGradeSource(selectedBatch.id,
      selectedBatch.source_reference, selectedBatch.source_checksum, method.trim()),
    "Source attestation recorded. Other subjects may still need verified grade batches.");
    setVerificationConfirmed(false);
  }

  async function publishBlock() {
    if (!block?.checklist?.allVerified || !publishConfirmed) return;
    setPublishing(false);
    await execute(() => publishCompleteGradeBlock(block.id),
      "All confirmed subject results for the block were released through one protected transaction.");
    setPublishConfirmed(false);
  }

  if (loading) return <Panel title="Confirmed Grade Imports"><p role="status">Loading authenticated grade records...</p></Panel>;
  if (!workspace?.ok) return <Panel title="Confirmed Grade Imports">
    <Feedback message={notice} warning />
    <Button variant="secondary" onClick={() => { setLoading(true); reload(false); }}>Try Again</Button>
  </Panel>;

  return <>
    <Panel title={mode === "history" ? "Verified Grade Import History" : "Confirmed Block Grades"}
      subtitle={mode === "history" ?
        "Review privately staged batches, validation issues, source verification and collective publication." :
        "Upload subject files progressively. All subjects and registered students must pass verification before one atomic block publication."}>
      <p className="notice warning" style={{ marginBottom: 14 }}>
        Academic grade publication requires confirmed historical enrollment attempts and authenticated faculty evidence.
        The {workspace.projectOnlyExcluded} fictional PROJECT_ONLY student records remain separate from official academic results.
      </p>
      {mode === "history" ? <BlockReleaseHistory releases={releases} batches={batches} /> : null}
      <div className="toolbar">
        <FilterControl label="Previous Confirmed Block and Term"
          value={block?.id || ""} onChange={(id) => { setBlockId(id); setSubjectCode(""); setSelectedBatchId(""); }}
          options={blocks.map((item) => ({
            value: item.id, label: `${item.code} · ${item.termLabel} · ${item.programCode}`,
          }))} />
        <Button variant="ghost" onClick={() => { setLoading(true); reload(false); }}>Refresh Confirmed Records</Button>
      </div>
      {!block ? <>
        <p className="notice">
        No confirmed previous block and term can be reconciled to published subject sections.
        The 600 fictional student histories do not qualify as official confirmed attempts.
        </p>
        {mode === "history" ? <>
          <h3 style={{ marginTop: 15, marginBottom: 9 }}>Protected Batch History</h3>
          <DataTable rows={relevantBatches} rowKey="id" emptyMessage="No authenticated grade source batches have been staged."
            columns={[
              { key: "file", label: "Source File", render: (item) => item.file_name },
              { key: "term", label: "Term", render: (item) => item.term_id },
              { key: "subject", label: "Subject", render: (item) => displaySubjectCode(item.subject_code) },
              { key: "status", label: "Import Status", render: (item) => <StatusBadge value={item.status} /> },
              { key: "rows", label: "Rows", render: (item) => item.row_count },
              { key: "blockRef", label: "Block Publication Ref.", render: (item) => item.block_publication_reference || "Not collectively published" },
              { key: "date", label: "Created", render: (item) => dateLabel(item.created_at) },
              { key: "action", label: "Details", render: (item) =>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedBatchId(item.id); setHistoryRows(true); }}>View Rows</Button> },
            ]} />
          {historyRows && selectedBatch ? <>
            <p className="notice" style={{ marginTop: 10 }}>
              {selectedBatch.file_name} · {simpleStatus(selectedBatch.status)}.
              Batch reference: {selectedBatch.publication_reference || "Not published"}.
              Block publication: {selectedBatch.block_publication_reference || "Not collectively published"}.
            </p>
            <div className="info-grid" style={{ marginTop: 10, marginBottom: 12 }}>
              <div>Source System: <strong>{selectedBatch.source_system}</strong></div>
              <div>Faculty Source: <strong>{selectedBatch.issuer}</strong></div>
              <div>Source Reference: <strong>{selectedBatch.source_reference}</strong></div>
              <div>Verification Method: <strong>{selectedBatch.verification_method || "Pending"}</strong></div>
              <div>Verification Date: <strong>{dateLabel(selectedBatch.verified_at)}</strong></div>
              <div>Source SHA256: <code style={{ overflowWrap: "anywhere" }}>{selectedBatch.source_checksum}</code></div>
            </div>
            <DataTable rows={selectedBatch.rows} rowKey={(row) => `${row.batch_id}:${row.source_row_number}`}
              columns={[
                { key: "student", label: "Student", render: (row) => row.source_student_number },
                { key: "grade", label: "Grade", render: (row) => row.raw_grade_text },
                { key: "completion", label: "Outcome", render: (row) => row.completion_status || "Invalid" },
                { key: "status", label: "Validation", render: (row) => <StatusBadge value={row.validation_status} /> },
                { key: "errors", label: "Issues", render: (row) => (row.error_details || []).join(", ") || "None" },
              ]} />
          </> : null}
        </> : null}
      </> : <>
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <Metric label="Required Subjects" value={block.checklist.subjects.length} />
          <Metric label="Verified / Required Grades" value={`${block.checklist.verifiedAttempts} / ${block.checklist.requiredAttempts}`} />
          <Metric label="Verification Progress" value={`${block.checklist.verifiedPercent}%`} />
          <Metric label="Missing Verified Grades" value={block.checklist.missing} />
          <Metric label="Conflicts" value={block.checklist.errors} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="confirmed-block-grade-progress" style={{ display: "block", marginBottom: 6 }}>
            Verified source coverage: {block.checklist.verifiedAttempts} of {block.checklist.requiredAttempts} registered grades
          </label>
          <progress id="confirmed-block-grade-progress" aria-label="Verified grade coverage"
            max={100} value={block.checklist.verifiedPercent} style={{ width: "100%" }} />
        </div>
        {block.release?.status === "PUBLISHED" ? <p className="notice" style={{ marginBottom: 16 }}>
          This block was collectively published as <strong>{block.release.publication_reference}</strong> on
          {" "}{dateLabel(block.release.published_at)}. The release covers {block.release.expected_subject_count} subjects and
          {" "}{block.release.expected_result_count} student grades from {block.release.batch_ids.length} verified source batches.
        </p> : null}
        <h3 style={{ marginBottom: 10 }}>Previous Block Subject Checklist</h3>
        <DataTable rows={block.checklist.subjects} rowKey="code" columns={[
          { key: "subject", label: "Previous Subject", render: (row) => <><strong>{displaySubjectCode(row.code)}</strong><div>{row.name}</div></> },
          { key: "expected", label: "Confirmed Students", render: (row) => row.expected.length },
          { key: "verified", label: "Verified Source Rows", render: (row) => row.verified },
          { key: "coverage", label: "Verification", render: (row) => `${row.expected.length ? Math.round(row.verified * 100 / row.expected.length) : 0}%` },
          { key: "missing", label: "Missing", render: (row) => row.missing },
          { key: "status", label: "Readiness", render: (row) => <StatusBadge value={row.status} label={simpleStatus(row.status)} /> },
          { key: "action", label: "Action", render: (row) => <Button variant="ghost" size="sm" onClick={() => setSubjectCode(row.code)}>Select Subject</Button> },
        ]} />
        {mode === "import" ? <>
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 10 }}>Upload Grade Batch</h3>
            <p className="notice" style={{ marginBottom: 10 }}>The selected subject may be uploaded in separate faculty batches. Only students with confirmed attempts are accepted.</p>
            <p className="notice" style={{ marginBottom: 10 }}>
              The protected database retains parsed grade rows, file name, source reference and a SHA256 checksum.
              The original Excel or CSV file is not stored in Supabase Storage.
            </p>
            <FilterControl label="Subject" value={selectedSubject?.code || ""}
              onChange={(next) => { setSubjectCode(next); setFile(null); }}
              options={block.checklist.subjects.map((row) => ({ value: row.code, label: `${displaySubjectCode(row.code)} · ${row.name}` }))} />
            {selectedSubject ? <>
              <div className="summary-strip" style={{ marginTop: 10, marginBottom: 12 }}>
                <span>Expected student rows: <strong>{selectedSubject.expected.length}</strong></span>
                <span>Verified: <strong>{selectedSubject.verified}</strong></span>
                <span>Remaining: <strong>{selectedSubject.missing}</strong></span>
              </div>
              <Button type="button" variant="secondary" onClick={() => downloadRosterCsv(selectedSubject)}>
                Download Confirmed Roster CSV
              </Button>
              <form onSubmit={stageBatch} className="form-grid" style={{ marginTop: 12 }}>
                <label className="field">Source Institution or System
                  <input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} required maxLength={240} placeholder="Faculty grade submission system" />
                </label>
                <label className="field">Verified Document Reference
                  <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} required maxLength={240} />
                </label>
                <label className="field">Issuing Faculty Member
                  <input value={issuer} onChange={(event) => setIssuer(event.target.value)} required maxLength={240} />
                </label>
                <div className="field full">
                  <RegistrarGradeUploadPicker file={file} onFileSelected={setFile} disabled={busy} />
                </div>
                <div className="field full">
                  <Button type="submit" disabled={busy || !file}>Stage Confidential Grade File</Button>
                </div>
              </form>
            </> : null}
          </div>
        </> : null}
        <div style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 10 }}>Faculty Batches and Verification</h3>
          <DataTable rows={relevantBatches} rowKey="id" emptyMessage="No authenticated source grade batches are staged for this block."
            columns={[
              { key: "file", label: "File", render: (batch) => <>{batch.file_name}<div>{displaySubjectCode(batch.subject_code)}</div></> },
              { key: "rows", label: "Rows", render: (batch) => batch.row_count },
              { key: "source", label: "Faculty Source", render: (batch) => batch.issuer },
              { key: "blockRef", label: "Block Publication Ref.", render: (batch) => batch.block_publication_reference || "Pending collective release" },
              { key: "status", label: "Status", render: (batch) => <StatusBadge value={batch.status} /> },
              { key: "date", label: "Staged", render: (batch) => dateLabel(batch.created_at) },
              { key: "action", label: "Review", render: (batch) =>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedBatchId(batch.id); setHistoryRows(true); }}>View Batch</Button> },
            ]} />
          {selectedBatch ? <div style={{ marginTop: 14 }}>
            <div className="summary-strip" style={{ marginBottom: 10 }}>
              <span>Source reference: <strong>{selectedBatch.source_reference}</strong></span>
              <span>Status: <strong>{simpleStatus(selectedBatch.status)}</strong></span>
              <span>Verified at: <strong>{dateLabel(selectedBatch.verified_at)}</strong></span>
              <span>Block publication: <strong>{selectedBatch.block_publication_reference || "Not published"}</strong></span>
            </div>
            <div className="info-grid" style={{ marginBottom: 12 }}>
              <div>Source System: <strong>{selectedBatch.source_system}</strong></div>
              <div>Faculty Source: <strong>{selectedBatch.issuer}</strong></div>
              <div>Source Document Reference: <strong>{selectedBatch.source_reference}</strong></div>
              <div>Verification Method: <strong>{selectedBatch.verification_method || "Pending"}</strong></div>
              <div>File SHA256: <code style={{ overflowWrap: "anywhere" }}>{selectedBatch.source_checksum}</code></div>
            </div>
            <div className="action-row">
              <Button disabled={busy || !["UPLOADED", "REQUIRES_CORRECTION"].includes(selectedBatch.status)}
                onClick={() => execute(() => validateOfficialGradeImport(selectedBatch.id), "Validation finished. Inspect row errors and verify the source before continuing.")}>
                Validate Selected Batch
              </Button>
              <Button variant="ghost" onClick={() => setHistoryRows(!historyRows)}>{historyRows ? "Hide Row Details" : "View Row Details"}</Button>
            </div>
            {historyRows ? <DataTable rows={selectedBatch.rows} rowKey={(row) => `${row.batch_id}:${row.source_row_number}`}
              columns={[
                { key: "student", label: "Student", render: (row) => row.source_student_number },
                { key: "grade", label: "Grade", render: (row) => row.raw_grade_text },
                { key: "completion", label: "Outcome", render: (row) => row.completion_status || "Invalid" },
                { key: "status", label: "Validation", render: (row) => <StatusBadge value={row.validation_status} /> },
                { key: "errors", label: "Issues", render: (row) => (row.error_details || []).join(", ") || "None" },
              ]} /> : null}
            {mode === "import" && selectedBatch.status === "PENDING_VERIFICATION" ? <form onSubmit={verifySelected} style={{ marginTop: 14 }}>
              <h3>Faculty Source Verification</h3>
              <label className="field">How was this source independently verified?
                <input value={method} onChange={(event) => setMethod(event.target.value)} required
                  placeholder="Signed faculty submission and registrar source comparison" />
              </label>
              <label className="field" style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <input type="checkbox" checked={verificationConfirmed} onChange={(event) => setVerificationConfirmed(event.target.checked)} />
                I checked the faculty source and its original document reference.
              </label>
              <Button type="submit" disabled={busy || !verificationConfirmed || !method.trim()}>Verify This Source Batch</Button>
            </form> : null}
          </div> : null}
        </div>
        {mode === "import" ? <div style={{ marginTop: 18 }}>
          <Panel title="Collective Grade Publication" subtitle="Release every subject in the previous block and term together.">
            <p className="notice" style={{ marginBottom: 12 }}>
              Publication is blocked until all {block.checklist.subjects.length} subjects, all confirmed student attempts,
              and all source batches are verified. Failed and incomplete outcomes remain valid recorded results.
            </p>
            {block.release?.status === "PUBLISHED" ? <StatusBadge value="PUBLISHED" label="Block results published" /> :
              <Button disabled={!block.checklist.allVerified || busy || Boolean(block.release)}
                onClick={() => { setPublishConfirmed(false); setPublishing(true); }}>Publish Entire Verified Block</Button>}
          </Panel>
        </div> : null}
      </>}
      <Feedback message={notice} warning={error} />
    </Panel>
    <Modal open={publishing && Boolean(block)} title="Publish Every Subject Together"
      onClose={() => setPublishing(false)}
      footer={<>
        <Button variant="ghost" onClick={() => setPublishing(false)}>Cancel</Button>
        <Button disabled={!publishConfirmed || busy || !block?.checklist?.allVerified} onClick={publishBlock}>
          Confirm Collective Publication
        </Button>
      </>}>
      <p>All verified results for <strong>{block?.code}</strong> in <strong>{block?.termLabel}</strong> will be
        committed in one transaction, including FAILED and INCOMPLETE results. Published grades are protected by controlled revision history.</p>
      <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 12 }}>
        <input type="checkbox" checked={publishConfirmed} onChange={(event) => setPublishConfirmed(event.target.checked)} />
        I reviewed every required subject, confirmed roster, verified faculty source and validation result.
      </label>
    </Modal>
  </>;
}
