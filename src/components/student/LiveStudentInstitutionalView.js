"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CorDocumentPreview from "@/components/cor/CorDocumentPreview";
import {
  Button, Card, DataTable, EmptyState, FilterControl, InternalTabs, Modal,
  PageHeader, SearchControl, StatusBadge, TablePagination,
} from "@/components/ui/PortalUI";
import { formatMeetingSchedule, WEEKDAY_NAMES } from "@/features/students/class-meeting-format.mjs";
import { formatStudentWelcomeDetails } from "@/utils/student-welcome-format.mjs";
import {
  getInstitutionalAcademicHistory, getInstitutionalNextAction,
  getInstitutionalSchedule, isOfficiallyConfirmed,
  getAuthorizedDemonstration, getDemonstrationSubjects, getDemonstrationSchedule,
  getDemonstrationFee, getDemonstrationNextAction, isConfirmedDemonstrationRegistration,
  hasUnavailableDemonstration,
} from "./live-institutional-view-model.mjs";
import styles from "./live-student-institutional.module.css";

const PAGE_SIZE = 15;
const PAGE_DESCRIPTIONS = Object.freeze({
  Dashboard: "Your institutional academic identity, enrollment status, and next required action.",
  Enrollment: "Review verified academic preparation and track Registrar enrollment confirmation.",
  "Academic Records": "View published academic history, approved credits, and curriculum progress.",
  "Class Schedule": "View verified proposed class meetings or your Registrar confirmed timetable.",
});

function valueOrFallback(value, fallback = "Not recorded") {
  return typeof value === "string" && value.trim() || typeof value === "number" && Number.isFinite(value)
    ? value : fallback;
}

function units(value) {
  const number = Number(value);
  return value != null && Number.isFinite(number) ? number.toLocaleString("en-PH") : "Not recorded";
}

function displayDate(value) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Not recorded" :
    new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(parsed);
}

function StudentSummary({ data }) {
  const curriculum = data.student?.curriculum;
  const isFictionalReference = data.student?.curriculumProvenance === "PROJECT_ONLY_FICTIONAL" ||
    String(curriculum || "").startsWith("P8");
  const needsVerification = data.academic?.isOfficialCurriculum !== true;
  return (
    <div className="summary-strip">
      <span>Student Number: <strong>{valueOrFallback(data.student?.number)}</strong></span>
      <span>Program: <strong>{valueOrFallback(data.student?.program)}</strong></span>
      {curriculum && <span>{isFictionalReference ? "Reference Curriculum" : "Curriculum"}:
        <strong> {curriculum}{isFictionalReference
          ? " (Phase 8 fictional; not institutionally approved)" :
          needsVerification ? " (institutional validation pending)" : ""}</strong></span>}
      {data.student?.yearLevel && <span>Year: <strong>{data.student.yearLevel}</strong></span>}
      <span>Academic Term: <strong>{valueOrFallback(data.term?.label, "Not published")}</strong></span>
    </div>
  );
}

function EnrollmentStatus({ enrollment }) {
  return enrollment?.status
    ? <StatusBadge value={enrollment.status}
      label={enrollment.status === "CONFIRMED" && !isOfficiallyConfirmed(enrollment)
        ? "Confirmation under verification" : undefined} />
    : <span>Not yet submitted</span>;
}

function Notice({ children, warning = false }) {
  return <div className={`notice${warning ? " warning" : ""}`} role="note">{children}</div>;
}

const DEMO_LABEL = "Phase 8 Project Demonstration, NOT Official Institutional Enrollment";

function demoMoney(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value)
    : "Estimate unavailable";
}

function DemoBoundaryNotice({ demonstration }) {
  return <div className={styles.demoNotice} role="note">
    <strong>{DEMO_LABEL}</strong>
    <p>The Phase 8 fictional academic dataset is provided for classroom practice using your existing
      Admissions account. Project blocks, subjects, schedules, payments and registration status
      are separate from official institutional academic records and the official COR.</p>
    {demonstration.kind === "blocked" && <p>Some project requirements are still pending.
      The available steps below remain subject to server validation.</p>}
  </div>;
}

function DemonstrationDashboard({ demo }) {
  const subjects = getDemonstrationSubjects(demo);
  const fee = getDemonstrationFee(demo);
  const schedule = getDemonstrationSchedule(demo);
  const next = getDemonstrationNextAction(demo);
  const confirmed = isConfirmedDemonstrationRegistration(demo);
  return <Card className={`section-card ${styles.demonstrationCard}`}>
    <div className="section-header">
      <div><h2>Phase 8 Demonstration Overview</h2>
        <p>Published fictional curriculum and separate project registration</p></div>
      <Link className="section-link" href="/student/enrollment">Open Demonstration Enrollment</Link>
    </div>
    <div className="info-grid">
      <div className="info-item"><span>Project Curriculum</span>
        <strong>{valueOrFallback(demo.curriculum?.code, "Not assigned")}</strong></div>
      <div className="info-item"><span>Proposed Fictional Block</span>
        <strong>{valueOrFallback(demo.homeBlock?.code, "Not assigned")}</strong></div>
      <div className="info-item"><span>Demonstration Status</span>
        <strong><StatusBadge value={demo.status || "UNASSIGNED"}
          label={confirmed ? "Confirmed (demo only)" : demo.status === "CONFIRMED_SIMULATION"
            ? "Confirmation details unverified" : undefined} /></strong></div>
      <div className="info-item"><span>Proposed Subjects</span><strong>{subjects.length}</strong></div>
      <div className="info-item"><span>Proposed Units</span>
        <strong>{Number.isFinite(demo.feeEstimate?.totalUnits) ? units(demo.feeEstimate.totalUnits) :
          subjects.length && subjects.every((subject) => typeof subject.units === "number")
            ? units(subjects.reduce((sum, subject) => sum + subject.units, 0)) : "Not verified"}</strong></div>
      <div className="info-item"><span>Fictional Tuition Estimate</span>
        <strong>{fee.available ? demoMoney(fee.amount) : "Rate not verified"}</strong></div>
    </div>
    <div className={styles.detailSpacing}><Notice warning>
      {schedule.kind === "registered"
        ? "A Registrar confirmed project registration snapshot is available. This remains a classroom simulation."
        : schedule.kind === "proposed"
          ? "Published fictional meetings are proposed only. They are not enrolled classes."
          : "No verified project registration timetable is available for display."}
    </Notice></div>
    <div className={styles.actionFooter}>
      <Link className="portal-button portal-button-primary" href={next.href}>{next.label}</Link>
      <Link className="portal-button portal-button-secondary" href="/student/class-schedule">
        View Project Schedule</Link>
    </div>
  </Card>;
}

