"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Button,
  DataTable,
  Modal,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Panel } from "./RegistrarShared";
import RegistrarActionResultModal from "./RegistrarActionResultModal";
import RegistrarGradeUploadPicker from "./RegistrarGradeUploadPicker";
import RegistrarProjectGradeWorkspace from "@/features/grade-import/RegistrarProjectGradeWorkspace";
import {
  previewRegistrarGradeImport,
  publishRegistrarGradeImport,
  stageRegistrarGradeImport,
  validateRegistrarGradeImport,
  verifyRegistrarGradeSource,
} from "@/features/registrar/registrar-actions";
import { registrarDebug } from "@/features/registrar/registrar-client-utils";
import { displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";

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

function GradeSourceSelector({ value, onChange }) {
  return <div className="summary-strip" style={{ alignItems: "center", gap: 14, padding: "10px 14px", marginBottom: 12 }}>
    <label className="field" style={{ flex: "0 1 430px", minWidth: "min(100%, 260px)" }}>
      <span>Grade Record Type</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="PROJECT_ONLY">Project demonstration grades (PROJECT_ONLY)</option>
        <option value="INSTITUTIONAL">Official university grades (INSTITUTIONAL)</option>
      </select>
    </label>
    <p style={{ flex: "1 1 240px", color: "var(--portal-muted)", fontSize: ".74rem", lineHeight: 1.5 }}>
      {value === "PROJECT_ONLY"
        ? "Practice records only. These uploads never change official student grades."
        : "Official academic records. Importing and publishing requires verified institutional evidence."}
    </p>
  </div>;
}

export default function RegistrarGradeImports({ data, historyOnly = false }) {
  const contexts = useMemo(() => data.gradeImportContexts || [], [data.gradeImportContexts]);
  const [sourceKind, setSourceKind] = useState("PROJECT_ONLY");
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

  useEffect(() => {
    if (historyOnly && !data.gradeHistoryAvailable) {
      registrarDebug(
        "warn",
        "Grade Import History",
        "History is not exposed to the Registrar by the current authorized data contract.",
      );
    }
  }, [historyOnly, data.gradeHistoryAvailable]);

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

  if (sourceKind === "PROJECT_ONLY") {
    return <>
      <GradeSourceSelector value={sourceKind} onChange={setSourceKind} />
      <RegistrarProjectGradeWorkspace historyOnly={historyOnly} />
    </>;
  }

  if (historyOnly) {
    return (
      <>
      <GradeSourceSelector value={sourceKind} onChange={setSourceKind} />
      <Panel
        title="Grade Import History"
        subtitle="Review previously imported and published grade files."
      >
        <div className="notice warning">
          <strong>Grade Import History is currently unavailable.</strong>
          <p>Previously published grade files cannot yet be opened from this screen.</p>
        </div>
        <div className="detail-list" style={{ marginTop: 14 }}>
          <div className="detail-row"><span>Imported Subject</span><strong>Unavailable</strong></div>
          <div className="detail-row"><span>Academic Term / Section</span><strong>Unavailable</strong></div>
          <div className="detail-row"><span>Importer / Upload Date</span><strong>Unavailable</strong></div>
          <div className="detail-row"><span>Validation / Publication Status</span><strong>Unavailable</strong></div>
          <div className="detail-row"><span>Publication Reference</span><strong>Unavailable</strong></div>
          <div className="detail-row"><span>Corrections / Revisions</span><strong>Unavailable</strong></div>
        </div>
      </Panel>
      </>
    );
  }

  return (
    <>
      <GradeSourceSelector value={sourceKind} onChange={setSourceKind} />
      <Panel
        title="Official Grades Import"
        subtitle="Upload one official XLSX or CSV grade file for each subject section from the selected academic term."
      >
        <div className="notice warning" style={{ marginBottom: 14 }}>
          <strong>Official academic records</strong>
          <p>
            Publication updates official academic records. Verify the academic context, source, and uploaded grades before publishing.
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
                  {uniqueOptions(subjectRows, "subjectCode", "subjectName").map((item) => <option key={item.value} value={item.value}>{displaySubjectCode(item.value)} · {item.label}</option>)}
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
                    ["Subject", `${displaySubjectCode(selectedContext.subjectCode)} · ${selectedContext.subjectName}`],
                    ["Subject Section", selectedContext.sectionCode],
                    ["Professor", selectedContext.instructorName],
                    ["Students in Section", selectedContext.confirmedStudentCount],
                  ]}
                />

                {!selectedContext.previousBlockAvailable ? (
                  <div className="notice" style={{ marginTop: 12 }}>
                    Previous Block Section is not available for these records. The selected subject section is still used for grade processing.
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
                    { key: "subjectCode", label: "Subject Code", render: (row) => displaySubjectCode(row.subjectCode) },
                    { key: "subjectName", label: "Subject" },
                    { key: "sectionCode", label: "Section" },
                    { key: "instructorName", label: "Professor" },
                    { key: "confirmedStudentCount", label: "Students in Section" },
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
                  This checklist shows the grade files processed during the current session.
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
                    {isPending ? "Validating..." : "Validate Grade File"}
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
                    ["Valid Records", preview.validRows],
                    ["Requires Correction", preview.invalidRows],
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
                    { key: "validationStatus", label: "File Check", render: (row) => <StatusBadge value={row.validationStatus === "PRECHECK_VALID" ? "VALID" : "REQUIRES_CORRECTION"} label={row.validationStatus === "PRECHECK_VALID" ? "Valid" : "Requires Correction"} /> },
                    { key: "issues", label: "Issues", render: (row) => row.issues.length ? row.issues.map((item) => item.message).join("; ") : "None" },
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
                <h3>Grade File Validation</h3>
                <Details
                  items={[
                    ["Records", activeBatch.stagedRows],
                    ["Source Reference", activeBatch.sourceReference],
                    ["Current Status", statusLabel(activeBatch.status)],
                    ["Valid Records", activeBatch.validation?.valid_rows ?? "Not available"],
                    ["Records Requiring Correction", activeBatch.validation?.invalid_rows ?? "Not available"],
                  ]}
                />

                {activeBatch.status === "REQUIRES_CORRECTION" ? (
                  <div className="notice warning" style={{ marginTop: 12 }}>
                    Some records require correction. Fix the source file and start a new import for this subject.
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
                      Official grades were published successfully. Student academic records and subject eligibility were updated.
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
            Confirm that the academic term, program, section, professor, source reference, and grades are correct. If publication fails, no partial grade batch will be recorded.
          </p>
        </div>
        <Details
          items={[
            ["Academic Year", selectedContext?.academicYear || "Not available"],
            ["Semester", selectedContext?.semester || "Not available"],
            ["Program", selectedContext ? `${selectedContext.programCode} · ${selectedContext.programName}` : "Not available"],
            ["Previous Block", selectedContext?.previousBlockCode || "Not available"],
            ["Subject", selectedContext ? `${displaySubjectCode(selectedContext.subjectCode)} · ${selectedContext.subjectName}` : "Not available"],
            ["Section", selectedContext?.sectionCode || "Not available"],
            ["Professor", selectedContext?.instructorName || "Not available"],
            ["Source Reference", activeBatch?.sourceReference || "Not available"],
          ]}
        />
      </Modal>

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
