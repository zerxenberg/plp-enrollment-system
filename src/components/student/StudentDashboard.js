"use client";

import Link from "next/link";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

function MetricCard({ label, value, meta }) {
  return (
    <Card className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-meta">{meta}</span>
    </Card>
  );
}

export default function StudentDashboard() {
  const { student, notifications } = useDemoData();
  const results = student.academicResults;
  const completed = results.filter((item) => item.status === "COMPLETED" || item.status === "CREDITED").length;
  const failed = results.filter((item) => item.status === "FAILED").length;
  const incomplete = results.filter((item) => item.status === "INCOMPLETE").length;
  const unread = notifications.student.filter((item) => !item.read);

  const nextAction = student.enrollment.status === "CONFIRMED"
    ? {
        title: "View your confirmed class schedule",
        description: "Your enrollment is confirmed. Review the final schedule and keep a printable copy.",
        href: "/student/class-schedule",
        label: "View Class Schedule",
      }
    : student.enrollment.status === "FOR_VALIDATION" || student.enrollment.status === "SUBMITTED"
      ? {
          title: "Wait for Registrar validation",
          description: "Your enrollment has been submitted. Track its current stage and any Registrar feedback.",
          href: "/student/enrollment",
          label: "Check Enrollment Status",
        }
      : student.enrollment.status === "VALIDATED"
        ? {
            title: "Review your validated enrollment",
            description: "Registrar validation is complete. Your transaction is waiting for final confirmation.",
            href: "/student/enrollment",
            label: "Review Enrollment Status",
          }
        : student.enrollment.status === "NEEDS_ACADEMIC_REVIEW"
          ? {
              title: "Academic review is required",
              description: "Your enrollment needs an Academic Coordinator decision before Registrar processing can continue.",
              href: "/student/enrollment",
              label: "Review Enrollment Status",
            }
      : student.enrollment.status === "REQUIRES_CORRECTION"
        ? {
            title: "Correct and resubmit your enrollment",
            description: student.enrollment.correctionReason || "Review the returned transaction, correct the affected item, then resubmit.",
            href: "/student/enrollment",
            label: "Open Enrollment",
          }
        : student.enrollment.eligibilityStatus !== "ELIGIBLE"
          ? {
              title: "Review your enrollment eligibility",
              description: "Your current eligibility does not allow normal enrollment to continue. Review the recorded academic reason.",
              href: "/student/enrollment",
              label: "Review Eligibility",
            }
        : student.profile.academicClassification === "IRREGULAR"
          ? {
              title: "Review deficiencies and eligible subjects",
              description: "Your portal evaluates subjects individually so you can continue with allowed subjects while resolving deficiencies.",
              href: "/student/enrollment",
              label: "Continue Enrollment",
            }
          : {
              title: "Review your recommended subjects",
              description: "The enrollment period is open. Review your academic eligibility and current term subjects.",
              href: "/student/enrollment",
              label: "Start Enrollment",
            };

  return (
    <>
      <PageHeader
        title="Student Dashboard"
        description="Your current academic standing, enrollment progress, schedule, and next required action in one place."
      />

      <Card className="hero-card">
        <h2>Welcome, {student.profile.fullName}</h2>
        <p>
          {student.profile.program} • {student.profile.yearLevel}. Your portal is currently configured for
          {` ${student.profile.academicClassification === "IRREGULAR" ? "an Irregular" : "a Regular"} student workflow.`}
        </p>
        <div className="hero-meta">
          <span className="hero-chip">{student.term.label}</span>
          <span className="hero-chip">{student.profile.curriculum}</span>
          <span className="hero-chip">{student.profile.studentNumber}</span>
        </div>
      </Card>

      <div className="stats-grid" style={{ marginTop: 16 }}>
        <MetricCard label="Student Status" value={<StatusBadge value={student.profile.studentStatus} />} meta={student.profile.studentType} />
        <MetricCard label="Enrollment Eligibility" value={<StatusBadge value={student.enrollment.eligibilityStatus} />} meta={student.profile.progressionStatus.replaceAll("_", " ")} />
        <MetricCard label="Enrollment Status" value={<StatusBadge value={student.enrollment.status} />} meta={student.term.status === "Open" ? "Enrollment period is open" : "Enrollment period is closed"} />
        <MetricCard label="Academic Classification" value={<StatusBadge value={student.profile.academicClassification} />} meta={student.profile.yearLevel} />
        <MetricCard label="Completed or Credited" value={completed} meta={`${results.length} academic results available`} />
        <MetricCard label="Academic Deficiencies" value={failed + incomplete} meta={`${failed} failed • ${incomplete} incomplete`} />
      </div>

      <div className="content-grid" style={{ marginTop: 16 }}>
        <Card className="section-card span-7">
          <div className="section-header">
            <h2>Next Required Action</h2>
            <StatusBadge value={student.profile.progressionStatus} />
          </div>
          <div className="notice">
            <strong>{nextAction.title}</strong>
            <p>{nextAction.description}</p>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Link className="portal-button portal-button-primary" href={nextAction.href}>{nextAction.label}</Link>
            <Link className="portal-button portal-button-secondary" href="/student/academic-records">View Academic Records</Link>
          </div>
        </Card>

        <Card className="section-card span-5">
          <div className="section-header">
            <h2>Current Term</h2>
            <StatusBadge value={student.term.status} label={student.term.status} />
          </div>
          <div className="detail-list">
            <div className="detail-row"><span>Academic Year</span><strong>{student.term.academicYear}</strong></div>
            <div className="detail-row"><span>Semester</span><strong>{student.term.semester}</strong></div>
            <div className="detail-row"><span>Enrollment Window</span><strong>{student.term.enrollmentStart} to {student.term.enrollmentEnd}</strong></div>
            <div className="detail-row"><span>Progression</span><strong>{student.profile.progressionStatus.replaceAll("_", " ")}</strong></div>
          </div>
        </Card>

        <Card className="section-card span-6">
          <div className="section-header">
            <h2>Academic Summary</h2>
            <Link className="section-link" href="/student/academic-records">Open Academic Records</Link>
          </div>
          <div className="info-grid">
            <div className="info-item"><span>Completed</span><strong>{results.filter((item) => item.status === "COMPLETED").length}</strong></div>
            <div className="info-item"><span>Credited</span><strong>{results.filter((item) => item.status === "CREDITED").length}</strong></div>
            <div className="info-item"><span>Failed</span><strong>{failed}</strong></div>
            <div className="info-item"><span>Incomplete</span><strong>{incomplete}</strong></div>
          </div>
        </Card>

        <Card className="section-card span-6">
          <div className="section-header">
            <div>
              <h2>Schedule Summary</h2>
              <p>Your latest confirmed schedule. Proposed current term sections remain inside Enrollment until confirmation.</p>
            </div>
            <Link className="section-link" href="/student/class-schedule">View Schedule</Link>
          </div>
          <div className="info-grid">
            <div className="info-item"><span>Confirmed Term</span><strong>{student.confirmedSchedule.term}</strong></div>
            <div className="info-item"><span>Confirmed Classes</span><strong>{student.confirmedSchedule.items.length}</strong></div>
          </div>
          <div className="list-stack" style={{ marginTop: 10 }}>
            {student.confirmedSchedule.items.slice(0, 2).map((item) => (
              <div className="list-item" key={`${item.code}-${item.section}`}>
                <strong>{item.code} • {item.name}</strong>
                <p>{item.day} • {item.start} to {item.end} • {item.room}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="section-card span-6">
          <div className="section-header">
            <div>
              <h2>Recent Notifications</h2>
              <p>{unread.length} unread notification{unread.length === 1 ? "" : "s"} require your attention.</p>
            </div>
            <Link className="section-link" href="/student/notifications">View All</Link>
          </div>
          <div className="list-stack">
            {notifications.student.slice(0, 3).map((item) => (
              <div className="list-item" key={item.id}>
                <div className="list-item-header">
                  <strong>{item.title}</strong>
                  <StatusBadge value={item.read ? "READ" : "IN_PROGRESS"} label={item.read ? "Read" : "Unread"} />
                </div>
                <p>{item.message}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