function DemonstrationEnrollment({ demo, prepareDemonstrationAction, submitDemonstrationAction,
  reopenDemonstrationAction }) {
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [corOpen, setCorOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const subjects = getDemonstrationSubjects(demo);
  const confirmed = isConfirmedDemonstrationRegistration(demo);
  const fee = getDemonstrationFee(demo);
  const savedRegistration = confirmed ? demo.registration || demo.confirmedRegistration : null;
  const canPrepare = demo.status !== "CONFIRMED_SIMULATION" && demo.canPrepare === true &&
    typeof prepareDemonstrationAction === "function";
  const canSubmit = demo.status !== "CONFIRMED_SIMULATION" &&
    demo.canSubmit === true && !confirmed &&
    typeof submitDemonstrationAction === "function";
  const canReopen = demo.status !== "CONFIRMED_SIMULATION" &&
    demo.canReopen === true && !confirmed &&
    typeof reopenDemonstrationAction === "function";
  const blockers = Array.isArray(demo.blockingReasons) ? demo.blockingReasons : [];
  const feeBySubject = new Map(fee.subjects.map((subject) =>
    [subject.code || subject.subject_code, subject.estimatedFee]));
  const totalUnits = Number.isFinite(demo.feeEstimate?.totalUnits)
    ? demo.feeEstimate.totalUnits : null;
  const validId = savedRegistration?.id || demo.id;
  const canViewCor = confirmed && typeof validId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(validId);

  function runAction(action) {
    setFeedback("");
    startTransition(async () => {
      try {
        const result = await action();
        setReviewOpen(false);
        setFeedback(result?.message || (result?.ok === true
          ? "The demonstration enrollment has been updated."
          : "The demonstration action could not be completed."));
        if (result?.ok === true) router.refresh();
      } catch {
        setFeedback("Your demonstration request could not be completed. Please try again or contact the Registrar.");
      }
    });
  }
  return <Card className={`section-card ${styles.demonstrationCard}`}>
    <div className="section-header"><div>
      <h2>Phase 8 Demonstration Enrollment</h2>
      <p>Prepared fictional subjects, section placement, and Registrar project review</p>
    </div><StatusBadge value={demo.status || "UNASSIGNED"}
      label={confirmed ? "Confirmed (demo only)" : demo.status === "CONFIRMED_SIMULATION"
        ? "Confirmation details unverified" : undefined} /></div>
    <div className="info-grid">
      <div className="info-item"><span>Project Curriculum</span>
        <strong>{valueOrFallback(demo.curriculum?.code, "Not assigned")}</strong></div>
      <div className="info-item"><span>Demo Academic Term</span>
        <strong>{valueOrFallback(demo.term?.label, "Not recorded")}</strong></div>
      <div className="info-item"><span>Fictional Home Block</span>
        <strong>{valueOrFallback(demo.homeBlock?.code, "Not assigned")}</strong></div>
      <div className="info-item"><span>Proposed Subjects</span><strong>{subjects.length}</strong></div>
      <div className="info-item"><span>Proposed Units</span>
        <strong>{totalUnits == null ? "Not verified" : units(totalUnits)}</strong></div>
      <div className="info-item"><span>Demo Tuition Estimate</span>
        <strong>{fee.available ? demoMoney(fee.amount) : "Unverified project rate"}</strong></div>
    </div>
    {blockers.length > 0 && <div className={styles.detailSpacing}>
      {blockers.map((reason, index) => <Notice warning key={index}>{reason}</Notice>)}
    </div>}
    {demo.status === "RETURNED" && <div className={styles.detailSpacing}><Notice warning>
      The Registrar returned this demonstration for correction. Review the affected sections
      and resubmit only when the authorized project action is available.
    </Notice></div>}
    {demo.status === "CONFIRMED_SIMULATION" && !confirmed &&
      <div className={styles.detailSpacing}><Notice warning>
        A project confirmation was recorded, but the complete registration snapshot has not
        been verified. No registered timetable or demonstration certificate can be shown.
      </Notice></div>}
    <div className={styles.demoSectionHeading}><h3>Prepared Fictional Subjects</h3>
      <p>Published Phase 8 classes and fees are for demonstration only.</p></div>
    <DataTable rows={subjects} rowKey="code"
      emptyMessage="No Phase 8 demonstration subjects have been prepared."
      onRowClick={setDetail} rowTitle="View fictional subject and section details"
      getRowAriaLabel={(row) => `View demonstration subject ${row.code}`}
      columns={[
        { key: "code", label: "Subject Code" },
        { key: "name", label: "Subject Name" },
        { key: "units", label: "Units", render: (item) => units(item.units) },
        { key: "estimatedFee", label: "Estimated Subject Fee", render: (item) =>
          feeBySubject.has(item.code) ? demoMoney(feeBySubject.get(item.code)) :
            typeof item.feeEstimate === "number" && fee.available
              ? demoMoney(item.feeEstimate) : "Unavailable" },
        { key: "section", label: "Fictional Section", render: (item) =>
          valueOrFallback(item.section, "Not assigned") },
        { key: "sectionStatus", label: "Section Status", render: (item) =>
          item.sectionStatus ? <StatusBadge value={item.sectionStatus} /> : "Not recorded" },
        { key: "eligibility", label: "Project Eligibility", render: (item) =>
          <StatusBadge value={item.eligibility} /> },
      ]} />
    {confirmed && savedRegistration && <>
      <div className={styles.demoSectionHeading}><h3>Confirmed Project Registration</h3>
        <p>Preserved fictional registered subjects from the Registrar verified project snapshot</p></div>
      <div className="summary-strip">
        <span>Demonstration Reference: <strong>{savedRegistration.reference}</strong></span>
        <span>Project Registered Units: <strong>{units(savedRegistration.units)}</strong></span>
        <span>Project Confirmation: <strong>{displayDate(savedRegistration.confirmedAt)}</strong></span>
      </div>
    </>}
    <div className={styles.actionFooter}>
      {canPrepare && <Button disabled={isPending} onClick={() => runAction(prepareDemonstrationAction)}>
        {isPending ? "Preparing..." : "Auto Assign Project Block"}</Button>}
      {canSubmit && <Button disabled={isPending} onClick={() => setReviewOpen(true)}>
        Submit Demonstration Enrollment</Button>}
      {canReopen && <Button disabled={isPending} variant="secondary"
        onClick={() => runAction(reopenDemonstrationAction)}>
        {isPending ? "Reopening..." : "Reopen Returned Demonstration"}</Button>}
      {canViewCor && <Button variant="secondary" onClick={() => setCorOpen(true)}>
        View Demonstration Registration PDF</Button>}
    </div>
    <p className={styles.softText}>
      Any displayed amount is a fictional tuition estimate, not an institutional assessment,
      billing notice, or proof of payment. No official COR is issued for this project.
    </p>
    {feedback && <p className={styles.feedback} role="status">{feedback}</p>}
    <Modal open={Boolean(detail)} onClose={() => setDetail(null)}
      title={detail ? `Demonstration · ${detail.code} · ${detail.name}` : "Fictional subject"}
      footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
      {detail && <>
        <div className="info-grid">
          <div className="info-item"><span>Units</span><strong>{units(detail.units)}</strong></div>
          <div className="info-item"><span>Project Section</span>
            <strong>{valueOrFallback(detail.section, "Not assigned")}</strong></div>
          <div className="info-item"><span>Project Eligibility</span>
            <strong><StatusBadge value={detail.eligibility} /></strong></div>
        </div>
        {detail.reason && <div className={styles.detailSpacing}><Notice warning>{detail.reason}</Notice></div>}
        <div className={styles.detailSpacing}><h3>Fictional Class Meetings</h3>
          {detail.meetings.length ? <div className="list-stack">{detail.meetings.map((meeting, index) =>
            <div className="list-item" key={index}>{formatMeetingSchedule(meeting)}</div>)}</div> :
            <EmptyState title="No published fictional meetings" />}
        </div>
      </>}
    </Modal>
    <Modal open={reviewOpen && canSubmit} onClose={() => { if (!isPending) setReviewOpen(false); }}
      title="Submit Project Demonstration Enrollment"
      footer={<><Button variant="secondary" disabled={isPending}
        onClick={() => setReviewOpen(false)}>Cancel</Button>
        <Button disabled={isPending || !canSubmit} onClick={() => runAction(submitDemonstrationAction)}>
          {isPending ? "Submitting..." : "Confirm Project Submission"}</Button></>}>
      <p>Review the {subjects.length} prepared fictional subjects for {demo.term?.label || "this term"}.
        The project Registrar must review the submission. Confirmation is a classroom demonstration
        and will never establish official university enrollment.</p>
    </Modal>
    <CorDocumentPreview open={Boolean(corOpen && canViewCor)}
      onClose={() => setCorOpen(false)}
      documentUrl={canViewCor
        ? `/api/student/admissions-demo-cor/${encodeURIComponent(validId)}` : null}
      project />
  </Card>;
}

function DemonstrationCurriculum({ demo }) {
  const subjects = getDemonstrationSubjects(demo);
  const totalUnits = subjects.length > 0 && subjects.every((item) =>
    typeof item.units === "number" && Number.isFinite(item.units))
    ? subjects.reduce((sum, item) => sum + item.units, 0) : null;
  return <Card className={`section-card ${styles.demonstrationCard}`}>
    <div className="section-header"><div>
      <h2>Phase 8 Fictional Curriculum</h2>
      <p>Demonstration subject plan for {valueOrFallback(demo.curriculum?.code, "the project curriculum")}</p>
    </div><Link className="section-link" href="/student/enrollment">View Project Enrollment</Link></div>
    <div className="summary-strip">
      <span>Project Term: <strong>{valueOrFallback(demo.term?.label)}</strong></span>
      <span>Fictional Subjects: <strong>{subjects.length}</strong></span>
      <span>Curriculum Units in View: <strong>{totalUnits == null ? "Not verified" : units(totalUnits)}</strong></span>
    </div>
    <div className={styles.detailSpacing}>
      <DataTable rows={subjects} rowKey="code"
        emptyMessage="No fictional curriculum subjects are prepared for this student."
        columns={[
          { key: "code", label: "Subject Code" },
          { key: "name", label: "Subject" },
          { key: "units", label: "Units", render: (row) => units(row.units) },
          { key: "eligibility", label: "Demo Eligibility", render: (row) =>
            <StatusBadge value={row.eligibility} /> },
          { key: "section", label: "Fictional Section", render: (row) =>
            valueOrFallback(row.section, "Not assigned") },
          { key: "sectionStatus", label: "Section Status", render: (row) =>
            row.sectionStatus ? <StatusBadge value={row.sectionStatus} /> : "Not recorded" },
        ]} />
    </div>
    <p className={styles.softText}>This classroom curriculum is not an official grade,
      transfer credit, prerequisite clearance, or institutional curriculum assignment.
      Published institutional results appear separately below.</p>
  </Card>;
}

function DemonstrationSchedule({ demo }) {
  const [tab, setTab] = useState("weekly");
  const [day, setDay] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [detail, setDetail] = useState(null);
  const schedule = useMemo(() => getDemonstrationSchedule(demo), [demo]);
  const days = WEEKDAY_NAMES.filter((value) => schedule.meetings.some((row) => row.day === value));
  const subjects = [...new Set(schedule.meetings.map((row) => row.code))];
  const filtered = schedule.meetings.filter((row) =>
    (day === "ALL" || row.day === day) && (subject === "ALL" || row.code === subject));
  const visibleDays = day === "ALL" ? days : days.filter((value) => value === day);
  const starts = [...new Map(filtered.map((row) => [row.start, row.rawStart])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])).map(([display]) => display);
  const registered = schedule.kind === "registered";
  return <Card className={`section-card ${styles.demonstrationCard}`}>
    <div className="section-header"><div><h2>Phase 8 Project Class Schedule</h2>
      <p>Verified published fictional meetings from your project block</p></div>
      <Link className="section-link" href="/student/enrollment">Project Enrollment</Link>
    </div>
    {schedule.kind === "awaiting" ? <EmptyState
      title="Project timetable awaiting verified preparation"
      description={demo.status === "CONFIRMED_SIMULATION"
        ? "Project confirmation exists without a complete verified registration snapshot. Contact the Registrar."
        : "The fictional block and meeting assignments must be prepared before a project timetable is displayed."} /> :
      <>
        <div className={styles.scheduleSummary}>
          <span>Demonstration Term: <strong>{valueOrFallback(schedule.term)}</strong></span>
          <span>Fictional Block: <strong>{valueOrFallback(demo.homeBlock?.code)}</strong></span>
          <span>Project Status: <StatusBadge
            value={registered ? "CONFIRMED_SIMULATION" : "PROPOSED"}
            label={registered ? "Registered (demo only)" : "Proposed (not registered)"} /></span>
          {registered && schedule.reference &&
            <span>Project Reference: <strong>{schedule.reference}</strong></span>}
        </div>
        <div className={styles.detailSpacing}>
          <Notice warning>
            {registered
              ? "These classes are preserved from a confirmed fictional demonstration registration. This timetable is not an official university schedule."
              : "These classes are fictional proposed meetings. They remain unregistered until project Registrar confirmation and do not constitute official enrollment."}
          </Notice>
        </div>
        <div className={styles.detailSpacing}>
          <InternalTabs items={[{ value: "weekly", label: "Weekly Schedule" },
            { value: "list", label: "List View" }]}
            selected={tab} onSelect={setTab} label="Project demonstration schedule views" panelCard>
            <div className="toolbar">
              <FilterControl label="Day" value={day} onChange={setDay}
                options={[{ value: "ALL", label: "All days" },
                  ...days.map((value) => ({ value, label: value }))]} />
              <FilterControl label="Subject" value={subject} onChange={setSubject}
                options={[{ value: "ALL", label: "All subjects" },
                  ...subjects.map((value) => ({ value, label: value }))]} />
              <Button variant="secondary" onClick={() => window.print()}>Print Project Schedule</Button>
            </div>
            {filtered.length === 0 ? <EmptyState title="No fictional classes match these filters." /> :
              tab === "list" ? <DataTable rows={filtered} rowKey="key"
                onRowClick={setDetail} rowTitle="View fictional class meeting"
                getRowAriaLabel={(row) => `View fictional ${row.code} meeting`}
                columns={[
                  { key: "code", label: "Subject Code" },
                  { key: "name", label: "Subject" },
                  { key: "day", label: "Day" },
                  { key: "time", label: "Time", render: (row) => `${row.start} to ${row.end}` },
                  { key: "section", label: "Project Section" },
                  { key: "room", label: "Room" },
                  { key: "instructor", label: "Fictional Instructor" },
                  { key: "component", label: "Class Type" },
                ]} /> : <div className="table-scroll" role="region" tabIndex={0}
                  aria-label="Weekly fictional project class schedule">
                  <div className="schedule-grid"
                    style={{ gridTemplateColumns: `minmax(100px,115px) repeat(${visibleDays.length}, minmax(180px,1fr))` }}>
                    <div className="schedule-cell header">Time</div>
                    {visibleDays.map((value) =>
                      <div key={value} className="schedule-cell header">{value}</div>)}
                    {starts.map((start) => <div key={start} style={{ display: "contents" }}>
                      <div className="schedule-cell header">{start}</div>
                      {visibleDays.map((value) => <div key={`${start}:${value}`} className="schedule-cell">
                        {filtered.filter((row) => row.day === value && row.start === start)
                          .map((row) => <button key={row.key} type="button"
                            className={`schedule-event ${styles.meetingButton}`}
                            onClick={() => setDetail(row)}
                            aria-label={`View fictional ${row.code} ${value} class details`}>
                            <strong>{row.code}</strong>
                            <span>{row.start} to {row.end}</span>
                            <span>{row.section}</span>
                            <span>{row.room}</span>
                          </button>)}
                      </div>)}
                    </div>)}
                  </div>
                </div>}
          </InternalTabs>
        </div>
      </>}
    <Modal open={Boolean(detail)} onClose={() => setDetail(null)}
      title={detail ? `Fictional Class: ${detail.code} · ${detail.name}` : "Fictional meeting"}
      footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
      {detail && <div className="info-grid">
        {[
          ["Day", detail.day], ["Time", `${detail.start} to ${detail.end}`],
          ["Fictional Section", detail.section], ["Room", detail.room],
          ["Fictional Instructor", detail.instructor], ["Class Type", detail.component],
        ].map(([label, value]) => <div className="info-item" key={label}>
          <span>{label}</span><strong>{value}</strong></div>)}
      </div>}
    </Modal>
  </Card>;
}
function NextAction({ data }) {
  const next = getInstitutionalNextAction(data);
  return (
    <Card className={`section-card ${styles.nextAction}`}>
      <div className="section-header"><div><h2>Next Required Action</h2>
        <p>Based on your verified enrollment status</p></div></div>
      <Notice>
        <strong>{next.title}</strong>
        <p>{next.description}</p>
      </Notice>
      <div className={styles.actionFooter}>
        <Link className="portal-button portal-button-primary" href={next.href}>{next.label}</Link>
      </div>
    </Card>
  );
}

