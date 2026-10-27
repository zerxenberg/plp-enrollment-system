import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { displayCurriculumCode } from "@/features/academic/project-academic-display-aliases.mjs";

function Notice({ children }) {
  return <div className="notice" role="note">{children}</div>;
}

function formatProjectPeso(amount) {
  return typeof amount === "number" && Number.isFinite(amount)
    ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)
    : "Not available";
}

function hasVerifiedDemonstrationRegistration(data) {
  const registration = data.confirmedRegistration;
  return data.simulation?.status === "CONFIRMED_SIMULATION" &&
    registration?.source === "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT" &&
    Array.isArray(registration.subjects) && registration.subjects.length > 0 &&
    registration.subjects.every((subject) => subject.meetings?.length > 0) &&
    Number.isFinite(registration.units);
}

function getNextAction(data) {
  const current = data.simulation?.status;
  if (current === "CONFIRMED_SIMULATION") {
    if (hasVerifiedDemonstrationRegistration(data)) return {
      title: "View confirmed demonstration classes",
      description: "The Registrar confirmed your demonstration registration, including its saved subjects and class meetings. This is not official university enrollment.",
      label: "View Registered Class Schedule", href: "/student/class-schedule",
    };
    return {
      title: "Check demonstration registration verification",
      description: "Your earlier Registrar confirmation has no verified registered subjects. Ask the Registrar to recover the legacy demonstration enrollment before submitting again.",
      label: "Review Enrollment Status", href: "/student/enrollment",
    };
  }
  if (["SUBMITTED", "VALIDATED"].includes(current)) return {
    title: "Track Registrar enrollment review",
    description: "Your submission is read only while the Registrar reviews it.",
    label: "View Enrollment Status", href: "/student/enrollment",
  };
  if (current === "RETURNED") return {
    title: "Review returned enrollment",
    description: "Your enrollment was returned for review. Check the current prepared subjects and any Registrar instructions.",
    label: "Review Returned Enrollment", href: "/student/enrollment",
  };
  if (data.canSubmit) return {
    title: "Review prepared subjects and submit",
    description: "Your prepared subjects and class sections are ready for review.",
    label: "Review Enrollment", href: "/student/enrollment",
  };
  return {
    title: "Check enrollment requirements",
    description: data.blockingReasons?.[0] || "Enrollment requires a currently open Registrar enrollment period and valid academic preparation.",
    label: "View Enrollment Requirements", href: "/student/enrollment",
  };
}

