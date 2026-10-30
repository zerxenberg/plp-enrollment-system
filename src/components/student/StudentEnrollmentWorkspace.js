"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Card, DataTable, FilterControl, InternalTabs, Modal, PageHeader, SearchControl, StatusBadge, TableActionButton } from "@/components/ui/PortalUI";
import { submitPreparedProjectEnrollment, getConfirmedProjectDemonstrationCor } from "@/features/students/student-portal-actions";
import CorDocumentPreview from "@/components/cor/CorDocumentPreview";
import { displayCurriculumCode, displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";
import { groupMeetingSchedules, formatMeetingSchedule } from "@/features/students/class-meeting-format.mjs";

const TABS = [
  { value: "current", label: "Current Enrollment" },
  { value: "history", label: "Enrollment History" },
];

const ENROLLMENT_REVIEW_LABELS = Object.freeze({
  NOT_STARTED: "Not started",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  VALIDATED: "Validated",
  RETURNED: "Returned",
  CONFIRMED_SIMULATION: "Enrolled (Project)",
  CONFIRMED_FOR_PROJECT_SIMULATION: "Confirmed (demonstration only)",
});

function enrollmentReviewLabel(value) {
  const raw = String(value || "Not recorded");
  const canonical = raw.trim().toUpperCase().replaceAll(/\s+/g, "_");
  return ENROLLMENT_REVIEW_LABELS[canonical] || raw.replaceAll("_", " ");
}

function Field({ label, value }) {
  return <div className="info-item"><span>{label}</span><strong>{value ?? "Not available"}</strong></div>;
}

function formatProjectPeso(amount) {
  return typeof amount === "number" && Number.isFinite(amount)
    ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)
    : "Not available";
}

function ScheduleText({ meetings }) {
  if (!meetings?.length) return "Awaiting timetable";
  return <div className="detail-list">{groupMeetingSchedules(meetings).map((line) =>
    <span key={line} style={{ display: "block" }}>{line}</span>)}</div>;
}

