"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, DataTable, Modal, StatusBadge } from "@/components/ui/PortalUI";
import { Details, Panel } from "@/components/registrar/RegistrarShared";
import RegistrarGradeUploadPicker from "@/components/registrar/RegistrarGradeUploadPicker";
import { displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";
import styles from "./RegistrarProjectGradeWorkspace.module.css";
import {
  filterProjectGradeBatches, filterProjectGradeReleases, paginateProjectGradeHistory,
  projectGradeBatchDisplayStatus,
} from "./project-grade-history.mjs";
import {
  loadProjectHistoricalInstructorOptions,
  registerProjectHistoricalInstructorMapping,
} from "./project-historical-mapping-actions";
import {
  attestProjectGradeBatch,
  cancelProjectGradeBatch,
  downloadProjectGradeTemplate,
  loadProjectGradeWorkspace,
  previewProjectGradeFile,
  publishProjectGradeBlock,
  requestProjectGradeCorrections,
  stageProjectGradeFile,
  validateProjectGradeBatch,
} from "./registrar-project-grade-actions";

const EMPTY_ROWS = Object.freeze([]);
const WORKFLOW_STEPS = [
  { key: "upload", label: "Upload Grades", description: "Prepare and preview a source file" },
  { key: "review", label: "Review Grades", description: "Validate, verify and resolve conflicts" },
  { key: "publish", label: "Publish Grades", description: "Check coverage and publish records" },
];

function text(value) {
  return String(value ?? "").replaceAll("_", " ");
}

function countConflicts(batch) {
  if (!batch) return 0;
  if (Number.isInteger(batch.conflict_rows)) return batch.conflict_rows;
  return (batch.rows || []).filter((row) => row.validation_status === "CONFLICT").length;
}

function correctionReviewState(batch) {
  const requests = batch?.correctionRequests || [];
  const conflictingRowIds = new Set((batch?.rows || [])
    .filter((item) => item.validation_status === "CONFLICT")
    .map((item) => item.id));
  const conflictingRequests = requests.filter((item) => conflictingRowIds.has(item.source_row_id));
  // An in-progress review is pending as well; neither state may submit again.
  const hasRequested = requests.some((item) =>
    item.status === "REQUESTED" || item.status === "UNDER_REVIEW");
  const hasRejected = requests.some((item) => item.status === "REJECTED");
  const hasApplied = requests.some((item) => item.status === "APPLIED");
  const conflicts = countConflicts(batch);
  const allConflictsRejected = conflictingRowIds.size > 0 &&
    [...conflictingRowIds].every((rowId) => conflictingRequests
      .some((item) => item.source_row_id === rowId)) &&
    conflictingRequests.every((item) => item.status === "REJECTED");
  return {
    hasRequested,
    hasRejected,
    hasApplied,
    awaitingDecision: hasRequested && conflicts > 0,
    needsCancellation: allConflictsRejected && !hasRequested && conflicts > 0,
    readyForVerification: hasApplied && !conflicts && batch?.status === "READY_FOR_REVIEW" && !batch.verified_at,
  };
}

function correctionStatusLabel(batch) {
  const state = correctionReviewState(batch);
  if (batch?.status === "READY_FOR_REVIEW" && batch.verified_at) return null;
  if (state.awaitingDecision) return "Awaiting Academic Coordinator decision";
  if (state.needsCancellation) return "Correction rejected — cancel and reupload";
  if (state.hasRejected && countConflicts(batch)) return "Correction rejected — review batch decisions";
  if (state.readyForVerification) return "Ready for Verification";
  if (state.hasApplied && countConflicts(batch)) return "Correction applied — awaiting reconciliation";
  if (state.hasApplied) return "Correction applied";
  return null;
}

function isVerifiedProjectBatch(batch, expectedCount) {
  const readyForReview = batch?.status === "READY_FOR_REVIEW" &&
    batch.rows?.every((row) => row.validation_status === "ALREADY_PRESENT");
  const published = batch?.status === "PUBLISHED_PROJECT" &&
    batch.rows?.every((row) => row.validation_status === "ACCEPTED_PROJECT");
  return Boolean(batch && (readyForReview || published) && batch.verified_at &&
    !countConflicts(batch) && batch.row_count === expectedCount &&
    batch.rows?.length === expectedCount && batch.rows.every((row) =>
      row.canonical_result_id));
}

function reviewNotes(values) {
  if (!Array.isArray(values)) return "None";
  const notes = values.map((item) => typeof item === "string" ? item :
    item?.message || item?.code || "Source issue").filter(Boolean);
  return notes.join("; ") || "None";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Pending";
}

export default function RegistrarProjectGradeWorkspace({ historyOnly = false }) {
  const tabId = useId();
  const stepTabs = useRef({});
  const [requestedStep, setActiveStep] = useState(historyOnly ? "review" : "upload");
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [blockId, setBlockId] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [file, setFile] = useState(null);
  const [sourceReference, setSourceReference] = useState("");
  const [issuer, setIssuer] = useState("");
  const [preview, setPreview] = useState(null);
  const [verificationMethod, setVerificationMethod] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingProfessors, setMappingProfessors] = useState([]);
  const [mappingProfessorSearch, setMappingProfessorSearch] = useState("");
  const [mappingProfessorId, setMappingProfessorId] = useState("");
  const [mappingPreviousBlock, setMappingPreviousBlock] = useState("");
  const [mappingEvidence, setMappingEvidence] = useState("");
  const [mappingAttested, setMappingAttested] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingOptionsError, setMappingOptionsError] = useState("");
  const [showRows, setShowRows] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [releaseSearch, setReleaseSearch] = useState("");
  const [releasePage, setReleasePage] = useState(1);
  // The same mounted workspace may switch into the read-only history view.
  // Never leave its active tab pointing to a disabled upload stage.
  const activeStep = historyOnly && requestedStep === "upload" ? "review" : requestedStep;

  const reload = useCallback(async () => {
    const response = await loadProjectGradeWorkspace();
    if (response.ok) {
      setWorkspace(response.data);
    } else {
      setError(true);
      setMessage(response.message);
    }
    setLoading(false);
    return response;
  }, []);

  useEffect(() => {
    let current = true;
    loadProjectGradeWorkspace().then((response) => {
      if (!current) return;
      if (response.ok) setWorkspace(response.data);
      else { setError(true); setMessage(response.message); }
      setLoading(false);
    }).catch(() => {
      if (current) { setError(true); setMessage("Project grade records could not be loaded."); setLoading(false); }
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!mappingOpen) return;
    let active = true;
    loadProjectHistoricalInstructorOptions().then((response) => {
      if (!active) return;
      if (response.ok) {
        setMappingProfessors(response.data || []);
        setMappingOptionsError("");
      } else {
        setMappingOptionsError(response.message || "Historical professor options are unavailable.");
      }
    }).catch(() => {
      if (active) setMappingOptionsError("Historical professor options could not be loaded.");
    }).finally(() => {
      if (active) setMappingLoading(false);
    });
    return () => { active = false; };
  }, [mappingOpen]);

  const blocks = useMemo(() => workspace?.blocks || [], [workspace]);
  const batches = useMemo(() => workspace?.batches || [], [workspace]);
  const releases = useMemo(() => workspace?.releases || [], [workspace]);
  const publicationAvailable = workspace?.publicationAvailable === true;
  const block = blocks.find((item) => item.id === blockId) ||
    blocks.find((item) => item.release && !item.archived) ||
    blocks.find((item) => !item.archived) || blocks[0];
  const collegeBlocks = blocks.filter((item) => item.collegeCode === block?.collegeCode);
  const programBlocks = collegeBlocks.filter((item) => item.programCode === block?.programCode);
  const levelBlocks = programBlocks.filter((item) => item.yearLevel === block?.yearLevel);
  const collegeOptions = [...new Map(blocks.map((item) =>
    [item.collegeCode, item.collegeName || item.collegeCode])).entries()]
    .filter(([code]) => code).sort(([a], [b]) => a.localeCompare(b));
  const programOptions = [...new Map(collegeBlocks.map((item) =>
    [item.programCode, item.programName || item.programCode])).entries()]
    .sort(([a], [b]) => a.localeCompare(b));
  const yearOptions = [...new Set(programBlocks.map((item) => item.yearLevel))]
    .filter(Number.isInteger).sort((a, b) => a - b);
  const filteredMappingProfessors = mappingProfessors.filter((item) =>
    `${item.name} ${item.id}`.toLowerCase().includes(mappingProfessorSearch.trim().toLowerCase())).slice(0, 60);
  const subjects = block?.subjects || EMPTY_ROWS;
  const subject = subjects.find((item) => item.code === subjectCode) || subjects[0];
  const blockBatches = useMemo(() => batches.filter((item) =>
    item.block_id === block?.id && item.term_id === block?.termId), [batches, block?.id, block?.termId]);
  // Only paginate the already role-checked and project-scoped workspace data.
  const filteredBatches = useMemo(() => filterProjectGradeBatches(blockBatches, batchSearch),
    [blockBatches, batchSearch]);
  const batchListing = useMemo(() => paginateProjectGradeHistory(filteredBatches, batchPage),
    [filteredBatches, batchPage]);
  const selectedBatch = batchListing.items.find((item) => item.id === selectedBatchId) ||
    batchListing.items.find((item) => item.subject_code === subject?.code) || batchListing.items[0];
  const selectedCorrectionState = correctionReviewState(selectedBatch);
  const blockReleases = useMemo(() => releases.filter((item) =>
    item.block_id === block?.id && item.term_id === block?.termId), [releases, block?.id, block?.termId]);
  const filteredReleases = useMemo(() => filterProjectGradeReleases(blockReleases, releaseSearch),
    [blockReleases, releaseSearch]);
  const releaseListing = useMemo(() => paginateProjectGradeHistory(filteredReleases, releasePage),
    [filteredReleases, releasePage]);
  const release = block?.release || releases.find((item) => item.block_id === block?.id && item.term_id === block?.termId);

  function selectBlock(next) {
    setBlockId(next?.id || "");
    setSubjectCode("");
    setSelectedBatchId("");
    setBatchSearch("");
    setBatchPage(1);
    setReleaseSearch("");
    setReleasePage(1);
    setPreview(null);
    setFile(null);
    setSourceReference("");
    setIssuer("");
    setVerificationMethod("");
    setVerificationConfirmed(false);
    setPublishConfirmed(false);
    setMappingOpen(false);
    setMappingPreviousBlock("");
    setMappingProfessorId("");
    setMappingProfessorSearch("");
    setMappingEvidence("");
    setMappingAttested(false);
  }

  async function configureHistoricalSubject(event) {
    event.preventDefault();
    if (!block || !subject || !block.mappingRequired || subject.previousProfessor ||
        busy || mappingLoading || !mappingAttested || !mappingProfessorId ||
        !mappingPreviousBlock.trim() || !mappingEvidence.trim()) return;
    const response = await execute(() => registerProjectHistoricalInstructorMapping({
      blockId: block.id,
      subjectCode: subject.code,
      previousBlockCode: mappingPreviousBlock.trim(),
      instructorId: mappingProfessorId,
      sourceReference: mappingEvidence.trim(),
      attested: true,
    }));
    if (response.ok) {
      setMappingProfessorId("");
      setMappingProfessorSearch("");
      setMappingEvidence("");
      setMappingAttested(false);
      setPreview(null);
    }
  }

  const progress = useMemo(() => {
    const duplicatedSubjects = subjects.filter((subject) =>
      blockBatches.filter((batch) => batch.subject_code === subject.code &&
        !["CANCELLED", "FAILED"].includes(batch.status)).length > 1).length;
    const latest = subjects.map((item) => {
      const matches = blockBatches.filter((batch) => batch.subject_code === item.code &&
        !["CANCELLED", "FAILED"].includes(batch.status));
      return matches.find((batch) => isVerifiedProjectBatch(batch, item.expected?.length || 0)) || matches[0] || null;
    });
    const verified = latest.reduce((count, batch, index) => count +
      (isVerifiedProjectBatch(batch, subjects[index].expected?.length || 0)
        ? subjects[index].expected.length : 0), 0);
    const required = subjects.reduce((count, item) => count + (item.expected?.length || 0), 0);
    const conflicts = latest.reduce((count, batch) => count + countConflicts(batch), 0);
    const complete = subjects.length > 0 && !duplicatedSubjects && latest.length === subjects.length &&
      latest.every((batch, index) => isVerifiedProjectBatch(batch, subjects[index].expected?.length || 0));
    return { verified, required, conflicts, duplicatedSubjects, latest, complete,
      percent: required ? Math.round(100 * verified / required) : 0 };
  }, [subjects, blockBatches]);

  function buildFormData() {
    const form = new FormData();
    form.set("block_id", block.id);
    form.set("subject_code", subject.code);
    form.set("file", file);
    form.set("source_system", "PROJECT_ONLY");
    form.set("source_reference", sourceReference.trim());
    form.set("issuer", issuer.trim());
    return form;
  }

  async function execute(action, successMessage) {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const result = await action();
      setError(!result.ok);
      setMessage(result.message || successMessage || "Action completed.");
      if (result.ok) await reload();
      return result;
    } catch {
      setError(true);
      setMessage("The project grade action is currently unavailable.");
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  async function previewFile(event) {
    event.preventDefault();
    if (!file || !block || !subject) return;
    setPreview(null);
    const response = await execute(() => previewProjectGradeFile(buildFormData()));
    if (response.ok) setPreview(response.data);
  }

  async function stageFile() {
    if (!preview || preview.invalidRows || preview.missingStudents.length ||
      preview.rowCount !== preview.requiredRows) return;
    const response = await execute(() => stageProjectGradeFile(buildFormData()));
    if (response.ok) {
      setSelectedBatchId(response.data?.batchId || "");
      setBatchSearch("");
      setBatchPage(1);
      setPreview(null);
      setFile(null);
      moveToStep("review");
    }
  }

  async function verify(event) {
    event.preventDefault();
    if (!selectedBatch || !verificationConfirmed || !verificationMethod.trim()) return;
    const response = await execute(() => attestProjectGradeBatch({
      batchId: selectedBatch.id,
      sourceReference: selectedBatch.source_reference,
      checksum: selectedBatch.source_checksum,
      method: verificationMethod.trim(),
    }));
    if (response.ok) { setVerificationMethod(""); setVerificationConfirmed(false); }
  }

  async function requestCorrections(event) {
    event.preventDefault();
    if (!selectedBatch || selectedBatch.status !== "CONFLICT_REVIEW" || !countConflicts(selectedBatch) ||
        selectedCorrectionState.hasRequested || selectedCorrectionState.hasRejected ||
        correctionReason.trim().length < 15 || correctionReason.trim().length > 2000) return;
    const response = await execute(() => requestProjectGradeCorrections(selectedBatch.id, correctionReason.trim()));
    if (response.ok) setCorrectionReason("");
  }

  async function cancelRejectedBatch(event) {
    event.preventDefault();
    const reason = cancellationReason.trim();
    if (!selectedBatch || release || historyOnly || busy || !selectedCorrectionState.needsCancellation ||
        selectedBatch.status !== "CONFLICT_REVIEW" || reason.length < 15 || reason.length > 2000) return;
    if (!window.confirm(
      `Cancel this conflicting PROJECT_ONLY source batch (${selectedBatch.file_name})? Its grade records and correction review history will be retained. You can then upload a corrected Excel workbook as a new batch. This will not change existing academic grades.`,
    )) return;
    const response = await execute(() => cancelProjectGradeBatch(selectedBatch.id, reason));
    if (response.ok) {
      setCancellationReason("");
      setCorrectionReason("");
      setSelectedBatchId("");
      setShowRows(false);
      setFile(null);
      setPreview(null);
      moveToStep("upload");
    }
  }

  async function publish() {
    if (!publishConfirmed || !publicationAvailable || !progress.complete || progress.conflicts || release) return;
    const response = await execute(() => publishProjectGradeBlock(
      block.id, block.termId, progress.latest.map((batch) => batch.id),
    ));
    if (response.ok) setPublishConfirmed(false);
  }

  function selectStep(nextStep) {
    if (historyOnly && nextStep === "upload") return;
    if (nextStep !== "publish") setPublishConfirmed(false);
    setActiveStep(nextStep);
  }

  function moveToStep(nextStep) {
    // Next/back actions hide their triggering control. Focus the newly visible
    // stage tab after React commits; clicking a tab itself keeps normal focus.
    selectStep(nextStep);
    window.requestAnimationFrame(() => stepTabs.current[nextStep]?.focus());
  }

  function handleStepKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const enabled = [...event.currentTarget.parentElement.querySelectorAll('[role="tab"]:not(:disabled)')];
    const current = enabled.indexOf(event.currentTarget);
    if (current < 0 || !enabled.length) return;
    event.preventDefault();
    const target = event.key === "Home" ? enabled[0]
      : event.key === "End" ? enabled[enabled.length - 1]
        : enabled[(current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    target.focus();
    target.click();
  }

  if (loading) return <Panel title="PROJECT_ONLY Historical Grade Imports"><p role="status">Loading protected project grade records...</p></Panel>;
  if (!workspace) return <Panel title="PROJECT_ONLY Historical Grade Imports">
    <div className="notice warning" role="alert">{message || "Project grade data is not available."}</div>
    <div className="action-row" style={{ marginTop: 12 }}><Button variant="secondary" onClick={() => { setLoading(true); reload(); }}>Retry</Button></div>
  </Panel>;

  return <div className={styles.workspace}>
    <Panel title={historyOnly ? "Project Grade Publication History" : "PROJECT_ONLY Historical Grade Imports"}
      subtitle="Review prior semester grade sources for configured project college departments, programs, year levels and student blocks.">
      {message ? <div className={`notice${error ? " warning" : ""}`} role={error ? "alert" : "status"} style={{ marginBottom: 14 }}>{message}</div> : null}

      <div className={`${styles.contextBar} form-grid`}>
        <label className="field">
          <span>College Department</span>
          <select value={block?.collegeCode || ""} disabled={busy || !blocks.length}
            onChange={(event) => selectBlock(blocks.find((item) => item.collegeCode === event.target.value))}>
            {collegeOptions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>College Program</span>
          <select value={block?.programCode || ""} disabled={busy || !collegeBlocks.length}
            onChange={(event) => selectBlock(collegeBlocks.find((item) => item.programCode === event.target.value))}>
            {programOptions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Current Year Level</span>
          <select value={block?.yearLevel || ""} disabled={busy || !programBlocks.length}
            onChange={(event) => selectBlock(programBlocks.find((item) => item.yearLevel === Number(event.target.value)))}>
            {yearOptions.map((level) => <option key={level} value={level}>{level}{level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th"} Year</option>)}
          </select>
        </label>
        <label className="field">
          <span>Block Section</span>
          <select value={block?.id || ""} disabled={busy} onChange={(event) => {
            selectBlock(levelBlocks.find((item) => item.id === event.target.value));
          }}>
            {levelBlocks.map((item) => <option key={item.id} value={item.id}>{item.currentBlockCode || item.code}</option>)}
          </select>
        </label>
        <div className="field">
          <span>Previous Academic Semester</span>
          <div className="notice"><strong>{block?.termLabel || "No historical term available"}</strong></div>
        </div>
        <div className="field">
          <span>Historical Section Mapping</span>
          <div className="notice"><strong>{
            block?.code
              ? block.subjects?.some((item) => item.previousProfessor?.mappingOrigin === "GENERATED_DEMONSTRATION")
                ? `Simulated prior block: ${block.code}` : block.code
              : "Requires authorized historical section mapping"
          }</strong></div>
        </div>
      </div>
        {block?.mappingRequired ? <p className="notice warning" role="status" style={{ marginTop: 12, marginBottom: 12 }}>
        This current block has fictional historical results, but the previous section or its professor assignments
        have not been recorded for every historical subject in the project records. Open the authorized source mapping
        panel in Upload Grades to register assignments backed by provided source evidence.
      </p> : null}

      <div className={styles.stepNav} role="tablist" aria-label="Project historical grade workflow">
        {WORKFLOW_STEPS.map((step, index) => {
          const disabled = historyOnly && step.key === "upload";
          const selected = activeStep === step.key;
          return <button key={step.key} type="button" role="tab"
            id={`${tabId}-tab-${step.key}`} aria-controls={`${tabId}-panel-${step.key}`}
            aria-selected={selected} tabIndex={selected ? 0 : -1}
            className={`${styles.stepButton} ${selected ? styles.stepActive : ""}`}
            ref={(node) => { stepTabs.current[step.key] = node; }}
            disabled={disabled || busy} onClick={() => selectStep(step.key)} onKeyDown={handleStepKeyDown}>
            <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
            <span className={styles.stepText}>
              <strong>{step.label}</strong>
              <span className={styles.stepDescription}>{disabled ? "Unavailable in history-only view" : step.description}</span>
            </span>
          </button>;
        })}
      </div>

      {!block ? WORKFLOW_STEPS.map((step) => <section key={step.key}
        id={`${tabId}-panel-${step.key}`} role="tabpanel" aria-labelledby={`${tabId}-tab-${step.key}`}
        className={styles.stepPanel} hidden={activeStep !== step.key}
        style={{ display: activeStep === step.key ? undefined : "none" }}>
        <p className={styles.emptyMessage} role="status">No historical project grade block has been approved for Registrar import.</p>
      </section>) : <>
        <section id={`${tabId}-panel-upload`} role="tabpanel" aria-labelledby={`${tabId}-tab-upload`}
          className={styles.stepPanel} hidden={activeStep !== "upload"}
          style={{ display: activeStep === "upload" ? undefined : "none" }}>
          <div className={styles.sectionIntro}>
            <h3 className={styles.sectionTitle}>Upload Grades</h3>
            <p className={styles.sectionSubtitle}>Choose a historical subject, attach a CSV or XLSX grade source, and preview all student records before staging.</p>
          </div>

        {!historyOnly && !release && subject ? <div className={styles.subSection}>
          <h4 className={styles.sectionTitle}>Stage a Historical Subject Workbook</h4>
          <p className={styles.helperText}>
            Choose one CSV or XLSX file for <strong>{displaySubjectCode(subject.code)}</strong> covering all {subject.expected?.length || 0} historical students. Records stay PROJECT_ONLY.
          </p>
          <details className={styles.compactNotice}>
            <summary>View required spreadsheet columns</summary>
            <p>Nine required columns: student_number, student_full_name, subject_code, academic_year, semester, section_code, grade_value, completion_status, source_record_reference. Optional columns: previous_block_section and previous_subject_professor. XLSX files require a Grades sheet; a second Instructions sheet is allowed. A project fictional professor is accepted only when its name matches the protected assignment below. Such names do not establish institutional faculty verification.</p>
          </details>
          <div className={`form-grid ${styles.fieldGrid}`}>
            <label className="field">Previous Semester Subjects
              <select value={subject.code} disabled={busy} onChange={(event) => { setSubjectCode(event.target.value); setCorrectionReason(""); setPreview(null); setFile(null); setMappingProfessorId(""); setMappingProfessorSearch(""); setMappingEvidence(""); setMappingAttested(false); }}>
                {subjects.map((item) => <option key={item.code} value={item.code}>{displaySubjectCode(item.code)} · {item.name}</option>)}
              </select>
            </label>
            <div className="field">
              <span>Previous Semester Professor (Fictional Demonstration)</span>
              <div className="notice"><strong>{subject.previousProfessor?.name || "Not assigned"}</strong></div>
              {subject.previousProfessor && subject.previousProfessor.mappingOrigin !== "GENERATED_DEMONSTRATION"
                ? <span className={styles.helperText}>Existing PROJECT_ONLY professor mapping. Not an official faculty record.</span>
                : null}
            </div>
            {block.mappingRequired ? <div className="field full">
              <Button variant="secondary" disabled={busy} onClick={() => {
                if (!mappingOpen) setMappingLoading(true);
                setMappingOpen((value) => !value);
              }}>
                {mappingOpen ? "Close Historical Source Mapping" : "Configure Historical Source Mapping"}
              </Button>
              {mappingOpen ? <form className={styles.mappingForm} onSubmit={configureHistoricalSubject}>
                <strong>Authorized historical source mapping</strong>
                <p className={styles.helperText}>
                  The previous section and professor must come from supporting academic source evidence.
                  This mapping is for fictional PROJECT_ONLY records and does not verify actual university faculty.
                  Register every previous semester subject separately before importing the block.
                </p>
                <div className="form-grid">
                  <label className="field">Historical Section Code
                    <input value={mappingPreviousBlock} onChange={(event) => setMappingPreviousBlock(event.target.value.toUpperCase())}
                      required maxLength={40} placeholder="Section code shown in historical source" disabled={busy} />
                  </label>
                  <label className="field">Search Existing Fictional Professor
                    <input type="search" value={mappingProfessorSearch} disabled={busy || mappingLoading}
                      placeholder="Search professor name" onChange={(event) => { setMappingProfessorSearch(event.target.value); setMappingProfessorId(""); }} />
                  </label>
                  <label className="field">Professor for {displaySubjectCode(subject.code)}
                    <select value={mappingProfessorId} onChange={(event) => setMappingProfessorId(event.target.value)}
                      required disabled={busy || mappingLoading || Boolean(subject.previousProfessor)}>
                      <option value="">Select evidenced professor</option>
                      {filteredMappingProfessors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="field">Source Document Reference
                    <input value={mappingEvidence} maxLength={240} minLength={8} disabled={busy}
                      placeholder="Required historical faculty or section source reference"
                      onChange={(event) => setMappingEvidence(event.target.value)} required />
                  </label>
                </div>
                {mappingOptionsError ? <p className="notice warning" role="alert">{mappingOptionsError}</p> : null}
                {mappingLoading ? <p role="status">Loading existing fictional professor records...</p> : null}
                <label className={styles.mappingAttestation}>
                  <input type="checkbox" checked={mappingAttested} disabled={busy || Boolean(subject.previousProfessor)}
                    onChange={(event) => setMappingAttested(event.target.checked)} />
                  I attest that the historical section, professor and reference match supporting source evidence.
                </label>
                <Button type="submit" disabled={busy || mappingLoading || Boolean(subject.previousProfessor) || !mappingAttested ||
                  !mappingProfessorId || mappingEvidence.trim().length < 8 || !mappingPreviousBlock.trim()}>
                  Register Historical Professor Mapping
                </Button>
                {subject.previousProfessor ? <p role="status" className={styles.helperText}>
                  This subject already has a protected historical professor mapping. Select another unmapped subject.
                </p> : null}
              </form> : null}
            </div> : null}
            <div className="field full"><RegistrarGradeUploadPicker projectOnly file={file} disabled={busy || block.mappingRequired || !subject.previousProfessor}
              onFileSelected={(next) => { setFile(next); setPreview(null); }} /></div>
            <label className="field">Historical Workbook Reference
              <input value={sourceReference} maxLength={240} disabled={busy} required placeholder="e.g. HIST-BSIT-1A-CP2-2025-2" onChange={(event) => { setSourceReference(event.target.value); setPreview(null); }} />
            </label>
            <label className="field">Source Issuer (as shown in evidence)
              <input value={issuer} maxLength={240} disabled={busy} required placeholder="e.g. Registrar Records or NOT_VERIFIED_IN_SOURCE" onChange={(event) => { setIssuer(event.target.value); setPreview(null); }} />
            </label>
          </div>
          <div className={`action-row ${styles.actionBar}`} style={{ marginTop: 12 }}>
            <Button disabled={busy || block.mappingRequired || !subject.previousProfessor || !file || !sourceReference.trim() || !issuer.trim()}
              onClick={previewFile}>Preview Grades</Button>
            {preview && !preview.invalidRows && !preview.missingStudents.length && preview.requiredRows === preview.rowCount ?
              <Button disabled={busy || block.mappingRequired || !subject.previousProfessor} onClick={stageFile}>Upload for Review</Button> : null}
          </div>
          {preview ? <div className={styles.subSection}>
            <Details items={[
              ["File", preview.fileName], ["Rows in File", preview.rowCount],
              ["Expected Historical Students", preview.requiredRows],
              ["Matching Existing Results", preview.alreadyPresentRows],
              ["Conflicting Results", preview.conflictRows],
              ["Rows Requiring Correction", preview.invalidRows],
              ["Missing Students", preview.missingStudents.length],
            ]} />
            <div className={styles.tableWrap}><DataTable rows={preview.rows} rowKey="rowNumber" columns={[
              { key: "row", label: "Excel Row", render: (item) => item.rowNumber },
              { key: "student", label: "Student ID", render: (item) => item.studentNumber },
              { key: "name", label: "Student Name", render: (item) => item.studentFullName },
              { key: "professor", label: "Workbook Professor", render: (item) => item.previousSubjectProfessor || "Not recorded" },
              { key: "grade", label: "Workbook Grade", render: (item) => item.gradeValue },
              { key: "existing", label: "Existing Grade", render: (item) => item.previousGrade ?? "Not recorded" },
              { key: "completion", label: "Completion", render: (item) => item.completionStatus },
              { key: "previousStatus", label: "Existing Status", render: (item) => item.previousStatus || "Not recorded" },
              { key: "status", label: "Precheck", render: (item) => <StatusBadge value={item.validationStatus} /> },
              { key: "issues", label: "Issues", render: (item) => item.issues.map((issue) => issue.message).join("; ") || "None" },
            ]} /></div>
          </div> : null}
        </div> : null}

        {release ? <p className={`${styles.compactNotice} notice`}>This historical project block has already been published. Review the preserved import history or open Publish Grades to see the release record.</p> : null}
        <div className={styles.secondaryActions}>
          <Button variant="secondary" disabled={busy} onClick={() => moveToStep("review")}>Continue to Review Grades</Button>
        </div>
        </section>

        <section id={`${tabId}-panel-review`} role="tabpanel" aria-labelledby={`${tabId}-tab-review`}
          className={styles.stepPanel} hidden={activeStep !== "review"}
          style={{ display: activeStep === "review" ? undefined : "none" }}>
          <div className={styles.sectionIntro}>
            <h3 className={styles.sectionTitle}>Review Grades</h3>
            <p className={styles.sectionSubtitle}>Find staged source batches, validate their records, verify evidence and request review for conflicting historical grades.</p>
          </div>

        <div className={styles.subSection}>
          <h4 className={styles.sectionTitle}>Persisted Project Grade Source Batches</h4>
          <p className={styles.helperText}>
            Parsed records, original column values, source reference, file name and SHA256 checksum are retained in protected project records. XLSX file binaries are not stored in Supabase Storage.
          </p>
          <label className="field" htmlFor="project-grade-batch-search">
            Search Project Import History
            <input id="project-grade-batch-search" type="search" value={batchSearch}
              placeholder="Source file, batch ID, reference, subject or status"
              onChange={(event) => { setBatchSearch(event.target.value); setBatchPage(1); setSelectedBatchId(""); setShowRows(false); setCancellationReason(""); }} />
          </label>
          <p className={styles.statusRow} role="status" aria-live="polite">
            Showing {batchListing.start}–{batchListing.end} of {batchListing.totalItems} project source batches
          </p>
          {filteredBatches.length === 0 ? <p className={styles.emptyMessage}>{batchSearch.trim()
            ? "No project source batches match this search." : "No project source batches have been staged."}</p> : null}
          <div className={styles.tableWrap}><DataTable rows={batchListing.items} rowKey="id" columns={[
            { key: "file", label: "Source File", render: (item) => item.file_name },
            { key: "subject", label: "Subject", render: (item) => displaySubjectCode(item.subject_code) },
            { key: "professor", label: "Demo Professor", render: (item) =>
              subjects.find((entry) => entry.code === item.subject_code)?.previousProfessor?.name || "Not assigned" },
            { key: "reference", label: "Source Reference", render: (item) => item.source_reference },
            { key: "rows", label: "Rows", render: (item) => item.row_count },
            { key: "status", label: "Status", render: (item) => <>
              <StatusBadge {...projectGradeBatchDisplayStatus(item)} />
              {projectGradeBatchDisplayStatus(item).detail ?
                <div className={styles.helperText}>{projectGradeBatchDisplayStatus(item).detail}</div> : null}
              {correctionStatusLabel(item) ? <div className={styles.helperText}>{correctionStatusLabel(item)}</div> : null}
            </> },
            { key: "conflicts", label: "Conflicts", render: (item) => countConflicts(item) },
            { key: "review", label: "Review", render: (item) => <Button variant="ghost" size="sm" onClick={() => { setSelectedBatchId(item.id); setCorrectionReason(""); setCancellationReason(""); setShowRows(true); selectStep("review"); }}>View Batch</Button> },
          ]} /></div>
          {batchListing.totalPages > 1 ? <div className={`action-row ${styles.secondaryActions}`} role="navigation" aria-label="Project import history pages" style={{ marginTop: 10 }}>
            <Button variant="secondary" disabled={batchListing.page === 1}
              onClick={() => { setBatchPage(batchListing.page - 1); setSelectedBatchId(""); setShowRows(false); setCancellationReason(""); }}>Previous</Button>
            <span aria-live="polite">Page {batchListing.page} of {batchListing.totalPages}</span>
            <Button variant="secondary" disabled={batchListing.page === batchListing.totalPages}
              onClick={() => { setBatchPage(batchListing.page + 1); setSelectedBatchId(""); setShowRows(false); setCancellationReason(""); }}>Next</Button>
          </div> : null}
          {selectedBatch ? <div className={styles.subSection}>
            <div className={styles.reviewGrid}>
              <Details items={[
              ["Selected Source", selectedBatch.file_name],
              ["Reference", selectedBatch.source_reference],
              ["Issuer", selectedBatch.issuer],
              ["Assigned Fictional Professor", subjects.find((entry) => entry.code === selectedBatch.subject_code)?.previousProfessor?.name || "Not assigned"],
              ["Checksum (SHA256)", selectedBatch.source_checksum],
              ["Verification", selectedBatch.verification_method || "Pending"],
              ["Verified At", formatDate(selectedBatch.verified_at)],
              ["Status", [projectGradeBatchDisplayStatus(selectedBatch).label,
                projectGradeBatchDisplayStatus(selectedBatch).detail].filter(Boolean).join(" · ")],
              ]} />
              <div className={`action-row ${styles.actionBar}`} style={{ marginTop: 12 }}>
                {!historyOnly && !release && ["UPLOADED", "REQUIRES_CORRECTION"].includes(selectedBatch.status) ?
                  <Button disabled={busy} onClick={() => execute(() => validateProjectGradeBatch(selectedBatch.id))}>Validate Grades</Button> : null}
                <Button variant="ghost" disabled={busy} onClick={() => setShowRows(!showRows)}>{showRows ? "Hide Rows" : "View Rows"}</Button>
              </div>
            </div>
            {showRows ? <div className={styles.tableWrap}><DataTable rows={selectedBatch.rows || []} rowKey="source_row_number" columns={[
              { key: "row", label: "Source Row", render: (item) => item.source_row_number },
              { key: "student", label: "Student ID", render: (item) => item.source_student_number },
              { key: "professor", label: "Assigned Professor (Fictional Demo)", render: (item) =>
                <span title={`Original workbook value: ${item.original_row?.previous_subject_professor || "Not recorded"}`}>
                  {subjects.find((entry) => entry.code === selectedBatch.subject_code)?.previousProfessor?.name || "Not assigned"}
                </span> },
              { key: "grade", label: "Source Grade", render: (item) => item.raw_grade_text },
              { key: "completion", label: "Completion", render: (item) => item.completion_status },
              { key: "state", label: "Reconciliation", render: (item) => <StatusBadge value={item.validation_status} /> },
              { key: "errors", label: "Review Notes", render: (item) => reviewNotes(item.error_details) },
            ]} /></div> : null}
            {countConflicts(selectedBatch) ? <div className="notice warning" role="alert" style={{ marginTop: 12 }}>
              {countConflicts(selectedBatch)} row(s) conflict with existing historical project results. Authorized review is required. Existing results are preserved.
            </div> : null}
            {selectedCorrectionState.awaitingDecision ? <div className={styles.compactNotice} role="status" aria-live="polite">
              <strong>Awaiting Academic Coordinator decision</strong>
              <p>The correction request has already been submitted. Do not send another request. The conflicting grade remains unchanged and publication is blocked until review finishes.</p>
              <Button variant="secondary" disabled={busy} onClick={reload}>Refresh Review Status</Button>
            </div> : null}
            {selectedCorrectionState.readyForVerification ? <div className={styles.compactNotice} role="status">
              <strong>Ready for Verification</strong>
              <p>The authorized correction was applied, the batch has zero remaining conflicts and its protected source status is ready. Complete independent evidence verification before publishing.</p>
            </div> : null}
            {selectedBatch.status === "READY_FOR_REVIEW" && selectedBatch.verified_at ?
              <div className={styles.compactNotice} role="status">
                <strong>Source Verified · Awaiting Publication</strong>
                <p>Independent source verification is recorded. Continue uploading and verifying the other historical subjects. All eight subject batches must be verified before Registrar block publication.</p>
              </div> : null}
            {selectedCorrectionState.hasApplied && !selectedCorrectionState.readyForVerification &&
              !selectedCorrectionState.hasRequested && !selectedBatch.verified_at ?
              <div className={styles.compactNotice} role="status">
                <strong>Correction applied — reconciliation not yet verified</strong>
                <p>An applied decision is not enough for publication. The protected source must reach Ready for Verification and have zero outstanding conflicts.</p>
              </div> : null}
            {selectedBatch.correctionRequests?.length ? <div className={styles.subSection}>
              <h4 className={styles.sectionTitle}>Protected Correction Review History</h4>
              <p className="notice">Project-only correction requests and Academic Coordinator decisions are retained here. REQUESTED or UNDER_REVIEW awaits a decision, REJECTED does not change a grade, and APPLIED records an authorized correction. Source verification still requires zero unresolved conflicts.</p>
              <div className={styles.tableWrap}><DataTable rows={selectedBatch.correctionRequests} rowKey="id" columns={[
                { key: "row", label: "Source Row", render: (item) => selectedBatch.rows?.find((row) => row.id === item.source_row_id)?.source_row_number || "Unavailable" },
                { key: "previous", label: "Canonical", render: (item) => `${item.previous_grade ?? "INC"} · ${text(item.previous_status)}` },
                { key: "proposed", label: "Proposed", render: (item) => `${item.proposed_grade ?? "INC"} · ${text(item.proposed_status)}` },
                { key: "status", label: "Review Status", render: (item) => <StatusBadge value={item.status} /> },
                { key: "date", label: "Requested", render: (item) => formatDate(item.requested_at) },
                { key: "reviewed", label: "Reviewed", render: (item) => item.reviewed_at ? formatDate(item.reviewed_at) : "Pending" },
                { key: "reference", label: "Review Reference", render: (item) => item.review_reference || "Pending" },
              ]} /></div>
            </div> : null}
            {selectedCorrectionState.needsCancellation && !historyOnly && !release &&
              selectedBatch.status === "CONFLICT_REVIEW" ? <form className={styles.subSection} onSubmit={cancelRejectedBatch}>
                <h4 className={styles.sectionTitle}>Academic Coordinator Rejected the Correction</h4>
                <p className="notice warning" role="status">
                  All conflicting grade correction requests were rejected. Cancel this batch to unlock a new source upload. The rejected file, source evidence, review history and existing academic grades will remain preserved.
                </p>
                <label className="field">Reason for Cancelling This Batch (15–2,000 characters)
                  <textarea value={cancellationReason} minLength={15} maxLength={2000} rows={3}
                    disabled={busy} required onChange={(event) => setCancellationReason(event.target.value)}
                    placeholder="Explain why the rejected grade source must be replaced with a corrected workbook" />
                </label>
                <Button variant="danger" type="submit"
                  disabled={busy || cancellationReason.trim().length < 15 || cancellationReason.trim().length > 2000}>
                  Cancel This Conflicting Batch
                </Button>
              </form> : null}
            {!historyOnly && !release && selectedBatch.status === "CONFLICT_REVIEW" &&
              countConflicts(selectedBatch) && !selectedCorrectionState.hasRequested && !selectedCorrectionState.hasRejected ?
              <form className={styles.subSection} onSubmit={requestCorrections}>
                <h4 className={styles.sectionTitle}>Request Academic Correction Review</h4>
                <p className="notice">Submit only this batch’s reconciled conflicting rows for protected review. This creates requests but does not approve, change, or publish any academic results.</p>
                <label className="field">Reason and Source Evidence (15–2,000 characters)
                  <textarea value={correctionReason} minLength={15} maxLength={2000} rows={3}
                    disabled={busy} required onChange={(event) => setCorrectionReason(event.target.value)}
                    placeholder="Describe the source evidence supporting the proposed historical grades" />
                </label>
                <Button type="submit" disabled={busy || correctionReason.trim().length < 15 || correctionReason.trim().length > 2000}>
                  Submit Correction Review Request
                </Button>
              </form> : null}
            {!historyOnly && !release && selectedBatch.status === "READY_FOR_REVIEW" && !selectedBatch.verified_at ? <form className={styles.subSection} onSubmit={verify}>
              <h4 className={styles.sectionTitle}>Independent Project Source Verification</h4>
              <label className="field">Evidence Review Method
                <input value={verificationMethod} maxLength={240} onChange={(event) => setVerificationMethod(event.target.value)} required
                  placeholder="Describe the evidence you actually checked" />
              </label>
              <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10 }}>
                <input type="checkbox" checked={verificationConfirmed} onChange={(event) => setVerificationConfirmed(event.target.checked)} />
                I independently checked this historical source against its evidence and all of it is verified.
              </label>
              <Button disabled={busy || !verificationConfirmed || !verificationMethod.trim()} type="submit">Record Project Source Verification</Button>
            </form> : null}
          </div> : null}
        </div>

        <div className={styles.secondaryActions}>
          {!historyOnly ? <Button variant="secondary" disabled={busy} onClick={() => moveToStep("upload")}>Back to Upload Grades</Button> : null}
          <Button disabled={busy} onClick={() => moveToStep("publish")}>Continue to Publish Grades</Button>
        </div>
        </section>

        <section id={`${tabId}-panel-publish`} role="tabpanel" aria-labelledby={`${tabId}-tab-publish`}
          className={styles.stepPanel} hidden={activeStep !== "publish"}
          style={{ display: activeStep === "publish" ? undefined : "none" }}>
          <div className={styles.sectionIntro}>
            <h3 className={styles.sectionTitle}>Publish Grades</h3>
            <p className={styles.sectionSubtitle}>Confirm that every historical subject is verified and conflict-free before recording a PROJECT_ONLY block release.</p>
          </div>

          <div className={`${styles.summaryRow} stats-grid`}>
            <div className={`${styles.summaryMetric} metric-card`}><span>Required Subjects</span><strong>{subjects.length}</strong></div>
            <div className={`${styles.summaryMetric} metric-card`}><span>Verified / Required Grades</span><strong>{progress.verified} / {progress.required}</strong></div>
            <div className={`${styles.summaryMetric} metric-card`}><span>Verified Coverage</span><strong>{progress.percent}%</strong></div>
            <div className={`${styles.summaryMetric} metric-card`}><span>Source Conflicts</span><strong>{progress.conflicts}</strong></div>
          </div>
          <label htmlFor={`${tabId}-coverage`} className={styles.helperText}>Verified source coverage: {progress.percent}%</label>
          <progress id={`${tabId}-coverage`} className={styles.progressBar} max="100" value={progress.percent} />

          <div className={styles.subSection}>
            <h4 className={styles.sectionTitle}>Historical Subject Source Checklist</h4>
            <div className={styles.tableWrap}><DataTable rowKey="code" rows={subjects} columns={[
              { key: "subject", label: "Historical Subject", render: (item) => <><strong>{displaySubjectCode(item.code)}</strong><div>{item.name}</div></> },
              { key: "professor", label: "Fictional Demo Professor", render: (item) => item.previousProfessor?.name || "Not assigned" },
              { key: "roster", label: "Required Students", render: (item) => item.expected?.length || 0 },
              { key: "grade", label: "Verified Rows", render: (item) => {
                const batch = progress.latest[subjects.indexOf(item)];
                return isVerifiedProjectBatch(batch, item.expected?.length || 0) ? batch.row_count : 0;
              } },
              { key: "state", label: "Source Status", render: (item) => {
                const batch = progress.latest[subjects.indexOf(item)];
                return <StatusBadge {...projectGradeBatchDisplayStatus(batch)} />;
              } },
              { key: "conflicts", label: "Conflicts", render: (item) => countConflicts(progress.latest[subjects.indexOf(item)]) },
              { key: "action", label: "Select", render: (item) => !historyOnly && !release ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setSubjectCode(item.code); setSelectedBatchId(""); setCorrectionReason(""); setFile(null); setPreview(null); moveToStep("upload"); }}>View Subject</Button> : "—" },
            ]} /></div>
          </div>

        <div className={`${styles.subSection} ${styles.releaseSection}`}>
          <h4 className={styles.sectionTitle}>Historical Block Grade Release</h4>
          {release ? <p className={`notice ${styles.releaseNotice}`}>The historical grade source ledger has release reference <strong>{release.publication_reference}</strong> dated {formatDate(release.published_at)}. Existing canonical history was reconciled without silent replacement.</p> : <div className={styles.releaseContent}>
            <p className={`notice ${styles.releaseNotice}`}>All {subjects.length} subject batches must cover the full historical roster, complete protected source verification and have zero unresolved grade conflicts. This is a project only release.</p>
            <div className={styles.releaseActions}>
              <Button disabled={busy || !publicationAvailable || !progress.complete || progress.conflicts > 0 || historyOnly}
                onClick={() => setPublishConfirmed(true)}>Review Project Block Publication</Button>
            </div>
            {!publicationAvailable ? <p className={`notice warning ${styles.releaseWarning}`} role="status">
              Project source reconciliation is available. Collective publication is disabled until its protected transactional database function has been installed and verified.
            </p> : null}
            {!progress.complete || progress.conflicts ? <p className={`notice warning ${styles.releaseWarning}`} role="status">
              Publication blocked: {Math.max(0, progress.required - progress.verified)} grades still need verified source coverage, {progress.conflicts} source conflicts require approval, and {progress.duplicatedSubjects} subjects have multiple active batches.
            </p> : null}
          </div>}
        </div>

        <div className={styles.subSection}>
      <h4 className={styles.sectionTitle}>Historical Grade Release Ledger</h4>
      <label className="field" htmlFor="project-grade-release-search">
        Search Project Publication History
        <input id="project-grade-release-search" type="search" value={releaseSearch}
          placeholder="Publication reference, block, batch ID or status"
          onChange={(event) => { setReleaseSearch(event.target.value); setReleasePage(1); }} />
      </label>
      <p role="status" aria-live="polite" className={styles.statusRow}>
        Showing {releaseListing.start}–{releaseListing.end} of {releaseListing.totalItems} project releases
      </p>
      {filteredReleases.length === 0 ? <p className={styles.emptyMessage}>{releaseSearch.trim()
        ? "No project grade releases match this search." : "No project grade releases have been published."}</p> : null}
      <div className={styles.tableWrap}><DataTable rows={releaseListing.items} rowKey="id" columns={[
        { key: "reference", label: "Publication Reference", render: (item) => item.publication_reference },
        { key: "block", label: "Current Block", render: (item) => blocks.find((row) => row.id === item.block_id)?.currentBlockCode || item.block_id },
        { key: "term", label: "Historical Term", render: (item) => item.term_id },
        { key: "subjects", label: "Subjects", render: (item) => item.expected_subject_count },
        { key: "grades", label: "Results", render: (item) => item.expected_result_count },
        { key: "status", label: "Status", render: (item) => <StatusBadge value={item.status} /> },
        { key: "date", label: "Published", render: (item) => formatDate(item.published_at) },
      ]} /></div>
      {releaseListing.totalPages > 1 ? <div className={`action-row ${styles.secondaryActions}`} role="navigation" aria-label="Project publication history pages" style={{ marginTop: 10 }}>
        <Button variant="secondary" disabled={releaseListing.page === 1}
          onClick={() => setReleasePage(releaseListing.page - 1)}>Previous</Button>
        <span aria-live="polite">Page {releaseListing.page} of {releaseListing.totalPages}</span>
        <Button variant="secondary" disabled={releaseListing.page === releaseListing.totalPages}
          onClick={() => setReleasePage(releaseListing.page + 1)}>Next</Button>
      </div> : null}
        </div>

        <div className={styles.secondaryActions}>
          <Button variant="secondary" disabled={busy} onClick={() => moveToStep("review")}>Back to Review Grades</Button>
        </div>
        </section>
      </>}
    </Panel>

    <Modal open={publishConfirmed} title="Publish Project Historical Grade Sources" onClose={() => setPublishConfirmed(false)}
      footer={<><Button variant="ghost" onClick={() => setPublishConfirmed(false)}>Cancel</Button>
        <Button disabled={busy || !publicationAvailable || !progress.complete || progress.conflicts > 0} onClick={publish}>Confirm Project Only Publication</Button></>}>
      <p className="notice warning">This records a project historical grade source release. It must not overwrite existing canonical results or create official student grades.</p>
      <Details items={[
        ["Current Block", block?.currentBlockCode || "Not available"],
        ["Historical Group", block?.code || "Not available"],
        ["Historical Term", block?.termId || "Not available"],
        ["Verified Subjects", subjects.length],
        ["Verified Grades", progress.verified],
        ["Conflicts", progress.conflicts],
      ]} />
    </Modal>
  </div>;
}