export default function StudentDashboardLive({ enrollment, notices }) {
  if (enrollment.kind !== "ready") return <>
    <PageHeader title="Student Dashboard" description="Your academic and enrollment overview" />
    <Card><Notice>{enrollment.reason === "records"
      ? "Your enrollment records are temporarily unavailable. Try again or contact the System Administrator."
      : "Your authenticated student account could not be verified. Sign in again or contact the System Administrator."}</Notice></Card>
  </>;

  const data = enrollment;
  const action = getNextAction(data);
  const notificationsReady = notices?.kind === "ready" && Array.isArray(notices.items);
  const unread = notificationsReady ? notices.items.filter((item) => !item.read) : [];
  const isDemoConfirmationRecorded = data.simulation?.status === "CONFIRMED_SIMULATION";
  const isDemoRegistrationVerified = hasVerifiedDemonstrationRegistration(data);
  const institutionalResults = data.previousResults || [];
  const institutionalCredits = data.transferCredits || [];
  // The server supplies ledger-accepted project results separately from
  // institutionally published results. Missing fields mean unverified counts.
  const acceptedProjectResults = Array.isArray(data.acceptedProjectResults)
    ? data.acceptedProjectResults : null;
  const projectTransferDecisions = Array.isArray(data.projectTransferDecisions)
    ? data.projectTransferDecisions : null;
  const institutionalDeficiencies = institutionalResults.filter((result) =>
    ["FAILED", "INCOMPLETE"].includes(result.result)).length;
  const projectDeficiencies = acceptedProjectResults?.filter((result) =>
    ["FAILED", "INCOMPLETE"].includes(result.result_status)).length;
  const projectCredits = projectTransferDecisions?.filter((decision) =>
    decision.decision_status === "PROJECT_CREDITED").length;
  const plannedSubjectSections = (data.subjects || []).filter((subject) =>
    subject.sectionStatus === "PLANNED").length;
  const officialStatus = data.officialStatus === "CONFIRMED" ? "Confirmed"
    : data.officialStatus === "NOT_CONFIRMED" ? "Not confirmed" : "Not verified";
  return <>
    <PageHeader title="Student Dashboard" description="Your academic identity, enrollment condition, and next required action." />
    <Card className="hero-card">
      <h2>Welcome, {data.student.name}</h2>
      <p>{data.student.number} · {data.student.program} · Year {data.student.yearLevel} · {String(data.student.type || "").replaceAll("_", " ")}</p>
      <div className="hero-meta">
        <span className="hero-chip">{data.term.label}</span>
        <span className="hero-chip">{displayCurriculumCode(data.student.curriculum)}</span>
        <span className="hero-chip">Demonstration account</span>
      </div>
      <Link className="portal-button portal-button-secondary" href="/student/student-profile">View Profile</Link>
    </Card>

    <div className="content-grid" style={{ marginTop: 16 }}>
      <Card className="section-card span-7">
        <div className="section-header"><div><h2>Next Required Action</h2><p>{data.student.classification} · {data.student.progression?.replaceAll("_", " ")}</p></div></div>
        <Notice><strong>{action.title}</strong><p>{action.description}</p></Notice>
        <div className="action-row" style={{ marginTop: 12 }}>
          <Link className="portal-button portal-button-primary" href={action.href}>{action.label}</Link>
        </div>
      </Card>

      <Card className="section-card span-5">
        <div className="section-header"><h2>Enrollment and Eligibility</h2></div>
        <div className="detail-list">
          <div className="detail-row"><span>Enrollment Review Status</span><StatusBadge value={data.simulation?.status || "NOT_STARTED"} label={isDemoConfirmationRecorded ? (isDemoRegistrationVerified ? "Confirmed (demo only)" : "Recorded; snapshot unverified") : undefined} /></div>
          <div className="detail-row"><span>Official Enrollment Status</span><strong>{officialStatus}</strong></div>
          <div className="detail-row"><span>Academic Classification</span><StatusBadge value={data.student.classification} /></div>
          <div className="detail-row"><span>Published Failed / Incomplete Results</span><strong>{institutionalDeficiencies}</strong></div>
          <div className="detail-row"><span>Accepted Project Failed / Incomplete</span><strong>{projectDeficiencies ?? "Not verified"}</strong></div>
          <div className="detail-row"><span>Enrollment Window</span><strong>{data.term.enrollmentStart || "Not configured"} to {data.term.enrollmentEnd || "Not configured"}</strong></div>
        </div>
      </Card>

      <Card className="section-card span-6">
        {isDemoConfirmationRecorded ? <>
          <div className="section-header"><div><h2>Demonstration Registration</h2>
            <p>{isDemoRegistrationVerified ? "Verified registered subjects and class meetings from Registrar confirmation." : "Registrar confirmation recorded; registration details are not verified."}</p></div>
            <Link className="section-link" href={isDemoRegistrationVerified ? "/student/class-schedule" : "/student/enrollment"}>{isDemoRegistrationVerified ? "View Registered Schedule" : "Check Registration"}</Link></div>
          <div className="info-grid">
            <div className="info-item"><span>Registered Subjects (Demo)</span><strong>{isDemoRegistrationVerified ? data.confirmedRegistration.subjects.length : "Not verified"}</strong></div>
            <div className="info-item"><span>Registered Units (Demo)</span><strong>{isDemoRegistrationVerified ? data.confirmedRegistration.units : "Not verified"}</strong></div>
            {isDemoRegistrationVerified && <div className="info-item"><span>Registered Estimated Tuition (Demonstration)</span><strong>{formatProjectPeso(data.confirmedRegistration.projectFeeEstimate?.estimatedAmount)}</strong></div>}
          </div>
          {!isDemoRegistrationVerified && <Notice>The current prepared subjects and timetable cannot be treated as registered classes.</Notice>}
        </> : <>
          <div className="section-header"><div><h2>Prepared Registration</h2><p>Provisional academic preparation, not a confirmed class assignment.</p></div>
            <Link className="section-link" href="/student/enrollment">View Subjects</Link></div>
          <div className="info-grid">
            <div className="info-item"><span>Proposed Home Block</span><strong>{data.homeBlock || "Not assigned"}</strong></div>
            <div className="info-item"><span>Prepared Term Subjects</span><strong>{data.subjects.length}</strong></div>
            <div className="info-item"><span>Subjects Eligible with Open Sections</span><strong>{data.proposedSubjects.length}</strong></div>
            <div className="info-item"><span>Subjects with Planned Sections</span><strong>{plannedSubjectSections}</strong></div>
            <div className="info-item"><span>Proposed Units</span><strong>{data.proposedUnits}</strong></div>
            <div className="info-item"><span>Estimated Tuition (Demonstration)</span><strong>{formatProjectPeso(data.projectFeeEstimate?.estimatedAmount)}</strong></div>
          </div>
        </>}
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Academic Records</h2><p>Institutional records and separately accepted project evidence</p></div>
          <Link className="section-link" href="/student/academic-records">Open Academic Records</Link></div>
        <div className="info-grid">
          <div className="info-item"><span>Published Institutional Results</span><strong>{institutionalResults.length}</strong></div>
          <div className="info-item"><span>Accepted Project Grade Results</span><strong>{acceptedProjectResults?.length ?? "Not verified"}</strong></div>
          <div className="info-item"><span>Approved Institutional Transfer Credits</span><strong>{institutionalCredits.length}</strong></div>
          <div className="info-item"><span>Fictional Project Transfer Credits</span><strong>{projectCredits ?? "Not verified"}</strong></div>
        </div>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Class Schedule</h2><p>{isDemoRegistrationVerified ? "Verified demonstration class timetable" : data.timetableReady ? "Verified proposed block timetable available before Registrar confirmation" : "Awaiting a verified block timetable"}</p></div>
          <Link className="section-link" href="/student/class-schedule">View Schedule</Link></div>
        <Notice>{isDemoRegistrationVerified
          ? "Your confirmed demonstration schedule is available. It is not an official university class assignment."
          : isDemoConfirmationRecorded
            ? "Registrar confirmation was recorded, but the registered class schedule could not be verified. A validated proposed block timetable may still be viewed before registration verification."
            : data.timetableReady
              ? "View your verified proposed block timetable before confirmation. These classes are planned and not yet registered."
              : "A proposed timetable will appear after block schedule validation. Registered classes require Registrar confirmation and snapshot verification."}</Notice>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Notifications</h2><p>{notificationsReady ? `${unread.length} unread notifications` : "Notifications unavailable"}</p></div>
          <Link className="section-link" href="/student/notifications">View All</Link></div>
        {!notificationsReady ? <Notice>Notifications could not be loaded. Open Notifications to try again.</Notice>
          : unread.length ? <div className="list-stack">{unread.slice(0, 3).map((item) =>
          <div className="list-item" key={item.id}><strong>{item.title}</strong><p>{item.message}</p></div>)}</div>
          : <Notice>No unread notifications for this account.</Notice>}
      </Card>
    </div>
  </>;
}