function Dashboard({ data }) {
  const academic = data.academic || {};
  const confirmed = isOfficiallyConfirmed(data.enrollment);
  const availableSubjects = academic.isOfficialCurriculum !== true ? null :
    Array.isArray(data.enrollment?.subjects) ? data.enrollment.subjects :
      Array.isArray(data.subjects) ? data.subjects : null;
  const schedule = getInstitutionalSchedule(data);
  const notices = Array.isArray(data.notices) ? data.notices : [];
  const publishedCount = Array.isArray(academic.results) ? academic.results.length : null;
  const creditsCount = Array.isArray(academic.credits) ? academic.credits.length : null;
  return (
    <>
      <Card className="hero-card">
        <h2>Welcome, {valueOrFallback(data.student?.name, "Student")}</h2>
        <p>{formatStudentWelcomeDetails(data.student)}</p>
        <div className="hero-meta">
          {data.term?.label && <span className="hero-chip">{data.term.label}</span>}
          {data.student?.curriculum && data.academic?.isOfficialCurriculum === true &&
            <span className="hero-chip">{data.student.curriculum}</span>}
          <span className="hero-chip">{confirmed ? "Registrar confirmed" : "Registrar confirmation pending"}</span>
        </div>
        <div className="student-hero-actions">
          <Link className="portal-button portal-button-secondary" href="/student/student-profile">View Profile</Link>
        </div>
      </Card>
      <div className={styles.metrics}>
        <Card className="metric-card"><span className="metric-label">Enrollment Status</span>
          <div className={styles.metricStatus}><EnrollmentStatus enrollment={data.enrollment} /></div>
          <span className="metric-meta">{confirmed ? "Official confirmation recorded" : "Registrar confirmation required"}</span>
        </Card>
        <Card className="metric-card"><span className="metric-label">Prepared Subjects</span>
          <strong className="metric-value">{availableSubjects?.length ?? "Not approved"}</strong>
          <span className="metric-meta">Official institutional subjects only</span>
        </Card>
        <Card className="metric-card"><span className="metric-label">Published Academic Results</span>
          <strong className="metric-value">{publishedCount ?? "Not verified"}</strong>
          <span className="metric-meta">Institutional records only</span>
        </Card>
        <Card className="metric-card"><span className="metric-label">Block Under Review</span>
          <strong className={styles.metricBlock}>{valueOrFallback(data.homeBlock || data.schedule?.homeBlock, "Awaiting assignment")}</strong>
          <span className="metric-meta">Not a confirmed class assignment</span>
        </Card>
      </div>
      <div className={styles.dashboardGrid}>
        <NextAction data={data} />
        <Card className="section-card">
          <div className="section-header"><div><h2>Enrollment Overview</h2>
            <p>Official enrollment remains subject to Registrar confirmation</p></div>
            <Link className="section-link" href="/student/enrollment">Enrollment Details</Link>
          </div>
          <div className="detail-list">
            <div className="detail-row"><span>Current Status</span><EnrollmentStatus enrollment={data.enrollment} /></div>
            <div className="detail-row"><span>Student Record Status</span><strong>
              {data.student?.status ? <StatusBadge value={data.student.status} /> : "Not recorded"}
            </strong></div>
            <div className="detail-row"><span>Confirmed On</span>
              <strong>{confirmed ? displayDate(data.enrollment.confirmedAt) : "Not confirmed"}</strong></div>
            <div className="detail-row"><span>Approved Transfer Credits</span>
              <strong>{creditsCount ?? "Not verified"}</strong></div>
            <div className="detail-row"><span>Curriculum Approval</span><strong>
              {data.academic?.isOfficialCurriculum === true ? "Institutionally verified" :
                data.academic?.isOfficialCurriculum === false ? "Reference only" : "Not verified"}
            </strong></div>
            <div className="detail-row"><span>Class Timetable</span><strong>
              {schedule.kind === "registered" ? "Registered classes available" :
                schedule.kind === "proposed" ? "Proposed meetings only" : "Not yet published"}
            </strong></div>
          </div>
        </Card>
        <Card className="section-card">
          <div className="section-header"><div><h2>Class Schedule</h2>
            <p>{schedule.kind === "registered" ? "Registrar confirmed meetings" :
              schedule.kind === "proposed" ? "Provisional academic preparation" :
                "Waiting for verified class meetings"}</p></div>
            <Link className="section-link" href="/student/class-schedule">View Schedule</Link>
          </div>
          <Notice>{schedule.kind === "registered"
            ? "Your verified registered timetable is available."
            : schedule.kind === "proposed"
              ? "Proposed meetings are for planning only. These classes are not officially registered."
              : "Class meetings will appear once verified section assignments are available."}</Notice>
        </Card>
        <Card className="section-card">
          <div className="section-header"><div><h2>Academic Records</h2>
            <p>Institutional results and approved transfer credits</p></div>
            <Link className="section-link" href="/student/academic-records">View Records</Link>
          </div>
          <div className="info-grid">
            <div className="info-item"><span>Published Results</span><strong>{publishedCount ?? "Not verified"}</strong></div>
            <div className="info-item"><span>Transfer Credits</span><strong>{creditsCount ?? "Not verified"}</strong></div>
          </div>
          {!Array.isArray(academic.results) && <p className={styles.softText}>No verified academic results have been provided.</p>}
        </Card>
        <Card className="section-card">
          <div className="section-header"><div><h2>Academic Preparation Notices</h2>
            <p>Current requirements and Registrar updates</p></div>
            <Link className="section-link" href="/student/enrollment">View Requirements</Link>
          </div>
          {notices.length
            ? <div className="list-stack">{notices.slice(0, 3).map((notice, index) =>
              <div className="list-item" key={notice.id || index}>
                <strong>{typeof notice === "string" ? notice :
                  valueOrFallback(notice.title, "Academic preparation update")}</strong>
                {typeof notice !== "string" && <p>{valueOrFallback(notice.message || notice.description, "")}</p>}
              </div>)}</div>
            : <Notice>No additional academic preparation notices are available.</Notice>}
        </Card>
      </div>
    </>
  );
}

