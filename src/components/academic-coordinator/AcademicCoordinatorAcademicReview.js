"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  DataTable,
  FilterControl,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
  TableActionButton,
  TableActions,
} from "@/components/ui/PortalUI";
import { Tabs, Details, Feedback, Info } from "@/components/registrar/RegistrarShared";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { useLiveAcademicCoordinator } from "@/features/academic/LiveAcademicCoordinatorProvider";
import { loadAuthorizedAcademicReviewCases } from "@/features/academic/academic-review-cases";
import {
  loadProjectGradeCorrectionReviews,
  decideProjectGradeCorrection,
} from "@/features/grade-import/project-grade-correction-review-actions";
import { displayCurriculumCode, displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";
import {
  ACADEMIC_REVIEW_STATUS,
  canDecideAcademicReview,
  isPendingAcademicReview,
} from "@/features/academic/academic-review-workflow";

const ALL = "ALL";
const PROJECT_GRADE_VIEW = "project-grade-corrections";
const PROJECT_GRADE_DECISION_LABELS = {
  APPROVE_IMPORTED: "Approve Imported Grade",
  REJECT_IMPORTED: "Reject Imported Grade",
};

function gradeDisplay(value) {
  return value === null || value === undefined || value === "" ? "Not recorded" : String(value);
}

function gradeReviewSubject(request) {
  return displaySubjectCode(request.subject_code || "Not recorded");
}

function gradeReviewStudent(request) {
  return request.student_number || "Not recorded";
}

function gradeReviewSource(request) {
  return request.source_reference || request.file_name || request.batch_id || "Not recorded";
}

function gradeReviewPending(request) {
  return request.status === "REQUESTED";
}
const RESOLVED_DECISIONS = new Set([
  ACADEMIC_REVIEW_STATUS.APPROVED,
  ACADEMIC_REVIEW_STATUS.REJECTED,
  ACADEMIC_REVIEW_STATUS.APPLIED,
]);
const DECISION_LABELS = {
  APPROVED: "Approve Exception",
  REJECTED: "Reject Exception",
  RETURNED_FOR_CLARIFICATION: "Return for Clarification",
};
const CONFIRM_LABELS = {
  APPROVED: "Confirm Approval",
  REJECTED: "Confirm Rejection",
  RETURNED_FOR_CLARIFICATION: "Confirm Clarification Request",
};

function isResolvedReview(record) {
  return RESOLVED_DECISIONS.has(record.academicReviewDecision);
}

function getReviewStatus(record) {
  return record.academicReviewDecision === ACADEMIC_REVIEW_STATUS.RETURNED_FOR_CLARIFICATION
    ? ACADEMIC_REVIEW_STATUS.RETURNED_FOR_CLARIFICATION
    : isResolvedReview(record) ? record.academicReviewDecision : ACADEMIC_REVIEW_STATUS.PENDING;
}

function getSubjectCodes(record) {
  const subjects = (record.subjects || []).map((subject) => subject.code).filter(Boolean);
  return subjects.length ? subjects.join(", ") : "Not recorded";
}

function getReviewSubject(record) {
  if (record.reviewId && !record.academicReviewScope?.subjectCode && !record.academicReviewSubjectCode) {
    return "Not specified";
  }
  return record.academicReviewScope?.subjectCode ||
    record.academicReviewSubjectCode || record.subjects?.[0]?.code || "Not specified";
}

function getReviewScope(record) {
  const scope = `Student ${record.academicReviewScope?.studentReference || record.studentNumber}, enrollment ${record.academicReviewScope?.enrollmentReference || record.reference}`;
  return getReviewSubject(record) === "Not specified" ? `${scope}; no specific subject recorded`
    : `${scope}, subject ${displaySubjectCode(getReviewSubject(record))} only`;
}

function getFailedRule(record) {
  const rule = record.failedAcademicRule || record.academicReviewRule || record.academicReviewScope?.rule;
  return !rule || rule === "review"
    ? "Specific failed rule not recorded in demo data"
    : rule;
}

function getAcademicIssue(record) {
  if (record.academicIssue) return record.academicIssue;
  if (record.failedAcademicRule) return record.failedAcademicRule;
  if (record.correctionReason) return record.correctionReason;
  return `Academic review requested for ${displaySubjectCode(getReviewSubject(record))}; specific exception reason was not supplied.`;
}

function getCaseSnapshot(record) {
  return [record.status, record.academicReviewDecision, record.academicReviewDate, record.reviewId].join("|");
}

const caseKey = (record) => record.reviewId || record.reference;
function toCaseReference(record) {
  return `ACR-${caseKey(record)}`;
}

function getStatusDisplay(value) {
  return value === "RETURNED_FOR_CLARIFICATION" ? "Returned for Clarification"
    : value === "PENDING" ? "Pending"
      : value === "APPLIED" ? "Applied"
        : value === "APPROVED" ? "Approved" : "Rejected";
}

export default function AcademicCoordinatorAcademicReview() {
  const liveData = useLiveAcademicCoordinator();
  const isLive = Boolean(liveData);
  const isOfficial = isLive && !liveData.isSyntheticDemo;
  const { registrar, catalog, blockPlanning, decideAcademicReview } = useDemoData();
  const [officialCases, setOfficialCases] = useState({ rows: [], loading: true, error: "" });
  const [view, setView] = useState("pending");
  const [gradeReviewQueue, setGradeReviewQueue] = useState({ requests: [], loading: true, error: "" });
  const [gradeReviewRefresh, setGradeReviewRefresh] = useState(0);
  const [gradeSearch, setGradeSearch] = useState("");
  const [gradeReviewSelected, setGradeReviewSelected] = useState(null);
  const [gradeReviewDecision, setGradeReviewDecision] = useState("");
  const [gradeReviewReason, setGradeReviewReason] = useState("");
  const [gradeReviewEvidence, setGradeReviewEvidence] = useState("");
  const [gradeReviewConfirmed, setGradeReviewConfirmed] = useState(false);
  const [gradeReviewBusy, setGradeReviewBusy] = useState(false);
  const [gradeReviewError, setGradeReviewError] = useState("");
  const [gradeReviewFeedback, setGradeReviewFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState(ALL);
  const [subjectFilter, setSubjectFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [selectedReference, setSelectedReference] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [dialogMode, setDialogMode] = useState("review");
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [step, setStep] = useState("edit");
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");
  const [feedback, setFeedback] = useState({ message: "", warning: false });
  const inFlightRef = useRef(false);
  const reasonRef = useRef(null);
  const confirmationRef = useRef(null);
  const keepEditingRef = useRef(null);

  useEffect(() => {
    if (!isOfficial) return undefined;
    let cancelled = false;
    loadAuthorizedAcademicReviewCases(registrar.enrollments, blockPlanning.students)
      .then((rows) => {
        if (!cancelled) setOfficialCases({ rows, loading: false, error: "" });
      })
      .catch(() => {
        if (!cancelled) setOfficialCases({ rows: [], loading: false,
          error: "Unable to load authorized academic reviews. Refresh the page to retry." });
      });
    return () => { cancelled = true; };
  }, [isOfficial, registrar.enrollments, blockPlanning.students]);

  useEffect(() => {
    // Fetch immediately on mount so the correction tab never advertises a
    // misleading zero before the protected Academic Coordinator read runs.
    let active = true;
    loadProjectGradeCorrectionReviews()
      .then((response) => {
        if (!active) return;
        if (!response?.ok || !Array.isArray(response.data?.requests)) {
          setGradeReviewQueue({ requests: [], loading: false,
            error: response?.message || "Protected project grade correction requests could not be loaded." });
          return;
        }
        setGradeReviewQueue({ requests: response.data.requests, loading: false, error: "" });
      })
      .catch(() => {
        if (active) setGradeReviewQueue({ requests: [], loading: false,
          error: "Protected grade correction reviews could not be loaded. Try refreshing this tab." });
      });
    return () => { active = false; };
  }, [gradeReviewRefresh]);

  const filteredGradeReviews = useMemo(() => {
    const query = gradeSearch.trim().toLowerCase();
    if (!query) return gradeReviewQueue.requests;
    return gradeReviewQueue.requests.filter((request) => [
      request.id, gradeReviewStudent(request), request.student_name,
      gradeReviewSubject(request), request.status, request.reason,
      request.source_reference, request.file_name, request.source_checksum,
      request.batch_id, request.review_reference,
    ].some((value) => String(value ?? "").toLowerCase().includes(query)));
  }, [gradeReviewQueue.requests, gradeSearch]);

  const pendingGradeReviewCount = gradeReviewQueue.requests.filter(gradeReviewPending).length;

  const reviewCases = isOfficial ? officialCases.rows : registrar.enrollments;

  const pendingCases = useMemo(
    () => reviewCases.filter(isPendingAcademicReview),
    [reviewCases],
  );
  const resolvedCases = useMemo(
    () => reviewCases.filter(isResolvedReview),
    [reviewCases],
  );
  const cases = view === "pending" ? pendingCases : resolvedCases;

  const programs = useMemo(
    () => [...new Set(cases.map((record) => record.program).filter(Boolean))].sort(),
    [cases],
  );
  const subjects = useMemo(
    () => [...new Set(cases.flatMap((record) => [getReviewSubject(record),
      ...(record.subjects || []).map((subject) => subject.code)]).filter((value) => value && value !== "Not specified"))].sort(),
    [cases],
  );
  const statusOptions = view === "pending"
    ? [{ value: "PENDING", label: "Pending" }, { value: "RETURNED_FOR_CLARIFICATION", label: "Returned for Clarification" }]
    : [{ value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }, { value: "APPLIED", label: "Applied" }];

  const displayedCases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cases.filter((record) => {
      if (programFilter !== ALL && record.program !== programFilter) return false;
      if (subjectFilter !== ALL && getReviewSubject(record) !== subjectFilter &&
        !(record.subjects || []).some((subject) => subject.code === subjectFilter)) return false;
      if (statusFilter !== ALL && getReviewStatus(record) !== statusFilter) return false;
      if (!query) return true;
      const searchable = [
        toCaseReference(record), record.reference, record.studentNumber, record.studentName,
        record.program, getSubjectCodes(record), getReviewSubject(record), displaySubjectCode(getReviewSubject(record)), getAcademicIssue(record), getReviewStatus(record),
        record.academicReviewReason, record.academicReviewCoordinator, record.academicReviewDate,
      ];
      return searchable.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [cases, programFilter, subjectFilter, statusFilter, search]);

  const current = reviewCases.find((record) => caseKey(record) === selectedReference);
  const studentRecord = registrar.students.find((record) => record.studentNumber === current?.studentNumber);
  const isStale = current && selectedSnapshot !== getCaseSnapshot(current);
  const isEditable = current && dialogMode === "review" && canDecideAcademicReview(current) &&
    !current.academicReviewActionBlocked && !isStale;
  const subjectCatalog = useMemo(
    () => new Map(catalog.subjects.map((subject) => [subject.code, subject])),
    [catalog.subjects],
  );
  const applicablePrerequisites = current?.subjects?.flatMap((item) => {
    if (current.reviewId && item.code !== current.academicReviewSubjectCode) return [];
    const subject = subjectCatalog.get(item.code);
    return (subject?.prerequisites || []).map((prerequisite) => `${displaySubjectCode(item.code)}: ${displaySubjectCode(prerequisite)}`);
  }) || [];

  useEffect(() => {
    if (!current) return;
    if (discardPrompt) {
      keepEditingRef.current?.focus();
      return;
    }
    if (step === "confirm") confirmationRef.current?.focus();
    else if (decision) reasonRef.current?.focus();
  }, [step, decision, current, discardPrompt]);

  function clearFilters() {
    setSearch("");
    setProgramFilter(ALL);
    setSubjectFilter(ALL);
    setStatusFilter(ALL);
  }

  function changeView(nextView) {
    setView(nextView);
    if (nextView === PROJECT_GRADE_VIEW && !gradeReviewQueue.loading) {
      // Revisiting this tab checks for new Registrar requests and decisions.
      setGradeReviewQueue((previous) => ({ ...previous, loading: true, error: "" }));
      setGradeReviewRefresh((count) => count + 1);
    }
    clearFilters();
    setFeedback({ message: "", warning: false });
  }

  function openGradeReview(request) {
    if (!gradeReviewPending(request)) return;
    setGradeReviewSelected(request);
    setGradeReviewDecision("");
    setGradeReviewReason("");
    setGradeReviewEvidence("");
    setGradeReviewConfirmed(false);
    setGradeReviewError("");
    setGradeReviewFeedback("");
  }

  function closeGradeReview() {
    if (gradeReviewBusy) return;
    setGradeReviewSelected(null);
    setGradeReviewDecision("");
    setGradeReviewReason("");
    setGradeReviewEvidence("");
    setGradeReviewConfirmed(false);
    setGradeReviewError("");
  }

  async function confirmGradeReview() {
    if (gradeReviewBusy || !gradeReviewSelected || !gradeReviewPending(gradeReviewSelected)) return;
    if (!["APPROVE_IMPORTED", "REJECT_IMPORTED"].includes(gradeReviewDecision) ||
        gradeReviewReason.trim().length < 15 || gradeReviewReason.trim().length > 2000 ||
        gradeReviewEvidence.trim().length < 8 || gradeReviewEvidence.trim().length > 240 || !gradeReviewConfirmed) {
      setGradeReviewError("Select a decision, enter a reason (15–2,000 characters), add an evidence reference (8–240 characters), and confirm the historical grade effect.");
      return;
    }
    setGradeReviewBusy(true);
    setGradeReviewError("");
    try {
      const response = await decideProjectGradeCorrection(
        gradeReviewSelected.id, gradeReviewDecision, gradeReviewReason.trim(), gradeReviewEvidence.trim(),
      );
      if (!response?.ok) {
        setGradeReviewError(response?.message || "The protected correction decision was rejected. Refresh the review record.");
        return;
      }
      setGradeReviewFeedback(response.message || "Project grade correction decision recorded. Refreshing the protected review queue.");
      setGradeReviewSelected(null);
      setGradeReviewDecision("");
      setGradeReviewReason("");
      setGradeReviewEvidence("");
      setGradeReviewConfirmed(false);
      setGradeReviewQueue((previous) => ({ ...previous, loading: true, error: "" }));
      setGradeReviewRefresh((count) => count + 1);
    } catch {
      setGradeReviewError("The correction decision could not be saved. No successful decision has been confirmed; refresh the queue before retrying.");
    } finally {
      setGradeReviewBusy(false);
    }
  }

  function closeDialog() {
    if (inFlightRef.current) return;
    setSelectedReference(null);
    setSelectedSnapshot(null);
    setDiscardPrompt(false);
    setValidationError("");
    setStep("edit");
    setReason("");
    setDecision(null);
  }

  function requestClose() {
    if (inFlightRef.current) return;
    if (dialogMode === "review" && (reason.trim() || step === "confirm")) {
      setDiscardPrompt(true);
      return;
    }
    closeDialog();
  }

  function openCase(record, readOnly = false) {
    const actionable = !readOnly && canDecideAcademicReview(record) && !record.academicReviewActionBlocked;
    setSelectedReference(caseKey(record));
    setSelectedSnapshot(getCaseSnapshot(record));
    setDialogMode(actionable ? "review" : "details");
    setDiscardPrompt(false);
    setStep("edit");
    setDecision(null);
    setReason("");
    setValidationError("");
    setFeedback({ message: "", warning: false });
    inFlightRef.current = false;
  }

  function reviewDecision(nextDecision) {
    if (!isEditable) {
      setValidationError("This case has changed or is awaiting clarification. Refresh the case before making a decision.");
      return;
    }
    if (!reason.trim()) {
      setValidationError("Decision Reason is required before continuing.");
      reasonRef.current?.focus();
      return;
    }
    setValidationError("");
    setDecision(nextDecision);
    setStep("confirm");
  }

  async function confirmDecision() {
    if (inFlightRef.current) return;
    if (!current || !isEditable || !decision || !reason.trim()) {
      setValidationError("This case is no longer ready for this decision. Review its current status and reason.");
      setStep("edit");
      return;
    }

    inFlightRef.current = true;
    let result;
    try {
      result = await decideAcademicReview(current.reference, { decision, note: reason.trim() });
    } catch {
      result = { ok: false, message: "The academic decision could not be saved. Refresh the case and retry." };
    }
    if (result.ok) {
      setFeedback({
        message: `Decision recorded for ${toCaseReference(current)}. The enrollment is now ${result.nextStatus.replaceAll("_", " ")}; Registrar confirmation remains separate.`,
        warning: false,
      });
      inFlightRef.current = false;
      closeDialog();
      return;
    }
    inFlightRef.current = false;
    setValidationError(result.message || "The academic decision could not be saved.");
    setStep("edit");
  }

  return (
    <>
      <PageHeader
        title="Academic Review"
        description="Decide defined academic exceptions using the minimum student and enrollment context required for review."
      />

      {isOfficial && officialCases.loading && <p role="status">Loading authorized academic review cases...</p>}
      {isOfficial && officialCases.error && <p role="alert" className="notice warning">{officialCases.error}</p>}
      <p className="notice" style={{ marginBottom: 14 }}>
        Pending and Resolved Reviews are enrollment academic exceptions. Historical PROJECT_ONLY grade corrections have a separate review queue and count.
      </p>
      {!gradeReviewQueue.loading && gradeReviewQueue.error ? (
        <p className="notice warning" role="alert" style={{ marginBottom: 14 }}>
          Project Grade Corrections could not be loaded: {gradeReviewQueue.error}
          {" "}<Button variant="secondary" onClick={() => changeView(PROJECT_GRADE_VIEW)}>Open correction reviews and retry</Button>
        </p>
      ) : null}

      <Tabs
        selected={view}
        onSelect={changeView}
        label="Academic review sections"
        title="Academic Review Queue"
        subtitle={isLive ? "Decisions are recorded in the academic database. Official enrollment confirmation belongs to the Registrar." : "Decisions update this demo session only. Official enrollment confirmation belongs to the Registrar."}
        items={[
          { value: "pending", label: `Pending Reviews (${isOfficial && officialCases.loading ? "Loading…" : pendingCases.length})` },
          { value: "resolved", label: `Resolved Reviews (${isOfficial && officialCases.loading ? "Loading…" : resolvedCases.length})` },
          { value: PROJECT_GRADE_VIEW, label: `Project Grade Corrections (${gradeReviewQueue.loading ? "Loading…" : gradeReviewQueue.error ? "Unavailable" : pendingGradeReviewCount})` },
        ]}
      >
        {view === PROJECT_GRADE_VIEW ? (
          <section aria-label="Protected project grade correction review queue">
            <p className="notice" style={{ marginBottom: 14 }}>
              Review only PROJECT_ONLY fictional historical grade discrepancies. Approving an imported grade explicitly changes its protected fictional academic result. Rejecting it requires the Registrar to cancel and reupload an accurate grade source. Official institutional grades are not decided here.
            </p>
            <div className="toolbar">
              <SearchControl label="Search project grade correction requests" value={gradeSearch}
                onChange={setGradeSearch} placeholder="Search student, subject, source or request status" />
              <Button variant="secondary" disabled={gradeReviewBusy || gradeReviewQueue.loading}
                onClick={() => {
                  setGradeReviewQueue((previous) => ({ ...previous, loading: true, error: "" }));
                  setGradeReviewRefresh((count) => count + 1);
                }}>Refresh Requests</Button>
            </div>
            {gradeReviewFeedback ? <p className="notice" role="status">{gradeReviewFeedback}</p> : null}
            {gradeReviewQueue.error ? <p className="notice warning" role="alert">{gradeReviewQueue.error}</p> : null}
            <div className="summary-strip" role="status" aria-live="polite" style={{ marginBottom: 14 }}>
              <span><strong>{filteredGradeReviews.length}</strong> of {gradeReviewQueue.requests.length} correction requests displayed</span>
              <span><strong>{pendingGradeReviewCount}</strong> awaiting an Academic Coordinator decision</span>
            </div>
            <DataTable rowKey="id" rows={filteredGradeReviews}
              emptyMessage={gradeReviewQueue.loading ? "Loading protected grade corrections..." : gradeReviewQueue.error ? "Correction requests are unavailable." : "No project grade correction requests match this search."}
              columns={[
                { key: "student", label: "Student Number", render: gradeReviewStudent },
                { key: "subject", label: "Historical Subject", render: gradeReviewSubject },
                { key: "previous", label: "Existing Grade", render: (request) => `${gradeDisplay(request.previous_grade)} (${gradeDisplay(request.previous_status)})` },
                { key: "proposed", label: "Imported Grade", render: (request) => `${gradeDisplay(request.proposed_grade)} (${gradeDisplay(request.proposed_status)})` },
                { key: "source", label: "Source Reference", render: gradeReviewSource },
                { key: "reason", label: "Request Reason", render: (request) => request.reason || "Not recorded" },
                { key: "checksum", label: "Source SHA256", render: (request) => request.source_checksum || "Not recorded" },
                { key: "status", label: "Status", render: (request) => <StatusBadge value={request.status} /> },
                { key: "actions", label: "Action", render: (request) => gradeReviewPending(request) ? (
                  <TableActions><TableActionButton tone="review" onClick={() => openGradeReview(request)}>Review Correction</TableActionButton></TableActions>
                ) : "Decision recorded" },
              ]}
            />
          </section>
        ) : <>
        <div className="toolbar">
          <SearchControl
            value={search}
            onChange={setSearch}
            label="Search academic review cases"
            placeholder="Search case, student, subject, or issue"
          />
          <FilterControl
            label="Program"
            value={programFilter}
            onChange={setProgramFilter}
            options={[{ value: ALL, label: "All Programs" }, ...programs.map((value) => ({ value, label: value }))]}
          />
          <FilterControl
            label="Subject"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={[{ value: ALL, label: "All Subjects" }, ...subjects.map((value) => ({ value, label: displaySubjectCode(value) }))]}
          />
          <FilterControl
            label={view === "pending" ? "Review Status" : "Decision Status"}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: ALL, label: "All Statuses" }, ...statusOptions]}
          />
          <Button variant="ghost" onClick={clearFilters}>Reset Filters</Button>
        </div>
        <div className="summary-strip" role="status" aria-live="polite" style={{ marginBottom: 14 }}>
          <span><strong>{displayedCases.length}</strong> of {cases.length} {view === "pending" ? "pending cases" : "resolved cases"} displayed</span>
          {view === "pending" ? <span>Returned cases await clarification before another decision.</span> : <span>Resolved decisions remain available for audit review.</span>}
        </div>
        <Feedback message={feedback.message} warning={feedback.warning} />

        {view === "pending" ? (
          <DataTable
            rowKey={caseKey}
            rows={displayedCases}
            emptyMessage={isOfficial && officialCases.loading ? "Loading reviews..." : "No pending reviews match the current filters."}
            columns={[
              { key: "caseReference", label: "Case Reference", render: toCaseReference },
              { key: "studentReference", label: "Student Reference", render: (record) => record.studentNumber },
              { key: "program", label: "Program" },
              { key: "subject", label: "Subject", render: (record) => displaySubjectCode(getReviewSubject(record)) },
              { key: "academicIssue", label: "Academic Issue", render: getAcademicIssue },
              { key: "dateSubmitted", label: "Date Submitted", render: (record) => record.submittedDate || "Not recorded" },
              { key: "status", label: "Status", render: (record) => <StatusBadge value={getReviewStatus(record)} label={getStatusDisplay(getReviewStatus(record))} /> },
              { key: "actions", label: "Action", render: (record) => (
                <TableActions>
                  <TableActionButton tone="review" onClick={() => openCase(record)}>{record.academicReviewActionBlocked ? "View Case" : "Review Case"}</TableActionButton>
                </TableActions>
              ) },
            ]}
          />
        ) : (
          <DataTable
            rowKey={caseKey}
            rows={displayedCases}
            emptyMessage={isOfficial && officialCases.loading ? "Loading reviews..." : "No resolved reviews match the current filters."}
            columns={[
              { key: "caseReference", label: "Case Reference", render: toCaseReference },
              { key: "studentReference", label: "Student Reference", render: (record) => record.studentNumber },
              { key: "program", label: "Program" },
              { key: "subject", label: "Subject", render: (record) => displaySubjectCode(getReviewSubject(record)) },
              { key: "decisionStatus", label: "Decision Status", render: (record) => <StatusBadge value={record.academicReviewDecision} label={getStatusDisplay(record.academicReviewDecision)} /> },
              { key: "decisionDate", label: "Decision Date", render: (record) => record.academicReviewDate || "Not recorded" },
              { key: "actions", label: "Action", render: (record) => (
                <TableActions>
                  <TableActionButton tone="view" onClick={() => openCase(record, true)}>View Details</TableActionButton>
                </TableActions>
              ) },
            ]}
          />
        )}
        </>}
      </Tabs>

      <Modal
        open={Boolean(current)}
        title={discardPrompt ? "Discard Unsaved Academic Decision?" : current ? `${dialogMode === "review" ? "Review Case" : "Academic Review Details"} · ${toCaseReference(current)}` : "Academic Review"}
        onClose={requestClose}
        className="academic-setup-wide-modal academic-review-case-modal"
        footer={current ? (
          discardPrompt ? (
            <>
              <Button ref={keepEditingRef} variant="secondary" onClick={() => setDiscardPrompt(false)}>Keep Editing</Button>
              <Button variant="danger" onClick={closeDialog}>Discard Changes</Button>
            </>
          ) : step === "confirm" && isEditable ? (
            <>
              <Button variant="ghost" onClick={() => { setStep("edit"); setValidationError(""); }}>Back to Decision</Button>
              <Button variant={decision === "REJECTED" ? "danger" : "primary"} onClick={confirmDecision}>
                {CONFIRM_LABELS[decision]}
              </Button>
            </>
          ) : <Button variant="ghost" onClick={requestClose}>Close</Button>
        ) : null}
      >
        {current ? (
          discardPrompt ? (
            <section aria-label="Discard decision confirmation">
              <p className="notice warning" role="alert" style={{ marginBottom: 14 }}>
                The academic decision for {toCaseReference(current)} has unsaved changes. Discarding will clear the drafted reason and decision.
              </p>
              <Details items={[
                ["Case Reference", toCaseReference(current)],
                ["Draft Decision", decision ? DECISION_LABELS[decision] : "Not yet selected"],
                ["Draft Reason", reason.trim() || "Not entered"],
              ]} />
            </section>
          ) : (
          <>
            <section aria-labelledby="academic-context-title" style={{ marginBottom: 20 }}>
              <div className="section-header"><h3 id="academic-context-title">Student and Enrollment Context</h3></div>
              <div className="info-grid">
                <Info label="Case Reference" value={toCaseReference(current)} />
                <Info label="Student Reference" value={current.studentNumber} />
                <Info label="Program" value={current.program} />
                <Info label="Curriculum Version" value={displayCurriculumCode(current.curriculum) || "Not recorded"} />
                <Info label="Year Level" value={current.yearLevel || studentRecord?.yearLevel || "Not recorded"} />
                <Info label="Academic Term" value={current.term || "Not recorded"} />
                <Info label="Affected Subject" value={displaySubjectCode(getReviewSubject(current))} />
                <Info label="Date Submitted" value={current.submittedDate || "Not recorded"} />
              </div>
            </section>
            <section aria-labelledby="academic-issue-title" style={{ marginBottom: 20 }}>
              <div className="section-header"><h3 id="academic-issue-title">Academic Issue</h3></div>
              <Details items={[
                ["Issue Requiring Review", getAcademicIssue(current)],
                ["Failed Academic Rule", getFailedRule(current)],
                ["Existing Academic Condition", current.academicCondition || current.existingAcademicCondition || "Not recorded"],
                ["Curriculum Requirement", displayCurriculumCode(current.academicCurriculumRequirement || current.curriculum) || "Not recorded"],
                ["Related Prerequisite Details", applicablePrerequisites.length ? applicablePrerequisites.join(", ") : "No prerequisite details supplied"],
                ["Existing Clarification", current.academicReviewClarification || current.clarificationResponse || current.clarification || "No clarification submitted"],
                ["Registrar or Enrollment Note", current.correctionReason || "No additional note recorded"],
              ]} />
            </section>
            <section aria-labelledby="academic-decision-title">
              <div className="section-header"><h3 id="academic-decision-title">Academic Decision</h3></div>
              {dialogMode === "details" || !isEditable ? (
                <>
                  <Details items={[
                    ["Review Status", getStatusDisplay(getReviewStatus(current))],
                    ["Decision Reason", current.academicReviewReason || "No decision reason recorded"],
                    ["Reviewed By", current.academicReviewCoordinator || "Not yet decided"],
                    ["Decision Date", current.academicReviewDate || "Not yet decided"],
                    ["Decision Scope", getReviewScope(current)],
                  ]} />
                  {getReviewStatus(current) === "RETURNED_FOR_CLARIFICATION" ? (
                    <p className="notice warning" style={{ marginTop: 12 }}>
                      This case is awaiting clarification. Further decisions are unavailable until the clarification is received.
                    </p>
                  ) : null}
                  {current.academicReviewActionBlocked && <p className="notice warning" style={{ marginTop: 12 }}>
                    This enrollment has multiple pending review records. A specific review must be selected by the database decision transaction before a decision can be made.
                  </p>}
                  {isStale ? <p className="notice warning" role="alert" style={{ marginTop: 12 }}>The case changed while this dialog was open. Close and reopen it for the latest details.</p> : null}
                </>
              ) : step === "confirm" ? (
                <>
                  <div ref={confirmationRef} className="notice" role="status" tabIndex={-1} style={{ marginBottom: 14 }}>Verify the decision, academic reason, and affected record before confirming.</div>
                  <Details items={[
                    ["Case Reference", toCaseReference(current)],
                    ["Student Reference", current.studentNumber],
                    ["Decision", DECISION_LABELS[decision]],
                    ["Decision Reason", reason.trim()],
                    ["Effective Scope", getReviewScope(current)],
                    ["Enrollment Authority", "Registrar validates and confirms official enrollment separately"],
                  ]} />
                </>
              ) : (
                <>
                  <label className="field full">
                    Decision Reason (required)
                    <textarea
                      ref={reasonRef}
                      required
                      aria-invalid={Boolean(validationError)}
                      aria-describedby={validationError ? "academic-decision-error" : undefined}
                      value={reason}
                      onChange={(event) => { setReason(event.target.value); setValidationError(""); }}
                      placeholder="Explain the academic basis and conditions for this case"
                      rows={4}
                    />
                  </label>
                  <p className="notice" style={{ marginTop: 12 }}>
                    Approval returns the enrollment to Registrar validation. Rejection requires correction. Clarification keeps the case pending and prevents another decision until clarification is received.
                  </p>
                  <div className="action-row" style={{ marginTop: 16 }}>
                    <Button onClick={() => reviewDecision("APPROVED")}>Approve Exception</Button>
                    <Button variant="danger" onClick={() => reviewDecision("REJECTED")}>Reject Exception</Button>
                    <Button variant="secondary" onClick={() => reviewDecision("RETURNED_FOR_CLARIFICATION")}>Return for Clarification</Button>
                  </div>
                </>
              )}
              {validationError ? <p id="academic-decision-error" className="notice warning" role="alert" style={{ marginTop: 12 }}>{validationError}</p> : null}
            </section>
          </>
          )
        ) : null}
      </Modal>

      <Modal
        open={Boolean(gradeReviewSelected)}
        title={gradeReviewSelected ? `Project Grade Correction · ${gradeReviewStudent(gradeReviewSelected)} · ${gradeReviewSubject(gradeReviewSelected)}` : "Project Grade Correction"}
        onClose={closeGradeReview}
        className="academic-setup-wide-modal academic-review-case-modal"
        footer={gradeReviewSelected ? <>
          <Button variant="ghost" disabled={gradeReviewBusy} onClick={closeGradeReview}>Cancel</Button>
          <Button variant={gradeReviewDecision === "REJECT_IMPORTED" ? "danger" : "primary"}
            disabled={gradeReviewBusy || !gradeReviewPending(gradeReviewSelected) ||
              !PROJECT_GRADE_DECISION_LABELS[gradeReviewDecision] ||
              gradeReviewReason.trim().length < 15 || gradeReviewReason.trim().length > 2000 ||
              gradeReviewEvidence.trim().length < 8 || gradeReviewEvidence.trim().length > 240 || !gradeReviewConfirmed}
            onClick={confirmGradeReview}>
            {gradeReviewBusy ? "Saving Decision..." : `Confirm ${PROJECT_GRADE_DECISION_LABELS[gradeReviewDecision] || "Decision"}`}
          </Button>
        </> : null}
      >
        {gradeReviewSelected ? <section aria-label="Protected historical grade correction decision">
          <div className="notice warning" style={{ marginBottom: 14 }} role="status">
            <strong>PROJECT_ONLY historical grades</strong>
            <p>Approval explicitly changes the existing fictional historical result to the proposed imported grade through a protected server decision. Rejection preserves the existing grade and requires the Registrar to cancel and reupload a corrected source. Neither action approves official institutional grades.</p>
          </div>
          <Details items={[
            ["Student Number", gradeReviewStudent(gradeReviewSelected)],
            ["Student Name", gradeReviewSelected.student_name || "Not recorded"],
            ["Historical Subject", gradeReviewSubject(gradeReviewSelected)],
            ["Existing Canonical Grade", gradeDisplay(gradeReviewSelected.previous_grade)],
            ["Existing Completion Status", gradeDisplay(gradeReviewSelected.previous_status)],
            ["Proposed Imported Grade", gradeDisplay(gradeReviewSelected.proposed_grade)],
            ["Proposed Completion Status", gradeDisplay(gradeReviewSelected.proposed_status)],
            ["Registrar Request Reason", gradeReviewSelected.reason || "Not recorded"],
            ["Grade Source Reference", gradeReviewSource(gradeReviewSelected)],
            ["Source File", gradeReviewSelected.file_name || "Not recorded"],
            ["Source SHA256 Checksum", gradeReviewSelected.source_checksum || "Not recorded"],
            ["Request Status", gradeDisplay(gradeReviewSelected.status)],
          ]} />
          <fieldset disabled={gradeReviewBusy} style={{ border: 0, padding: 0, margin: "18px 0" }}>
            <legend style={{ fontWeight: 700, marginBottom: 8 }}>Academic Coordinator Decision (required)</legend>
            <label className="field" style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <input type="radio" name="project-grade-correction-decision" value="APPROVE_IMPORTED"
                checked={gradeReviewDecision === "APPROVE_IMPORTED"}
                onChange={() => { setGradeReviewDecision("APPROVE_IMPORTED"); setGradeReviewConfirmed(false); setGradeReviewError(""); }} />
              Approve imported grade — update the fictional historical grade to the proposed value.
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10 }}>
              <input type="radio" name="project-grade-correction-decision" value="REJECT_IMPORTED"
                checked={gradeReviewDecision === "REJECT_IMPORTED"}
                onChange={() => { setGradeReviewDecision("REJECT_IMPORTED"); setGradeReviewConfirmed(false); setGradeReviewError(""); }} />
              Reject imported grade — preserve the historical grade; Registrar must cancel and reupload a correct source.
            </label>
          </fieldset>
          <label className="field full">Reviewer Reason (required, 15–2,000 characters)
            <textarea value={gradeReviewReason} rows={3} minLength={15} maxLength={2000}
              disabled={gradeReviewBusy} required placeholder="Explain the academic evidence supporting approval or rejection"
              onChange={(event) => { setGradeReviewReason(event.target.value); setGradeReviewConfirmed(false); setGradeReviewError(""); }} />
          </label>
          <label className="field full" style={{ marginTop: 12 }}>Reviewer Evidence Reference (required, 8–240 characters)
            <input type="text" value={gradeReviewEvidence} minLength={8} maxLength={240} disabled={gradeReviewBusy} required
              placeholder="e.g. approved academic record or document reference"
              onChange={(event) => { setGradeReviewEvidence(event.target.value); setGradeReviewConfirmed(false); setGradeReviewError(""); }} />
          </label>
          <label className="field full" style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 16 }}>
            <input type="checkbox" checked={gradeReviewConfirmed} disabled={gradeReviewBusy || !gradeReviewDecision}
              onChange={(event) => { setGradeReviewConfirmed(event.target.checked); setGradeReviewError(""); }} />
            I have checked the student, subject, before/after grade, source checksum and evidence. I understand the effect of this PROJECT_ONLY decision.
          </label>
          {gradeReviewError ? <p className="notice warning" role="alert" style={{ marginTop: 12 }}>{gradeReviewError}</p> : null}
        </section> : null}
      </Modal>
    </>
  );
}