export default function StudentEnrollmentWorkspace({
  data,
  submitEnrollmentAction = submitPreparedProjectEnrollment,
  prepareEnrollmentAction = null,
  reopenEnrollmentAction = null,
  demonstrationCorUrl = null,
}) {
  const [activeTab, setActiveTab] = useState("current");
  const [detail, setDetail] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [cor, setCor] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [semesterFilter, setSemesterFilter] = useState("ALL");
  const [isPending, startTransition] = useTransition();

  const history = useMemo(() => data.kind === "ready" && data.simulation?.id ? [{
    id: data.simulation.id,
    academicYear: data.term.academicYear,
    semester: data.term.semester,
    program: data.student.program,
    block: data.homeBlock,
    registeredUnits: data.simulation.status === "CONFIRMED_SIMULATION"
      ? data.confirmedRegistration?.units ?? null : null,
    status: data.simulation.status,
    submittedAt: data.simulation.submittedAt,
  }] : [], [data]);
  const visibleHistory = history.filter((item) =>
    `${item.academicYear} ${item.semester} ${item.program} ${item.block}`.toLowerCase().includes(search.toLowerCase()) &&
    (yearFilter === "ALL" || String(item.academicYear) === yearFilter) &&
    (semesterFilter === "ALL" || String(item.semester) === semesterFilter) &&
    (statusFilter === "ALL" || statusFilter === item.status));

  function handleSubmit() {
    if (!canReview) return;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await submitEnrollmentAction();
        if (result?.ok === false) throw new Error(result.message || "Submission was not accepted.");
        setReviewOpen(false);
        setMessage("Your demonstration enrollment was submitted for Registrar review. Your official university enrollment remains unconfirmed.");
        window.location.reload();
      } catch (error) {
        setMessage(error?.message || "Submission failed. Please review your enrollment details.");
      }
    });
  }

  function openDemonstrationCor() {
    setMessage("");
    if (demonstrationCorUrl) {
      setCor({ registration_snapshot_complete: true });
      return;
    }
    startTransition(async () => {
      try {
        const result = await getConfirmedProjectDemonstrationCor();
        if (result.registration_snapshot_complete !== true) {
          throw new Error("Registered subjects and class meetings have not been verified.");
        }
        setCor(result);
      } catch (error) {
        setMessage(error?.message || "The registration demonstration is unavailable.");
      }
    });
  }

  function runPlacementAction(action) {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.ok === false) throw new Error(result.message || "The request was not accepted.");
        setMessage(result?.message || "Enrollment preparation updated.");
        window.location.reload();
      } catch (error) {
        setMessage(error?.message || "Please review your eligibility requirements.");
      }
    });
  }

  if (data.kind !== "ready") {
    const recordsUnavailable = data.reason === "records";
    return <><PageHeader title="Enrollment" description="Current Enrollment and Enrollment History" />
      <Card><div className="notice" role="alert">{recordsUnavailable
        ? "Your enrollment records are temporarily unavailable. Your account has not been identified as the problem. Please try again or contact the System Administrator."
        : "Your authenticated student account could not be verified. Please sign in again or contact the System Administrator."}</div></Card></>;
  }

  const simulationStatus = data.simulation?.status || "NOT_STARTED";
  const locked = ["SUBMITTED", "VALIDATED", "CONFIRMED_SIMULATION"].includes(simulationStatus);
  const isConfirmedSimulation = simulationStatus === "CONFIRMED_SIMULATION";
  const confirmedRegistration = isConfirmedSimulation ? data.confirmedRegistration : null;
  const selectedCount = data.proposedSubjects.length;
  const selectedCodes = new Set(data.proposedSubjects.map((subject) => subject.code));
  const selectedFees = new Map((data.projectFeeEstimate?.subjects || []).map((subject) =>
    [subject.code, subject.estimatedFee]));
  const plannedCount = data.proposedSubjects.filter((subject) => subject.sectionStatus === "PLANNED").length;
  const allSectionsOpen = selectedCount > 0 && data.proposedSubjects.every((subject) =>
    subject.sectionStatus === "OPEN");
  const canReview = data.canSubmit === true && allSectionsOpen && !locked;
  const unitFeeFor = (item) => selectedCodes.has(item.code)
    ? (selectedFees.has(item.code) ? formatProjectPeso(selectedFees.get(item.code)) : "Fee unavailable")
    : "Not in current proposal";
  const verifiedRate = data.projectFeeEstimate?.ratePerUnit;
  const rateLabel = typeof verifiedRate === "number" && Number.isFinite(verifiedRate)
    ? `${formatProjectPeso(verifiedRate)} per unit` : "unit rate not verified";
  const blockingReasons = data.blockingReasons || [];
  const hasActivationReason = blockingReasons.some((reason) =>
    /activate|activation|still PLANNED/i.test(reason));
  const submissionAvailability = locked ? "Read only after submission"
    : plannedCount > 0 ? "Awaiting section activation"
      : canReview ? "Ready for submission" : "Not currently available";
  const displayedReviewStatus = isConfirmedSimulation && !confirmedRegistration
    ? "Confirmation Recorded (Details Unverified)" : enrollmentReviewLabel(simulationStatus);

  return <>
    <PageHeader title="Enrollment" description="Review your prepared subjects, submit for review, and follow your enrollment progress." />
    <p style={{ marginTop: 8, fontSize: "0.8rem" }}>Academic demonstration environment</p>
    <div style={{ marginTop: 16 }}>
      <InternalTabs items={TABS} selected={activeTab} onSelect={setActiveTab} label="Enrollment sections" panelCard>
        {activeTab === "current" ? <>
          <div className="section-header"><div>
            <h2>Current Enrollment</h2>
            <p>Review the subjects and class meetings prepared for the selected academic term.</p>
          </div><StatusBadge value={simulationStatus} label={displayedReviewStatus} /></div>

          <div className="info-grid" style={{ marginTop: 16 }}>
            <Field label="Student" value={`${data.student.name} (${data.student.number})`} />
            <Field label="Program and Curriculum" value={`${data.student.program} · ${displayCurriculumCode(data.student.curriculum)}`} />
            <Field label="Academic Term" value={data.term.label} />
            <Field label="Proposed Home Block" value={data.homeBlock || "No validated block"} />
            <Field label="Proposed Eligible Subjects" value={String(selectedCount)} />
            <Field label="Proposed Units" value={String(data.proposedUnits)} />
            <Field label="Proposed Estimated Tuition" value={formatProjectPeso(data.projectFeeEstimate?.estimatedAmount)} />
            {isConfirmedSimulation && <>
              <Field label="Registered Subjects (Project)"
                value={confirmedRegistration ? String(confirmedRegistration.subjects.length) : "Not verified"} />
              <Field label="Registered Units (Project)"
                value={confirmedRegistration ? String(confirmedRegistration.units) : "Not verified"} />
              <Field label="Registered Estimated Tuition"
                value={formatProjectPeso(confirmedRegistration?.projectFeeEstimate?.estimatedAmount)} />
            </>}
            <Field label="Academic Classification" value={<StatusBadge value={data.student.classification || "NOT_VERIFIED"} />} />
            <Field label="Submission Availability" value={submissionAvailability} />
          </div>

          {!locked && plannedCount > 0 && !hasActivationReason && <div className="notice warning" role="status" style={{ marginTop: 10 }}>
            {plannedCount} proposed subject section{plannedCount === 1 ? " is" : "s are"} still PLANNED. The Academic Coordinator must activate {plannedCount === 1 ? "this section" : "these sections"} before enrollment can be submitted.
          </div>}
          {!locked && blockingReasons.filter((reason) =>
            reason !== "No currently eligible subjects have open sections and a verified class timetable.")
            .map((reason) => <div key={reason} className="notice warning" role="status" style={{ marginTop: 10 }}>{reason}</div>)}
          {isConfirmedSimulation && !confirmedRegistration ? (
            <div className="notice warning" role="alert" style={{ marginTop: 12 }}>
              Registration is incomplete. Ask the Registrar to recover this legacy demonstration
              enrollment, then submit your current eligible subjects again.
            </div>
          ) : null}
          {simulationStatus === "RETURNED" && <div className="notice warning" role="status" style={{ marginTop: 12 }}>
            <strong>Returned by Registrar for correction.</strong>
            <p>{data.simulation?.correctionReason || "Please review your prepared enrollment and contact the Registrar for the recorded return reason."}</p>
            <p>Make permitted corrections before resubmission. This demonstration enrollment can be resubmitted when the Registrar reopens a valid enrollment period.</p>
          </div>}

          <div className="section-header" style={{ marginTop: 22 }}><div>
            <h2>Prepared Subject Registration</h2>
            <p>Academically eligible subjects with planned or open sections are included in the proposal. Registration requires every proposed section to be OPEN.</p>
          </div></div>
          <DataTable rowKey="code" rows={data.subjects} columns={[
            { key: "code", label: "Subject Code", render: (item) => displaySubjectCode(item.code) },
            { key: "name", label: "Subject Name", render: (item) => displaySubjectCode(item.name) },
            { key: "units", label: "Units" },
            { key: "unitFee", label: "Estimated Subject Fee", render: unitFeeFor },
            { key: "section", label: "Assigned Section", render: (item) => item.section || "Not assigned" },
            { key: "sectionStatus", label: "Section Status", render: (item) => item.sectionStatus || "Unavailable" },
            { key: "eligibility", label: "Eligibility", render: (item) => <StatusBadge value={item.eligibility} /> },
            { key: "action", label: "Action", render: (item) =>
              <TableActionButton onClick={() => setDetail({ type: "subject", value: item })}>View Details</TableActionButton> },
          ]} />
          <div className="summary-strip" style={{ marginTop: 18 }}>
            <span>Estimated Tuition for {selectedCount} Proposed Eligible Subjects ({data.proposedUnits} units at {rateLabel})</span>
            <strong>{formatProjectPeso(data.projectFeeEstimate?.estimatedAmount)}</strong>
          </div>
          <p style={{ marginTop: 8, fontSize: "0.8rem" }}>Fictional classroom estimate only. Planned sections are included in the proposed amount but cannot be registered until activated. This is not an official tuition assessment.</p>
          {confirmedRegistration && <>
            <div className="section-header" style={{ marginTop: 22 }}><div>
              <h2>Registered Subjects (Demonstration)</h2>
              <p>Preserved from the Registrar confirmed registration snapshot. Reference: {confirmedRegistration.reference}.</p>
            </div></div>
            <DataTable rowKey="code" rows={confirmedRegistration.subjects} columns={[
              { key: "code", label: "Subject Code", render: (item) => displaySubjectCode(item.code) },
              { key: "name", label: "Subject Name", render: (item) => displaySubjectCode(item.name) },
              { key: "units", label: "Registered Units" },
              { key: "section", label: "Registered Section" },
              { key: "meetings", label: "Registered Class Schedule", render: (item) => <ScheduleText meetings={item.meetings} /> },
            ]} />
          </>}
          <div className="action-row" style={{ marginTop: 18 }}>
            {data.canPrepare && typeof prepareEnrollmentAction === "function" &&
              <Button onClick={() => runPlacementAction(prepareEnrollmentAction)} disabled={isPending}>
                Prepare Enrollment</Button>}
            {data.canReopen && typeof reopenEnrollmentAction === "function" &&
              <Button variant="secondary" onClick={() => runPlacementAction(reopenEnrollmentAction)} disabled={isPending}>
                Reopen Returned Enrollment</Button>}
            {canReview ? <Button onClick={() => setReviewOpen(true)} disabled={isPending}>Review Enrollment</Button> : null}
            {confirmedRegistration ? <Button onClick={openDemonstrationCor} disabled={isPending}>View Demonstration Registration</Button> : null}
          </div>
          {message && <div className="notice" role="status" style={{ marginTop: 12 }}>{message}</div>}

        </> : <>
          <div className="section-header"><div><h2>Enrollment History</h2><p>Read only enrollment transactions associated with this authenticated student.</p></div></div>
          <div className="toolbar">
            <SearchControl value={search} onChange={setSearch} placeholder="Search academic year or block" />
            <FilterControl label="Academic Year" value={yearFilter} onChange={setYearFilter}
              options={[{value:"ALL",label:"All years"}, ...[...new Set(history.map((h)=>String(h.academicYear)).filter(Boolean))].map((v)=>({value:v,label:v}))]} />
            <FilterControl label="Semester" value={semesterFilter} onChange={setSemesterFilter}
              options={[{value:"ALL",label:"All semesters"}, ...[...new Set(history.map((h)=>String(h.semester)).filter(Boolean))].map((v)=>({value:v,label:v}))]} />
            <FilterControl label="Status" value={statusFilter} onChange={setStatusFilter}
              options={[{ value: "ALL", label: "All statuses" }, ...[...new Set(history.map((h) => h.status))].map((v) => ({ value: v, label: enrollmentReviewLabel(v) }))]} />
          </div>
          {visibleHistory.length ? <DataTable rowKey="id" rows={visibleHistory} columns={[
            { key: "academicYear", label: "Academic Year" },
            { key: "semester", label: "Semester" },
            { key: "program", label: "Program and Block", render: (r) => `${r.program} · ${r.block || "Unassigned"}` },
            { key: "registeredUnits", label: "Registered Units", render: (row) => row.registeredUnits
              ?? (row.status === "CONFIRMED_SIMULATION" ? "Not verified" : "Not registered") },
            { key: "status", label: "Review Status", render: (r) => <StatusBadge value={r.status}
              label={r.status === simulationStatus ? displayedReviewStatus : enrollmentReviewLabel(r.status)} /> },
            { key: "actions", label: "Actions", render: (r) => <TableActionButton onClick={() => setDetail({ type: "history", value: r })}>View Details</TableActionButton> },
          ]} /> : <div className="empty-state"><strong>No enrollment transactions found.</strong><p>Your generated academic placement is separate from an enrollment submission.</p></div>}
          {confirmedRegistration ? <Button variant="secondary" onClick={openDemonstrationCor} disabled={isPending}>View Demonstration Registration</Button> : null}
          {message && <div className="notice" role="status">{message}</div>}
        </>}
      </InternalTabs>
    </div>

    <Modal open={Boolean(detail)} title={detail?.type === "history" ? "Enrollment Review Details" : "Subject Details"}
      onClose={() => setDetail(null)} footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
      {detail?.type === "subject" ? <div className="detail-list">
        <div className="detail-row"><span>Subject</span><strong>{displaySubjectCode(detail.value.code)} · {displaySubjectCode(detail.value.name)}</strong></div>
        <div className="detail-row"><span>Units</span><strong>{detail.value.units}</strong></div>
        <div className="detail-row"><span>Estimated Subject Fee</span><strong>{unitFeeFor(detail.value)}</strong></div>
        <div className="detail-row"><span>Proposed Section</span><strong>{detail.value.section || "Not assigned"}</strong></div>
        <div className="detail-row"><span>Section Status</span><strong>{detail.value.sectionStatus || "Unavailable"}</strong></div>
        <div className="detail-row"><span>Eligibility</span><StatusBadge value={detail.value.eligibility} /></div>
        <p>{detail.value.reason || "No additional academic restriction was supplied."}</p>
        {(detail.value.meetings || []).map((meeting, i) => <div className="info-item" key={i}>
          <span>{meeting.component || "Class Meeting"}</span>
          <strong>{formatMeetingSchedule(meeting)}</strong>
        </div>)}
      </div> : detail?.value ? <div className="info-grid">
        <Field label="Term" value={`${detail.value.academicYear} · ${detail.value.semester}`} />
        <Field label="Program and Block" value={`${detail.value.program} · ${detail.value.block}`} />
        <Field label="Submitted At" value={detail.value.submittedAt ? new Date(detail.value.submittedAt).toLocaleString() : "Not submitted"} />
        <Field label="Review Status" value={detail.value.status === simulationStatus
          ? displayedReviewStatus : enrollmentReviewLabel(detail.value.status)} />
      </div> : null}
    </Modal>

    <Modal open={reviewOpen && canReview} title="Review and Submit Enrollment"
      onClose={() => { if (!isPending) setReviewOpen(false); }} footer={<>
        <Button variant="secondary" disabled={isPending} onClick={() => setReviewOpen(false)}>Cancel</Button>
        <Button disabled={isPending} onClick={handleSubmit}>{isPending ? "Submitting..." : "Confirm Submission"}</Button>
      </>}>
      <p>Confirm that you reviewed all {selectedCount} eligible subjects and {data.proposedUnits} proposed units for {data.term.label}.</p>
      <p>Submitting sends this record for Registrar review. Submission does not confirm enrollment.</p>
      {message && <p role="alert">{message}</p>}
    </Modal>

    <CorDocumentPreview open={Boolean(cor)}
      onClose={() => setCor(null)}
      documentUrl={cor ? demonstrationCorUrl || "/api/student/project-cor" : null}
      project />
  </>;
}