function Enrollment({ data, prepareAction, submitAction, reopenAction }) {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const enrollment = data.enrollment || {};
  const subjects = data.student?.curriculumProvenance === "PROJECT_ONLY_FICTIONAL" ? [] :
    Array.isArray(enrollment.subjects) ? enrollment.subjects :
      Array.isArray(data.subjects) ? data.subjects : [];
  const officialCurriculum = data.academic?.isOfficialCurriculum === true;
  const canPrepare = officialCurriculum && (data.canPrepare === true || enrollment.canPrepare === true) &&
    typeof prepareAction === "function";
  const canSubmit = officialCurriculum && (data.canSubmit === true || enrollment.canSubmit === true) &&
    typeof submitAction === "function";
  const canReopen = enrollment.status === "REQUIRES_CORRECTION" &&
    Boolean(enrollment.id) && typeof reopenAction === "function";
  const confirmed = isOfficiallyConfirmed(enrollment);
  const blockers = Array.isArray(data.blockingReasons) ? data.blockingReasons :
    Array.isArray(enrollment.blockingReasons) ? enrollment.blockingReasons : [];
  const displayBlockers = data.student?.curriculumProvenance === "PROJECT_ONLY_FICTIONAL"
    ? ["The available curriculum is a fictional reference and is not approved for institutional enrollment.", ...blockers]
    : blockers;
  const subjectUnits = subjects.length && subjects.every((row) => Number.isFinite(Number(row.units)))
    ? subjects.reduce((sum, row) => sum + Number(row.units), 0) : null;
  function runAction(action, successMessage) {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.ok !== true) {
          setMessage(result?.message || "The request could not be completed.");
          return;
        }
        setReviewOpen(false);
        setMessage(result?.message || successMessage);
        router.refresh();
      } catch {
        setMessage("The enrollment request could not be completed. Please review your status and try again.");
      }
    });
  }
  return <>
    <StudentSummary data={data} />
    <div className={styles.enrollmentGrid}>
      <Card className="section-card">
        <div className="section-header"><div><h2>Current Enrollment</h2>
          <p>Enrollment preparation and official validation</p></div></div>
        <div className="info-grid">
          <div className="info-item"><span>Enrollment Status</span>
            <strong><EnrollmentStatus enrollment={enrollment} /></strong></div>
          <div className="info-item"><span>Block Under Review</span>
            <strong>{valueOrFallback(data.homeBlock || data.schedule?.homeBlock, "Not assigned")}</strong></div>
          <div className="info-item"><span>Prepared Subjects</span><strong>{subjects.length}</strong></div>
          <div className="info-item"><span>Prepared Units</span><strong>{subjectUnits == null ? "Not verified" : units(subjectUnits)}</strong></div>
          <div className="info-item"><span>Enrollment Reference</span>
            <strong>{valueOrFallback(enrollment.reference, "Not assigned")}</strong></div>
          <div className="info-item"><span>Registrar Confirmation</span>
            <strong>{confirmed ? displayDate(enrollment.confirmedAt) : "Not confirmed"}</strong></div>
          <div className="info-item"><span>Tuition Estimate</span>
            <strong>Unavailable until institutional rates are published</strong></div>
        </div>
        <div className={styles.actionFooter}>
          {canPrepare && <Button disabled={isPending}
            onClick={() => runAction(prepareAction, "Academic preparation has been requested. The latest enrollment data is being refreshed.")}>
            {isPending ? "Processing..." : "Prepare Academic Assignment"}</Button>}
          {canSubmit && <Button disabled={isPending} onClick={() => setReviewOpen(true)}>
            Submit for Registrar Review</Button>}
          {canReopen && <Button variant="secondary" disabled={isPending}
            onClick={() => runAction(reopenAction, "You may now revise your returned enrollment.")}>
            Reopen Returned Enrollment</Button>}
        </div>
        {enrollment.correctionReason && <div className="notice warning" role="status">
          Registrar correction required: {enrollment.correctionReason}
        </div>}
        {message && <p className={styles.feedback} role="status">{message}</p>}
      </Card>
      <Card className="section-card">
        <div className="section-header"><div><h2>Enrollment Requirements</h2>
          <p>Eligibility conditions evaluated for your institutional record</p></div></div>
        {displayBlockers.length ? <div className="list-stack">{displayBlockers.map((reason, index) =>
          <div className="notice warning" key={index}>{reason}</div>)}</div> :
          <Notice>{confirmed ? "Registrar confirmation is recorded." :
            canSubmit ? "Your current prepared enrollment is eligible for submission." :
              "No additional requirement details have been published. The Registrar must verify enrollment eligibility."}</Notice>}
        {data.term?.enrollmentStart && data.term?.enrollmentEnd && <div className={styles.detailSpacing}>
          <div className="detail-row"><span>Enrollment Period</span>
            <strong>{displayDate(data.term.enrollmentStart)} to {displayDate(data.term.enrollmentEnd)}</strong></div>
        </div>}
      </Card>
    </div>
    <Card className="section-card">
      <div className="section-header"><div><h2>Subject Registration Preparation</h2>
        <p>Only verified student subject and section data appear here</p></div>
        <Link className="section-link" href="/student/class-schedule">View Class Schedule</Link>
      </div>
      <DataTable rows={subjects} rowKey={(row) => row.code}
        emptyMessage="No academic subjects are prepared for the current term."
        onRowClick={setSelected} rowTitle="View subject requirements and meeting details"
        getRowAriaLabel={(row) => `View ${row.code} preparation details`}
        columns={[
          { key: "code", label: "Subject Code", render: (row) => valueOrFallback(row.code) },
          { key: "name", label: "Subject", render: (row) => valueOrFallback(row.name) },
          { key: "units", label: "Units", render: (row) => units(row.units) },
          { key: "eligibility", label: "Eligibility", render: (row) => row.eligibility
            ? <StatusBadge value={row.eligibility} /> : "Not evaluated" },
          { key: "section", label: "Section", render: (row) => valueOrFallback(row.section, "Not assigned") },
          { key: "sectionStatus", label: "Section Status", render: (row) => row.sectionStatus
            ? <StatusBadge value={row.sectionStatus} /> : "Not published" },
          { key: "meetings", label: "Meetings", render: (row) => row.meetings?.length
            ? `${row.meetings.length} meeting${row.meetings.length === 1 ? "" : "s"}` : "No verified meeting" },
        ]} />
      <div className={styles.detailSpacing}><Notice warning={!confirmed}>
        {confirmed ? "Only Registrar confirmed registration is official. Review the confirmed timetable for your class meetings."
          : "Prepared subjects and section assignments are provisional until Registrar confirmation. A planned section does not guarantee a registered class."}
      </Notice></div>
    </Card>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)}
      title={selected ? `${selected.code} · ${selected.name}` : "Subject preparation"}
      footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
      {selected && <>
        <div className="info-grid">
          <div className="info-item"><span>Units</span><strong>{units(selected.units)}</strong></div>
          <div className="info-item"><span>Section</span><strong>{valueOrFallback(selected.section, "Not assigned")}</strong></div>
          <div className="info-item"><span>Eligibility</span><strong>
            {selected.eligibility ? <StatusBadge value={selected.eligibility} /> : "Not evaluated"}</strong></div>
        </div>
        {selected.reason && <div className={styles.detailSpacing}><Notice>{selected.reason}</Notice></div>}
        <div className={styles.detailSpacing}>
          <h3>Verified Meetings</h3>
          {selected.meetings?.length ? <div className="list-stack">{selected.meetings.map((meeting, index) =>
            <div className="list-item" key={index}>{formatMeetingSchedule(meeting)}</div>)}</div>
            : <EmptyState title="No verified class meetings published" />}
        </div>
      </>}
    </Modal>
    <Modal open={reviewOpen} onClose={() => setReviewOpen(false)}
      title="Submit Enrollment for Registrar Review"
      footer={<><Button variant="secondary" onClick={() => setReviewOpen(false)} disabled={isPending}>Cancel</Button>
        <Button disabled={isPending || !canSubmit} onClick={() => runAction(submitAction,
          "Your enrollment was submitted for Registrar review. Confirmation is still required.")}>
          {isPending ? "Submitting..." : "Confirm Submission"}</Button></>}>
      <p>Review your {subjects.length} prepared subjects and applicable sections before submitting.
        Your enrollment will remain unofficial until the Registrar confirms it.</p>
      {blockers.length > 0 && <div className={styles.detailSpacing}><Notice warning>
        Your current enrollment contains pending conditions. Verify their resolution before submission.
      </Notice></div>}
    </Modal>
  </>;
}

