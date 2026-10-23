"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Card, DataTable, FilterControl, InternalTabs, Modal, PageHeader, SearchControl, StatusBadge, TableActionButton } from "@/components/ui/PortalUI";
import { submitPreparedProjectEnrollment, getConfirmedProjectDemonstrationCor } from "@/features/students/student-portal-actions";

const TABS = [
  { value: "current", label: "Current Enrollment" },
  { value: "history", label: "Enrollment History" },
];

function Field({ label, value }) {
  return <div className="info-item"><span>{label}</span><strong>{value ?? "Not available"}</strong></div>;
}

function ScheduleText({ meetings }) {
  if (!meetings?.length) return "Awaiting timetable";
  return <span>{meetings.map((m) => `${m.day} ${String(m.start || "").slice(0, 5)} to ${String(m.end || "").slice(0, 5)}`).join("; ")}</span>;
}

function SampleNotice() {
  return <div className="notice" role="note">
    <strong>PROJECT_ONLY classroom demonstration.</strong> The curriculum, grades, timetable, admission context, and enrollment simulation are generated project records. They are not institutionally verified. Registrar confirmation of a simulation does not create official university enrollment.
  </div>;
}

export default function StudentEnrollmentWorkspace({ data }) {
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

  const history = useMemo(() => data.kind === "ready" && data.simulation ? [{
    id: data.simulation.id,
    academicYear: data.term.academicYear,
    semester: data.term.semester,
    program: data.student.program,
    block: data.homeBlock,
    units: data.proposedUnits,
    status: data.simulation.status,
    submittedAt: data.simulation.submittedAt,
  }] : [], [data]);
  const visibleHistory = history.filter((item) =>
    `${item.academicYear} ${item.semester} ${item.program} ${item.block}`.toLowerCase().includes(search.toLowerCase()) &&
    (yearFilter === "ALL" || String(item.academicYear) === yearFilter) &&
    (semesterFilter === "ALL" || String(item.semester) === semesterFilter) &&
    (statusFilter === "ALL" || statusFilter === item.status));

  function handleSubmit() {
    setMessage("");
    startTransition(async () => {
      try {
        await submitPreparedProjectEnrollment();
        setReviewOpen(false);
        setMessage("Your PROJECT_ONLY enrollment was submitted for Registrar simulation review. Your official university enrollment remains unconfirmed.");
        window.location.reload();
      } catch (error) {
        setMessage(error?.message || "Submission failed. Please review your enrollment details.");
      }
    });
  }

  function openDemonstrationCor() {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await getConfirmedProjectDemonstrationCor();
        setCor(result);
      } catch (error) {
        setMessage(error?.message || "The registration demonstration is unavailable.");
      }
    });
  }

  if (data.kind !== "ready") {
    return <><PageHeader title="Enrollment" description="Current Enrollment and Enrollment History" />
      <Card><div className="notice" role="alert">Your authenticated enrollment data could not be verified. Please sign in again or contact the System Administrator.</div></Card></>;
  }

  const simulationStatus = data.simulation?.status || "NOT_STARTED";
  const locked = ["SUBMITTED", "VALIDATED", "CONFIRMED_SIMULATION"].includes(simulationStatus);
  const isConfirmedSimulation = simulationStatus === "CONFIRMED_SIMULATION";
  const selectedCount = data.proposedSubjects.length;
  const eligibility = data.canSubmit ? "ELIGIBLE" : "NOT_ELIGIBLE";

  return <>
    <PageHeader title="Enrollment" description="Review your prepared subjects, submit for review, and follow your enrollment progress." />
    <SampleNotice />
    <div style={{ marginTop: 16 }}>
      <InternalTabs items={TABS} selected={activeTab} onSelect={setActiveTab} label="Enrollment sections" panelCard>
        {activeTab === "current" ? <>
          <div className="section-header"><div>
            <h2>Current Enrollment</h2>
            <p>Automatically prepared from your linked curriculum, project academic history, and validated block timetable.</p>
          </div><StatusBadge value={simulationStatus} label={simulationStatus.replaceAll("_", " ") + " · Project Simulation"} /></div>

          <div className="info-grid" style={{ marginTop: 16 }}>
            <Field label="Student" value={`${data.student.name} (${data.student.number})`} />
            <Field label="Program and Curriculum" value={`${data.student.program} · ${data.student.curriculum}`} />
            <Field label="Academic Term" value={data.term.label} />
            <Field label="Proposed Home Block" value={data.homeBlock || "No validated block"} />
            <Field label="Prepared Eligible Subjects" value={String(selectedCount)} />
            <Field label="Proposed Units" value={String(data.proposedUnits)} />
            <Field label="Academic Classification" value={<StatusBadge value={data.student.classification || "NOT_VERIFIED"} />} />
            <Field label="Current Eligibility" value={<StatusBadge value={eligibility} />} />
          </div>

          <div className="notice" style={{ marginTop: 16 }}>
            <strong>Enrollment period:</strong> {data.term.enrollmentStart || "Not configured"} to {data.term.enrollmentEnd || "Not configured"}.
            {data.term.windowOpen ? " Currently open." : " Currently closed or unavailable."}
          </div>
          {data.blockingReasons.map((reason) => <div key={reason} className="notice" role="status" style={{ marginTop: 10 }}>{reason}</div>)}
          {locked && <div className="notice" role="status" style={{ marginTop: 12 }}>
            Your submitted project enrollment is read only. The Registrar controls validation, return for correction, and simulated confirmation.
          </div>}
          {simulationStatus === "RETURNED" && <div className="notice warning" role="status" style={{ marginTop: 12 }}>
            <strong>Returned by Registrar for correction.</strong>
            <p>{data.simulation?.correctionReason || "Please review your prepared project enrollment and contact the Registrar for the recorded return reason."}</p>
            <p>Make permitted corrections before resubmission. The current project simulation can be resubmitted when the Registrar reopens a valid enrollment period.</p>
          </div>}

          <div className="section-header" style={{ marginTop: 22 }}><div>
            <h2>Prepared Subject Registration</h2>
            <p>Subjects with eligible status, a matching home block class section, and a validated timetable are prepared automatically. Other curriculum requirements remain visible with their restrictions.</p>
          </div></div>
          <DataTable rowKey="code" rows={data.subjects} columns={[
            { key: "code", label: "Subject Code" },
            { key: "name", label: "Subject Name" },
            { key: "units", label: "Units" },
            { key: "section", label: "Assigned Section", render: (item) => item.section || "Not assigned" },
            { key: "meetings", label: "Class Schedule", render: (item) => <ScheduleText meetings={item.meetings} /> },
            { key: "eligibility", label: "Eligibility", render: (item) => <StatusBadge value={item.eligibility} /> },
            { key: "action", label: "Action", render: (item) =>
              <TableActionButton onClick={() => setDetail({ type: "subject", value: item })}>View Details</TableActionButton> },
          ]} />
          <div className="action-row" style={{ marginTop: 18 }}>
            {data.canSubmit ? <Button onClick={() => setReviewOpen(true)} disabled={isPending}>Review Enrollment</Button> : null}
            {isConfirmedSimulation ? <Button onClick={openDemonstrationCor} disabled={isPending}>View Demonstration Registration</Button> : null}
          </div>
          {message && <div className="notice" role="status" style={{ marginTop: 12 }}>{message}</div>}
          <p style={{ marginTop: 10 }}>Schedule and block selections remain proposed during student review. Only a trusted Registrar may finalize a project simulation. Official COR and class schedules require a separate officially confirmed enrollment.</p>
        </> : <>
          <div className="section-header"><div><h2>Enrollment History</h2><p>Read only enrollment transactions associated with this authenticated student.</p></div></div>
          <div className="toolbar">
            <SearchControl value={search} onChange={setSearch} placeholder="Search academic year or block" />
            <FilterControl label="Academic Year" value={yearFilter} onChange={setYearFilter}
              options={[{value:"ALL",label:"All years"}, ...[...new Set(history.map((h)=>String(h.academicYear)).filter(Boolean))].map((v)=>({value:v,label:v}))]} />
            <FilterControl label="Semester" value={semesterFilter} onChange={setSemesterFilter}
              options={[{value:"ALL",label:"All semesters"}, ...[...new Set(history.map((h)=>String(h.semester)).filter(Boolean))].map((v)=>({value:v,label:v}))]} />
            <FilterControl label="Status" value={statusFilter} onChange={setStatusFilter}
              options={[{ value: "ALL", label: "All statuses" }, ...[...new Set(history.map((h) => h.status))].map((v) => ({ value: v, label: v }))]} />
          </div>
          {visibleHistory.length ? <DataTable rowKey="id" rows={visibleHistory} columns={[
            { key: "academicYear", label: "Academic Year" },
            { key: "semester", label: "Semester" },
            { key: "program", label: "Program and Block", render: (r) => `${r.program} · ${r.block || "Unassigned"}` },
            { key: "units", label: "Proposed Units" },
            { key: "status", label: "Project Simulation Status", render: (r) => <StatusBadge value={r.status} /> },
            { key: "actions", label: "Actions", render: (r) => <TableActionButton onClick={() => setDetail({ type: "history", value: r })}>View Details</TableActionButton> },
          ]} /> : <div className="empty-state"><strong>No enrollment transactions found.</strong><p>Your generated academic placement is separate from an enrollment submission.</p></div>}
          {isConfirmedSimulation ? <Button variant="secondary" onClick={openDemonstrationCor} disabled={isPending}>View Demonstration Registration</Button> : null}
          {message && <div className="notice" role="status">{message}</div>}
        </>}
      </InternalTabs>
    </div>

    <Modal open={Boolean(detail)} title={detail?.type === "history" ? "Project Enrollment Details" : "Subject Details"}
      onClose={() => setDetail(null)} footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
      {detail?.type === "subject" ? <div className="detail-list">
        <div className="detail-row"><span>Subject</span><strong>{detail.value.code} · {detail.value.name}</strong></div>
        <div className="detail-row"><span>Units</span><strong>{detail.value.units}</strong></div>
        <div className="detail-row"><span>Proposed Section</span><strong>{detail.value.section || "Not assigned"}</strong></div>
        <div className="detail-row"><span>Eligibility</span><StatusBadge value={detail.value.eligibility} /></div>
        <p>{detail.value.reason || "No additional academic restriction was supplied."}</p>
        {(detail.value.meetings || []).map((meeting, i) => <div className="info-item" key={i}>
          <span>{meeting.component || "Class Meeting"}</span>
          <strong>{meeting.day} {meeting.start} to {meeting.end} · {meeting.room} · {meeting.instructor}</strong>
        </div>)}
      </div> : detail?.value ? <div className="info-grid">
        <Field label="Term" value={`${detail.value.academicYear} · ${detail.value.semester}`} />
        <Field label="Program and Block" value={`${detail.value.program} · ${detail.value.block}`} />
        <Field label="Submitted At" value={detail.value.submittedAt ? new Date(detail.value.submittedAt).toLocaleString() : "Not submitted"} />
        <Field label="Project Status" value={detail.value.status.replaceAll("_", " ")} />
      </div> : null}
    </Modal>

    <Modal open={reviewOpen} title="Review and Submit Project Enrollment"
      onClose={() => { if (!isPending) setReviewOpen(false); }} footer={<>
        <Button variant="secondary" disabled={isPending} onClick={() => setReviewOpen(false)}>Cancel</Button>
        <Button disabled={isPending} onClick={handleSubmit}>{isPending ? "Submitting..." : "Confirm Submission"}</Button>
      </>}>
      <p>Confirm that you reviewed all {selectedCount} eligible subjects and {data.proposedUnits} proposed units for {data.term.label}.</p>
      <p>Your submission creates a PROJECT_ONLY classroom enrollment simulation for Registrar review. It does not confirm official registration.</p>
      {message && <p role="alert">{message}</p>}
    </Modal>

    <Modal open={Boolean(cor)} title="Enrollment Registration Demonstration"
      onClose={() => setCor(null)} footer={<>
        <Button variant="secondary" onClick={() => setCor(null)}>Close</Button>
        <Button onClick={() => window.print()}>Print Demonstration</Button>
      </>}>
      {cor ? <div className="detail-list">
        <div className="notice"><strong>FICTIONAL CLASSROOM DEMONSTRATION ONLY. NOT AN OFFICIAL CERTIFICATE OF REGISTRATION.</strong></div>
        <div className="detail-row"><span>Student</span><strong>{cor.student?.student_name}</strong></div>
        <div className="detail-row"><span>Student Number</span><strong>{cor.student?.student_number}</strong></div>
        <div className="detail-row"><span>Program and Term</span><strong>{cor.student?.program_code} · {cor.student?.term_id}</strong></div>
        <div className="detail-row"><span>Registrar Simulation</span><strong>{cor.registration_status}</strong></div>
      </div> : null}
    </Modal>
  </>;
}
