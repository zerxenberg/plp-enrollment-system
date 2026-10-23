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
  ACADEMIC_REVIEW_STATUS,
  canDecideAcademicReview,
  isPendingAcademicReview,
} from "@/features/academic/academic-review-workflow";

const ALL = "ALL";
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
    : `${scope}, subject ${getReviewSubject(record)} only`;
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
  return `Academic review requested for ${getReviewSubject(record)}; specific exception reason was not supplied.`;
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
        record.program, getSubjectCodes(record), getReviewSubject(record), getAcademicIssue(record), getReviewStatus(record),
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
    return (subject?.prerequisites || []).map((prerequisite) => `${item.code}: ${prerequisite}`);
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
    clearFilters();
    setFeedback({ message: "", warning: false });
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

      <Tabs
        selected={view}
        onSelect={changeView}
        label="Academic review sections"
        title="Academic Review Queue"
        subtitle={isLive ? "Decisions are recorded in the academic database. Official enrollment confirmation belongs to the Registrar." : "Decisions update this demo session only. Official enrollment confirmation belongs to the Registrar."}
        items={[
          { value: "pending", label: `Pending Reviews (${pendingCases.length})` },
          { value: "resolved", label: `Resolved Reviews (${resolvedCases.length})` },
        ]}
      >
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
            options={[{ value: ALL, label: "All Subjects" }, ...subjects.map((value) => ({ value, label: value }))]}
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
              { key: "subject", label: "Subject", render: getReviewSubject },
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
              { key: "subject", label: "Subject", render: getReviewSubject },
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
                <Info label="Curriculum Version" value={current.curriculum || "Not recorded"} />
                <Info label="Year Level" value={current.yearLevel || studentRecord?.yearLevel || "Not recorded"} />
                <Info label="Academic Term" value={current.term || "Not recorded"} />
                <Info label="Affected Subject" value={getReviewSubject(current)} />
                <Info label="Date Submitted" value={current.submittedDate || "Not recorded"} />
              </div>
            </section>
            <section aria-labelledby="academic-issue-title" style={{ marginBottom: 20 }}>
              <div className="section-header"><h3 id="academic-issue-title">Academic Issue</h3></div>
              <Details items={[
                ["Issue Requiring Review", getAcademicIssue(current)],
                ["Failed Academic Rule", getFailedRule(current)],
                ["Existing Academic Condition", current.academicCondition || current.existingAcademicCondition || "Not recorded"],
                ["Curriculum Requirement", current.academicCurriculumRequirement || current.curriculum || "Not recorded"],
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
    </>
  );
}