function AcademicRecords({ data }) {
  const [tab, setTab] = useState("history");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("ALL");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const academic = data.academic || {};
  const history = getInstitutionalAcademicHistory(academic);
  const curriculum = data.student?.curriculumProvenance === "PROJECT_ONLY_FICTIONAL" ? [] :
    Array.isArray(academic.curriculum) ? academic.curriculum : [];
  const terms = [...new Set(history.map((row) => row.term))];
  const rows = (tab === "history" ? history : curriculum).filter((row) =>
    (term === "ALL" || tab !== "history" || row.term === term) &&
    `${row.code || ""} ${row.name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return <>
    <StudentSummary data={data} />
    <div className={styles.academicMetrics}>
      <Card className="metric-card"><span className="metric-label">Published Results</span>
        <strong className="metric-value">{Array.isArray(academic.results) ? academic.results.length : "Not verified"}</strong>
        <span className="metric-meta">Institutional academic history</span></Card>
      <Card className="metric-card"><span className="metric-label">Transfer Credit Records</span>
        <strong className="metric-value">{Array.isArray(academic.credits) ? academic.credits.length : "Not verified"}</strong>
        <span className="metric-meta">Registrar approved decisions only</span></Card>
    </div>
    {academic.isOfficialCurriculum === false && <Notice warning>
      {data.student?.curriculumProvenance === "PROJECT_ONLY_FICTIONAL"
        ? "The displayed curriculum is a fictional reference. It does not establish institutional completion, eligibility, or registration."
        : "Institutional curriculum and section validation are pending. The displayed curriculum is not yet an approved academic assignment."}
    </Notice>}
    <InternalTabs items={[{ value: "history", label: "Academic History" },
      { value: "curriculum", label: "Curriculum Progress" }]}
      selected={tab} onSelect={(value) => { setTab(value); setTerm("ALL"); setSearch(""); setPage(1); }}
      label="Institutional academic record sections" panelCard>
      <div className="toolbar">
        <SearchControl value={search} onChange={(value) => { setSearch(value); setPage(1); }}
          placeholder="Search subject or code" />
        {tab === "history" && <FilterControl label="Academic term" value={term}
          onChange={(value) => { setTerm(value); setPage(1); }}
          options={[{ value: "ALL", label: "All terms" },
            ...terms.map((value) => ({ value, label: value }))]} />}
      </div>
      {tab === "history" ? <DataTable rows={pageRows} rowKey="key"
        emptyMessage="No published institutional academic results or approved transfer credits are available."
        onRowClick={setDetail} rowTitle="View academic record"
        getRowAriaLabel={(row) => `View ${row.code} academic record`}
        columns={[
          { key: "code", label: "Subject Code" },
          { key: "name", label: "Subject" },
          { key: "term", label: "Term" },
          { key: "units", label: "Units", render: (row) => units(row.units) },
          { key: "grade", label: "Published Grade", render: (row) => valueOrFallback(row.grade) },
          { key: "result", label: "Result", render: (row) => <StatusBadge value={row.result} /> },
          { key: "source", label: "Source" },
        ]} /> : <DataTable rows={pageRows} rowKey={(row) => row.code || row.subject_code}
        emptyMessage="No verified assigned curriculum subjects are available."
        onRowClick={setDetail} rowTitle="View curriculum subject"
        getRowAriaLabel={(row) => `View ${row.code || row.subject_code} curriculum details`}
        columns={[
          { key: "code", label: "Subject Code", render: (row) => row.code || row.subject_code },
          { key: "name", label: "Subject", render: (row) => row.name || row.subject_name },
          { key: "yearLevel", label: "Year", render: (row) => valueOrFallback(row.yearLevel ?? row.year_level) },
          { key: "semester", label: "Semester", render: (row) => valueOrFallback(row.semester) },
          { key: "units", label: "Units", render: (row) => units(row.units) },
          { key: "status", label: "Academic Progress", render: (row) => academic.isOfficialCurriculum !== true
            ? "Not institutionally evaluated" : row.status
              ? <StatusBadge value={row.status} /> : "Not evaluated" },
        ]} />}
      {rows.length > PAGE_SIZE && <TablePagination page={safePage} pageSize={PAGE_SIZE}
        total={rows.length} onPageChange={setPage} label="Institutional academic results pages" />}
    </InternalTabs>
    <Modal open={Boolean(detail)} onClose={() => setDetail(null)}
      title={detail ? `${detail.code || detail.subject_code} · ${detail.name || detail.subject_name}` : "Academic record"}
      footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
      {detail && <div className="info-grid">
        <div className="info-item"><span>Subject Code</span><strong>{detail.code || detail.subject_code}</strong></div>
        <div className="info-item"><span>Units</span><strong>{units(detail.units)}</strong></div>
        <div className="info-item"><span>Result</span><strong>
          {detail.result || detail.status ? <StatusBadge value={detail.result || detail.status} /> : "Not evaluated"}</strong></div>
        {"term" in detail && <div className="info-item"><span>Academic Term</span><strong>{detail.term}</strong></div>}
        {"grade" in detail && <div className="info-item"><span>Published Grade</span><strong>{valueOrFallback(detail.grade)}</strong></div>}
        {"source" in detail && <div className="info-item"><span>Source</span><strong>{detail.source}</strong></div>}
        {detail.reason && <div className="notice">{detail.reason}</div>}
      </div>}
    </Modal>
  </>;
}

function ClassSchedule({ data }) {
  const [tab, setTab] = useState("weekly");
  const [day, setDay] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [corOpen, setCorOpen] = useState(false);
  const schedule = useMemo(() => getInstitutionalSchedule(data), [data]);
  const days = WEEKDAY_NAMES.filter((item) => schedule.meetings.some((meeting) => meeting.day === item));
  const codes = [...new Set(schedule.meetings.map((row) => row.code))];
  const visible = schedule.meetings.filter((meeting) =>
    (day === "ALL" || meeting.day === day) && (subject === "ALL" || meeting.code === subject));
  const visibleDays = day === "ALL" ? days : days.filter((item) => item === day);
  const starts = [...new Map(visible.map((meeting) => [meeting.start, meeting.rawStart])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])).map(([label]) => label);
  const canShow = schedule.kind !== "awaiting" && schedule.meetings.length > 0;
  const corUrl = schedule.kind === "registered" &&
    data.enrollment?.cor?.ready_to_print === true && data.enrollment?.id
    ? `/api/student/official-cor/${encodeURIComponent(data.enrollment.id)}` : null;
  return <>
    <StudentSummary data={data} />
    {!canShow ? <Card className="section-card"><EmptyState
      title="Verified class timetable not yet available"
      description="The Academic Coordinator must publish validated real section meetings. Registered classes will appear only after Registrar confirmation." /></Card> : <>
      <div className={styles.scheduleSummary}>
        <span>Term: <strong>{valueOrFallback(schedule.term, "Not published")}</strong></span>
        <span>Schedule: <StatusBadge value={schedule.kind === "registered" ? "CONFIRMED" : "PROPOSED"}
          label={schedule.kind === "registered" ? "Registered" : "Proposed, not registered"} /></span>
        {schedule.reference && schedule.kind === "registered" &&
          <span>Confirmation Reference: <strong>{schedule.reference}</strong></span>}
      </div>
      <div className={styles.detailSpacing}>
        <Notice warning={schedule.kind === "proposed"}>{schedule.kind === "registered"
          ? "These verified classes belong to a Registrar confirmed enrollment."
          : "This timetable is provisional. A planned class section is not an official registration. Registrar confirmation is required."}
        </Notice>
      </div>
      <InternalTabs items={[{ value: "weekly", label: "Weekly Schedule" },
        { value: "list", label: "List View" }]}
        selected={tab} onSelect={setTab} label="Institutional class schedule views" panelCard>
        <div className="toolbar">
          <FilterControl label="Day" value={day} onChange={setDay}
            options={[{ value: "ALL", label: "All days" }, ...days.map((item) => ({ value: item, label: item }))]} />
          <FilterControl label="Subject" value={subject} onChange={setSubject}
            options={[{ value: "ALL", label: "All subjects" },
              ...codes.map((code) => ({ value: code, label: code }))]} />
          {corUrl && <Button onClick={() => setCorOpen(true)}>View Official COR</Button>}
          <Button variant="secondary" onClick={() => window.print()}>Print Schedule</Button>
        </div>
        {visible.length === 0 ? <EmptyState title="No classes match the selected filters." /> :
          tab === "list" ? <DataTable rows={visible} rowKey="key"
            onRowClick={setSelected} rowTitle="View class meeting details"
            getRowAriaLabel={(row) => `View ${row.code} meeting details`}
            columns={[
              { key: "code", label: "Subject Code" }, { key: "name", label: "Subject" },
              { key: "day", label: "Day" },
              { key: "time", label: "Time", render: (row) => `${row.start} to ${row.end}` },
              { key: "section", label: "Section" }, { key: "room", label: "Room" },
              { key: "instructor", label: "Instructor" }, { key: "component", label: "Class Type" },
            ]} /> : <div className="table-scroll" role="region" tabIndex={0}
              aria-label={`Weekly ${schedule.kind === "registered" ? "registered" : "proposed"} class schedule`}>
              <div className="schedule-grid"
                style={{ gridTemplateColumns: `minmax(100px, 115px) repeat(${visibleDays.length}, minmax(180px, 1fr))` }}>
                <div className="schedule-cell header">Time</div>
                {visibleDays.map((item) => <div className="schedule-cell header" key={item}>{item}</div>)}
                {starts.map((start) => <div key={start} style={{ display: "contents" }}>
                  <div className="schedule-cell header">{start}</div>
                  {visibleDays.map((item) => <div className="schedule-cell" key={`${start}:${item}`}>
                    {visible.filter((row) => row.day === item && row.start === start).map((row) =>
                      <button type="button" key={row.key} className={`schedule-event ${styles.meetingButton}`}
                        onClick={() => setSelected(row)}
                        aria-label={`View ${row.code} ${row.day} class details`}>
                        <strong>{row.code}</strong>
                        <span>{row.start} to {row.end}</span>
                        <span>{row.room}</span>
                        <span>{row.section}</span>
                      </button>)}
                  </div>)}
                </div>)}
              </div>
            </div>}
      </InternalTabs>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)}
        title={selected ? `${selected.code} · ${selected.name}` : "Meeting details"}
        footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
        {selected && <div className="info-grid">
          {[["Day", selected.day], ["Time", `${selected.start} to ${selected.end}`],
            ["Section", selected.section], ["Room", selected.room],
            ["Instructor", selected.instructor], ["Class Type", selected.component]].map(([label, value]) =>
            <div className="info-item" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>}
      </Modal>
      <CorDocumentPreview open={Boolean(corOpen && corUrl)}
        onClose={() => setCorOpen(false)} documentUrl={corUrl} project={false} />
    </>}
  </>;
}

export default function LiveStudentInstitutionalView({
  section, data, prepareAction, submitAction, reopenAction,
  prepareDemonstrationAction, submitDemonstrationAction, reopenDemonstrationAction,
}) {
  const title = section === "Dashboard" ? "Student Dashboard" : section;
  const available = data && ["ready", "blocked"].includes(data.kind) && data.student;
  const demo = available ? getAuthorizedDemonstration(data) : null;
  const demoUnavailable = available && hasUnavailableDemonstration(data);
  return <>
    <PageHeader title={title} description={PAGE_DESCRIPTIONS[section] || "PLP institutional student portal"} />
    {!available ? <Card className="section-card">
      <EmptyState title={data?.kind === "unavailable" ? "Student information temporarily unavailable" :
        "Institutional student record not available"}
      description="We could not verify your institutional student information. Refresh this page, or contact the Registrar or System Administrator if the problem continues." />
    </Card> : <div className={styles.content}>
      {demoUnavailable && <Card className="section-card">
        <EmptyState title="Phase 8 demonstration temporarily unavailable"
          description="Your institutional student record is still available below. The fictional project dataset could not be verified at this time. Try again or contact the Registrar." />
      </Card>}
      {demo && <DemoBoundaryNotice demonstration={demo} />}
      {demo && section === "Dashboard" && <DemonstrationDashboard demo={demo} />}
      {demo && section === "Enrollment" &&
        <DemonstrationEnrollment demo={demo}
          prepareDemonstrationAction={prepareDemonstrationAction}
          submitDemonstrationAction={submitDemonstrationAction}
          reopenDemonstrationAction={reopenDemonstrationAction} />}
      {demo && section === "Academic Records" && <DemonstrationCurriculum demo={demo} />}
      {demo && section === "Class Schedule" && <DemonstrationSchedule demo={demo} />}
      {section === "Dashboard" ? <Dashboard data={data} /> :
        section === "Enrollment" ? <Enrollment data={data} prepareAction={prepareAction}
          submitAction={submitAction} reopenAction={reopenAction} /> :
          section === "Academic Records" ? <AcademicRecords data={data} /> :
            section === "Class Schedule" ? <ClassSchedule data={data} /> : null}
    </div>}
  </>;
}
