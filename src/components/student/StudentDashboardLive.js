import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { displayCurriculumCode } from "@/features/academic/project-academic-display-aliases.mjs";

function Notice({ children }) {
  return <div className="notice" role="note">{children}</div>;
}

function getNextAction(data) {
  const current = data.simulation?.status;
  if (current === "CONFIRMED_SIMULATION") return {
    title: "Review your demonstration enrollment",
    description: "The Registrar confirmed your demonstration review. This is not official university enrollment.",
    label: "View Registration Demonstration", href: "/student/enrollment",
  };
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
    <Card><Notice>Your authenticated student record is not available. Contact the System Administrator if your account was already activated.</Notice></Card>
  </>;

  const data = enrollment;
  const action = getNextAction(data);
  const unread = notices.kind === "ready" ? notices.items.filter((item) => !item.read) : [];
  const deficientCount = data.previousResults.filter((result) => ["FAILED", "INCOMPLETE"].includes(result.result)).length;
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
          <div className="detail-row"><span>Enrollment Review Status</span><StatusBadge value={data.simulation?.status || "NOT_STARTED"} label={data.simulation?.status === "CONFIRMED_SIMULATION" ? "Confirmed (demo only)" : undefined} /></div>
          <div className="detail-row"><span>Official Enrollment Status</span><strong>Not Confirmed</strong></div>
          <div className="detail-row"><span>Academic Classification</span><StatusBadge value={data.student.classification} /></div>
          <div className="detail-row"><span>Recorded Deficiencies</span><strong>{deficientCount}</strong></div>
          <div className="detail-row"><span>Enrollment Window</span><strong>{data.term.enrollmentStart} to {data.term.enrollmentEnd}</strong></div>
        </div>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Prepared Registration</h2><p>Provisional academic preparation, not a confirmed class assignment.</p></div>
          <Link className="section-link" href="/student/enrollment">View Subjects</Link></div>
        <div className="info-grid">
          <div className="info-item"><span>Proposed Home Block</span><strong>{data.homeBlock || "Not assigned"}</strong></div>
          <div className="info-item"><span>Prepared Eligible Subjects</span><strong>{data.proposedSubjects.length}</strong></div>
          <div className="info-item"><span>Proposed Units</span><strong>{data.proposedUnits}</strong></div>
        </div>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Academic Records</h2><p>History and curriculum requirements</p></div>
          <Link className="section-link" href="/student/academic-records">Open Academic Records</Link></div>
        <div className="info-grid">
          <div className="info-item"><span>Published Academic Results</span><strong>{data.previousResults.length}</strong></div>
          <div className="info-item"><span>Approved Transfer Credits</span><strong>{data.transferCredits.length}</strong></div>
        </div>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Class Schedule</h2><p>Available after official Registrar confirmation</p></div>
          <Link className="section-link" href="/student/class-schedule">View Schedule</Link></div>
        <Notice>Confirmed class schedules are released after Registrar confirmation.</Notice>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Notifications</h2><p>{unread.length} unread notifications</p></div>
          <Link className="section-link" href="/student/notifications">View All</Link></div>
        {unread.length ? <div className="list-stack">{unread.slice(0, 3).map((item) =>
          <div className="list-item" key={item.id}><strong>{item.title}</strong><p>{item.message}</p></div>)}</div>
          : <Notice>No unread notifications for this account.</Notice>}
      </Card>
    </div>
  </>;
}
