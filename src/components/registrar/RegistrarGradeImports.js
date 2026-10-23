"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Button,
  DataTable,
  Modal,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Panel } from "./RegistrarShared";
import RegistrarActionResultModal from "./RegistrarActionResultModal";
import RegistrarGradeUploadPicker from "./RegistrarGradeUploadPicker";
import {
  previewRegistrarGradeImport,
  publishRegistrarGradeImport,
  stageRegistrarGradeImport,
  validateRegistrarGradeImport,
  verifyRegistrarGradeSource,
} from "@/features/registrar/registrar-actions";

const NONE = "";

function uniqueOptions(rows, valueKey, labelKey = valueKey) {
  const map = new Map();
  for (const row of rows || []) {
    const value = row[valueKey];
    if (!value) continue;
    map.set(value, row[labelKey] || value);
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function contextFormData({ file, context, sourceReference, issuer }) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("term_id", context.termId);
  formData.set("academic_year", context.academicYear);
  formData.set("semester", context.semester);
  formData.set("college_code", context.collegeCode);
  formData.set("program_code", context.programCode);
  formData.set(
    "previous_block_code",
    context.previousBlockAvailable ? context.previousBlockCode : "",
  );
  formData.set("subject_code", context.subjectCode);
  formData.set("section_id", context.sectionId);
  formData.set("section_code", context.sectionCode);
  formData.set("instructor_id", context.instructorId || "");
  formData.set("instructor_name", context.instructorName || "");
  formData.set("source_system", "OFFICIAL_GRADE_UPLOAD");
  formData.set("source_reference", sourceReference);
  formData.set("issuer", issuer);
  return formData;
}

function statusLabel(status) {
  return String(status || "NOT_STARTED")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RegistrarGradeImports({ data, historyOnly = false }) {
  const contexts = data.gradeImportContexts || [];
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState(null);
  const [academicYear, setAcademicYear] = useState(NONE);
  const [semester, setSemester] = useState(NONE);
  const [collegeCode, setCollegeCode] = useState(NONE);
  const [programCode, setProgramCode] = useState(NONE);
  const [previousBlockCode, setPreviousBlockCode] = useState(NONE);
  const [subjectCode, setSubjectCode] = useState(NONE);
  const [sectionId, setSectionId] = useState(NONE);
  const [file, setFile] = useState(null);
  const [sourceReference, setSourceReference] = useState("");
  const [issuer, setIssuer] = useState("");
  const [preview, setPreview] = useState(null);
  const [activeBatch, setActiveBatch] = useState(null);
  const [verificationMethod, setVerificationMethod] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [sessionProgress, setSessionProgress] = useState({});

  const yearRows = contexts;
  const semesterRows = contexts.filter((row) => row.academicYear === academicYear);
  const collegeRows = semesterRows.filter((row) => row.semester === semester);
  const programRows = collegeRows.filter((row) => row.collegeCode === collegeCode);
  const blockRows = programRows.filter((row) => row.programCode === programCode);
  const subjectRows = blockRows.filter((row) => row.previousBlockCode === previousBlockCode);
  const sectionRows = subjectRows.filter((row) => row.subjectCode === subjectCode);

  const selectedContext = contexts.find((row) => row.sectionId === sectionId) || null;

  const groupContexts = useMemo(
    () =>
      contexts.filter(
        (row) =>
          row.academicYear === academicYear &&
          row.semester === semester &&
          row.collegeCode === collegeCode &&
          row.programCode === programCode &&
          row.previousBlockCode === previousBlockCode,
      ),
    [contexts, academicYear, semester, collegeCode, programCode, previousBlockCode],
  );

  function clearUploadState() {
    setFile(null);
    setPreview(null);
    setActiveBatch(null);
    setVerificationMethod("");
    setPublishOpen(false);
  }

  function resetAfter(field) {
    clearUploadState();
    setSourceReference("");
    setIssuer("");
    if (field === "year") {
      setSemester(NONE);
      setCollegeCode(NONE);
      setProgramCode(NONE);
      setPreviousBlockCode(NONE);
      setSubjectCode(NONE);
      setSectionId(NONE);
    } else if (field === "semester") {
      setCollegeCode(NONE);
      setProgramCode(NONE);
      setPreviousBlockCode(NONE);
      setSubjectCode(NONE);
      setSectionId(NONE);
    } else if (field === "college") {
      setProgramCode(NONE);
      setPreviousBlockCode(NONE);
      setSubjectCode(NONE);
      setSectionId(NONE);
    } else if (field === "program") {
      setPreviousBlockCode(NONE);
      setSubjectCode(NONE);
      setSectionId(NONE);
    } else if (field === "block") {
      setSubjectCode(NONE);
      setSectionId(NONE);
    } else if (field === "subject") {
      setSectionId(NONE);
    }
  }

  function run(action, onSuccess) {
    startTransition(async () => {
      const response = await action();
      setResult(response);
      if (response.ok) onSuccess?.(response);
    });
  }

  function updateProgress(contextId, status, extra = {}) {
    setSessionProgress((current) => ({
      ...current,
      [contextId]: {
        ...(current[contextId] || {}),
        status,
        ...extra,
      },
    }));
  }

  function previewFile() {
    if (!file || !selectedContext) return;
    const formData = contextFormData({ file, context: selectedContext, sourceReference, issuer });
    run(() => previewRegistrarGradeImport(formData), (response) => {
      setPreview(response.data);
      updateProgress(
        selectedContext.id,
        response.data.invalidRows ? "PREVIEW_REQUIRES_CORRECTION" : "PREVIEW_READY",
      );
    });
  }

  function stageAndValidate() {
    if (!file || !selectedContext || !preview || preview.invalidRows) return;
    const formData = contextFormData({ file, context: selectedContext, sourceReference, issuer });

    startTransition(async () => {
      const staged = await stageRegistrarGradeImport(formData);
      setResult(staged);
      if (!staged.ok) return;

      const batch = {
        batchId: staged.data.batchId,
        checksum: staged.data.checksum,
        stagedRows: staged.data.stagedRows,
        sourceReference,
        status: "UPLOADED",
        context: staged.data.context,
      };
      setActiveBatch(batch);
      updateProgress(selectedContext.id, "UPLOADED", { batchId: batch.batchId });

      const validated = await validateRegistrarGradeImport(batch.batchId);
      setResult(validated);
      if (!validated.ok) return;

      const nextStatus = validated.data?.invalid_rows
        ? "REQUIRES_CORRECTION"
        : "PENDING_VERIFICATION";
      setActiveBatch((current) => ({
        ...current,
        status: nextStatus,
        validation: validated.data,
      }));
      updateProgress(selectedContext.id, nextStatus, {
        batchId: batch.batchId,
        validation: validated.data,
      });
    });
  }

  function verify() {
    run(
      () =>
        verifyRegistrarGradeSource({
          batchId: activeBatch.batchId,
          sourceReference: activeBatch.sourceReference,
          checksum: activeBatch.checksum,
          method: verificationMethod,
        }),
      () => {
        setActiveBatch((current) => ({ ...current, status: "VALIDATED" }));
        updateProgress(selectedContext.id, "VALIDATED", { batchId: activeBatch.batchId });
      },
    );
  }

  function publish() {
    run(() => publishRegistrarGradeImport(activeBatch.batchId), (response) => {
      setPublishOpen(false);
      setActiveBatch((current) => ({
        ...current,
        status: "PUBLISHED",
        publication: response.data,
      }));
      updateProgress(selectedContext.id, "PUBLISHED", {
        batchId: activeBatch.batchId,
        publicationReference: response.data?.reference || "Not available",
      });
    });
  }

  if (historyOnly) {
    return (
      <Panel
        title="Grade Import History"
        subtitle="Published grade batches and corrections must remain traceable without exposing private staging tables directly."
      >
        <div className="notice warning">
          <strong>History access still needs one protected read contract.</strong>
          <p>
            The live database already preserves batch metadata, publication references, row validation state,
            and authorized grade revisions. Those tables intentionally deny direct Registrar SELECT access,
            and no protected history reader currently exists. This page therefore does not fabricate history.
          </p>
        </div>
        <div className="detail-list" style={{ marginTop: 14 }}>
          <div className="detail-row"><span>Imported Subject</span><strong>Preserved in database · reader unavailable</strong></div>
          <div className="detail-row"><span>Academic Term / Section</span><strong>Preserved in database · reader unavailable</strong></div>
          <div className="detail-row"><span>Importer / Upload Date</span><strong>Preserved in database · reader unavailable</strong></div>
          <div className="detail-row"><span>Validation / Publication Status</span><strong>Preserved in database · reader unavailable</strong></div>
          <div className="detail-row"><span>Publication Reference</span><strong>Preserved in database · reader unavailable</strong></div>
          <div className="detail-row"><span>Corrections / Revisions</span><strong>Preserved in database · reader unavailable</strong></div>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <Panel
        title="Official Grades Import"
        subtitle="Upload one official XLSX or CSV per subject section. Academic context is derived only from confirmed institutional enrollment attempts, never from PROJECT_ONLY / P8F26 records."
      >
        <div className="notice warning" style={{ marginBottom: 14 }}>
          <strong>Official academic records</strong>
          <p>
            Publication writes real academic results. PROJECT_ONLY students are deliberately blocked from this pipeline.
            Successful publication automatically refreshes the affected official student subject eligibility through the existing database trigger.
          </p>
        </div>

        {!contexts.length ? (
          <div className="notice">
            No confirmed official subject attempts are currently available as a safe grade import context.
          </div>
        ) : (
          <>
            <h3>Step 1 · Select Academic Context</h3>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="field">
                <span>Academic Year</span>
                <select value={academicYear} disabled={Boolean(activeBatch)} onChange={(event) => { setAcademicYear(event.target.value); resetAfter("year"); }}>
                  <option value="">Select academic year</option>
                  {uniqueOptions(yearRows, "academicYear").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Semester</span>
                <select value={semester} disabled={!academicYear || Boolean(activeBatch)} onChange={(event) => { setSemester(event.target.value); resetAfter("semester"); }}>
                  <option value="">Select semester</option>
                  {uniqueOptions(semesterRows, "semester").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span>College</span>
                <select value={collegeCode} disabled={!semester || Boolean(activeBatch)} onChange={(event) => { setCollegeCode(event.target.value); resetAfter("college"); }}>
                  <option value="">Select college</option>
                  {uniqueOptions(collegeRows, "collegeCode", "collegeName").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Program</span>
                <select value={programCode} disabled={!collegeCode || Boolean(activeBatch)} onChange={(event) => { setProgramCode(event.target.value); resetAfter("program"); }}>
                  <option value="">Select program</option>
                  {uniqueOptions(programRows, "programCode", "programName").map((item) => <option key={item.value} value={item.value}>{item.value} · {item.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Previous Block Section</span>
                <select value={previousBlockCode} disabled={!programCode || Boolean(activeBatch)} onChange={(event) => { setPreviousBlockCode(event.target.value); resetAfter("block"); }}>
                  <option value="">Select previous block</option>
                  {uniqueOptions(blockRows, "previousBlockCode").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Subject</span>
                <select value={subjectCode} disabled={!previousBlockCode || Boolean(activeBatch)} onChange={(event) => { setSubjectCode(event.target.value); resetAfter("subject"); }}>
                  <option value="">Select subject</option>
                  {uniqueOptions(subjectRows, "subjectCode", "subjectName").map((item) => <option key={item.value} value={item.value}>{item.value} · {item.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Subject Section</span>
                <select value={sectionId} disabled={!subjectCode || Boolean(activeBatch)} onChange={(event) => { setSectionId(event.target.value); clearUploadState(); setSourceReference(""); setIssuer(""); }}>
                  <option value="">Select section</option>
                  {sectionRows.map((item) => <option key={item.sectionId} value={item.sectionId}>{item.sectionCode}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Professor</span>
                <input value={selectedContext?.instructorName || "Not available"} readOnly />
              </label>
            </div>

            {selectedContext ? (
              <div style={{ marginTop: 14 }}>
                <Details
                  items={[
                    ["Academic Term", selectedContext.termLabel],
                    ["College", selectedContext.collegeName],
                    ["Program", `${selectedContext.programCode} · ${selectedContext.programName}`],
                    ["Previous Block Section", selectedContext.previousBlockCode],
                    ["Subject", `${selectedContext.subjectCode} · ${selectedContext.subjectName}`],
                    ["Subject Section", selectedContext.sectionCode],
                    ["Professor", selectedContext.instructorName],
                    ["Confirmed Attempts", selectedContext.confirmedStudentCount],
                    ["Section Source", selectedContext.sourceSystem],
                  ]}
                />

                {!selectedContext.previousBlockAvailable ? (
                  <div className="notice" style={{ marginTop: 12 }}>
                    The current official data has no historical block assignment linked to these confirmed attempts.
                    The Previous Block Section label remains visible as <strong>Not available</strong>; the exact official subject section is still verified before staging.
                  </div>
                ) : null}
              </div>
            ) : null}

            {groupContexts.length ? (
              <div style={{ marginTop: 18 }}>
                <h3>Subject Files for Selected Academic Context</h3>
                <DataTable
                  rowKey="id"
                  rows={groupContexts}
                  columns={[
                    { key: "subjectCode", label: "Subject Code" },
                    { key: "subjectName", label: "Subject" },
                    { key: "sectionCode", label: "Section" },
                    { key: "instructorName", label: "Professor" },
                    { key: "confirmedStudentCount", label: "Confirmed Attempts" },
                    {
                      key: "sessionStatus",
                      label: "This Session",
                      render: (row) => {
                        const value = sessionProgress[row.id]?.status || "NOT_STARTED";
                        return <StatusBadge value={value === "PUBLISHED" ? "COMPLETED" : value} label={statusLabel(value)} />;
                      },
                    },
                  ]}
                />
                <div className="notice" style={{ marginTop: 10 }}>
                  This checklist is current-session progress only. Persistent historical batch status requires the protected Grade Import History reader that is not yet present in the database.
                </div>
              </div>
            ) : null}

            <h3 style={{ marginTop: 22 }}>Step 2 · Upload Official Grade File</h3>
            <div className="notice" style={{ margin: "12px 0" }}>
              Required columns: <strong>student_number, student_full_name, subject_code, academic_year, semester, section_code, grade_value, completion_status, source_record_reference</strong>.
              Optional column: <strong>previous_block_section</strong>. One file must contain one subject and one subject section only.
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Source Reference</span>
                <input value={sourceReference} disabled={!selectedContext || Boolean(activeBatch)} onChange={(event) => { setSourceReference(event.target.value); setPreview(null); }} placeholder="Official submission / transmittal reference" />
              </label>
              <label className="field">
                <span>Issuer / Source Authority</span>
                <input value={issuer} disabled={!selectedContext || Boolean(activeBatch)} onChange={(event) => { setIssuer(event.target.value); setPreview(null); }} placeholder="Professor, college office, or authorized source" />
              </label>
              <div className="field full">
                <RegistrarGradeUploadPicker file={file} onFileSelected={(nextFile) => { setFile(nextFile); setPreview(null); }} disabled={!selectedContext || Boolean(activeBatch)} />
              </div>
            </div>

            {!activeBatch ? (
              <div className="action-row" style={{ marginTop: 14 }}>
                <Button
                  disabled={isPending || !selectedContext || !file || !sourceReference.trim() || !issuer.trim()}
                  onClick={previewFile}
                >
                  {isPending ? "Checking File..." : "Preview & Precheck"}
                </Button>
                {preview?.invalidRows === 0 ? (
                  <Button disabled={isPending} onClick={stageAndValidate}>
                    {isPending ? "Staging & Validating..." : "Stage & Validate with Database"}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {preview ? (
              <div style={{ marginTop: 20 }}>
                <h3>Steps 3–4 · Validation Preview</h3>
                <Details
                  items={[
                    ["File", preview.fileName],
                    ["Rows", preview.rowCount],
                    ["Precheck Valid", preview.validRows],
                    ["Requires Correction", preview.invalidRows],
                    ["Checksum", preview.checksum],
                    ["Student Name Consistency", "Source name shown; authoritative name comparison is a backend gap"],
                  ]}
                />
                <DataTable
                  rowKey="rowNumber"
                  rows={preview.rows}
                  columns={[
                    { key: "rowNumber", label: "Row" },
                    { key: "studentNumber", label: "Student ID" },
                    { key: "studentFullName", label: "Student Name" },
                    { key: "gradeValue", label: "Grade" },
                    { key: "completionStatus", label: "Completion" },
                    { key: "validationStatus", label: "Precheck", render: (row) => <StatusBadge value={row.validationStatus === "PRECHECK_VALID" ? "VALID" : "REQUIRES_CORRECTION"} label={row.validationStatus === "PRECHECK_VALID" ? "Precheck Valid" : "Requires Correction"} /> },
                    { key: "issues", label: "Issues", render: (row) => row.issues.length ? row.issues.map((item) => item.code).join(", ") : "None" },
                  ]}
                />
                {preview.invalidRows ? (
                  <div className="notice warning" style={{ marginTop: 12 }}>
                    Correct the source file and preview it again. Invalid rows are never staged or published.
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeBatch ? (
              <div style={{ marginTop: 22 }}>
                <h3>Protected Database Validation</h3>
                <Details
                  items={[
                    ["Batch Reference", activeBatch.batchId],
                    ["Staged Rows", activeBatch.stagedRows],
                    ["Checksum", activeBatch.checksum],
                    ["Source Reference", activeBatch.sourceReference],
                    ["Current Status", statusLabel(activeBatch.status)],
                    ["Valid Rows", activeBatch.validation?.valid_rows ?? "Not available"],
                    ["Invalid Rows", activeBatch.validation?.invalid_rows ?? "Not available"],
                  ]}
                />

                {activeBatch.status === "REQUIRES_CORRECTION" ? (
                  <div className="notice warning" style={{ marginTop: 12 }}>
                    The protected database validator found rows requiring correction. The current backend returns the count but does not expose private row-level validation details to Registrar. Start a corrected new batch after fixing the source file.
                  </div>
                ) : null}

                {activeBatch.status === "PENDING_VERIFICATION" ? (
                  <div style={{ marginTop: 16 }}>
                    <h3>Step 5 · Verify Official Source</h3>
                    <div className="form-grid" style={{ marginTop: 10 }}>
                      <label className="field full">
                        <span>Verification Method</span>
                        <input value={verificationMethod} onChange={(event) => setVerificationMethod(event.target.value)} placeholder="How the official source was independently verified" />
                      </label>
                    </div>
                    <div className="action-row" style={{ marginTop: 12 }}>
                      <Button disabled={isPending || !verificationMethod.trim()} onClick={verify}>
                        {isPending ? "Verifying..." : "Verify Official Source"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {activeBatch.status === "VALIDATED" ? (
                  <div className="action-row" style={{ marginTop: 16 }}>
                    <Button disabled={isPending} onClick={() => setPublishOpen(true)}>
                      Publish Student Grades
                    </Button>
                  </div>
                ) : null}

                {activeBatch.status === "PUBLISHED" ? (
                  <div className="notice" style={{ marginTop: 14 }}>
                    <strong>Publication completed.</strong>
                    <p>
                      Official academic results were committed atomically. Existing database triggers refresh affected official subject eligibility. Academic classification, prepared-enrollment refresh, and student notification are not claimed here because those post-publication contracts do not currently exist.
                    </p>
                    <p>Publication Reference: <strong>{activeBatch.publication?.reference || "Not available"}</strong></p>
                  </div>
                ) : null}

                <div className="action-row" style={{ marginTop: 14 }}>
                  <Button
                    variant="ghost"
                    disabled={isPending && activeBatch.status !== "REQUIRES_CORRECTION"}
                    onClick={() => {
                      clearUploadState();
                      setSourceReference("");
                      setIssuer("");
                    }}
                  >
                    Start Another Subject File
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <Modal
        open={publishOpen}
        title="Publish Official Student Grades"
        onClose={() => setPublishOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button disabled={isPending} onClick={publish}>
              {isPending ? "Publishing..." : "Confirm Official Publication"}
            </Button>
          </>
        }
      >
        <div className="notice warning">
          <strong>This writes official academic records.</strong>
          <p>
            The trusted backend rechecks the verified checksum, every row, the confirmed enrollment attempt,
            the exact subject section, and existing official results inside one publication transaction.
            A failure prevents partial publication.
          </p>
        </div>
        <Details
          items={[
            ["Academic Year", selectedContext?.academicYear || "Not available"],
            ["Semester", selectedContext?.semester || "Not available"],
            ["Program", selectedContext ? `${selectedContext.programCode} · ${selectedContext.programName}` : "Not available"],
            ["Previous Block", selectedContext?.previousBlockCode || "Not available"],
            ["Subject", selectedContext ? `${selectedContext.subjectCode} · ${selectedContext.subjectName}` : "Not available"],
            ["Section", selectedContext?.sectionCode || "Not available"],
            ["Professor", selectedContext?.instructorName || "Not available"],
            ["Batch Reference", activeBatch?.batchId || "Not available"],
            ["Source Reference", activeBatch?.sourceReference || "Not available"],
            ["Checksum", activeBatch?.checksum || "Not available"],
          ]}
        />
      </Modal>

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
