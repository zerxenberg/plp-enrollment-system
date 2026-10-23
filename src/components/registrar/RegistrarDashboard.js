"use client";

import Link from "next/link";
import { DataTable, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import AppIcon from "@/components/ui/AppIcon";
import { LinkButton, Metric, Panel } from "./RegistrarShared";

function count(map, key) {
  return map?.[key] || 0;
}

export default function RegistrarDashboard({ dashboardData }) {
  const {
    currentTerm,
    studentCount,
    projectStudentCount,
    officialCounts,
    projectCounts,
    gradeImportSummary,
    capacityConcerns,
    recentActivity,
    notifications,
  } = dashboardData;

  return (
    <>
      <PageHeader
        title="Registrar Dashboard"
        description="Live institutional enrollment operations, project demonstration workload, student records, and current academic term status."
        actions={<LinkButton href="/registrar/enrollment">Open Enrollment Processing</LinkButton>}
      />

      <section className="portal-card hero-card registrar-enter" aria-label="Current enrollment term">
        <h2>Enrollment operations at a glance</h2>
        <p>Official institutional records and PROJECT_ONLY demonstration records remain separate.</p>
        <div className="hero-meta">
          <span className="hero-chip">{currentTerm?.label || "Academic term not available"}</span>
          <span className="hero-chip">Institutional window: {currentTerm?.status || "Not available"}</span>
          <span className="hero-chip">{currentTerm?.enrollmentStartLabel || "Not available"} to {currentTerm?.enrollmentEndLabel || "Not available"}</span>
        </div>
      </section>

      <div className="stats-grid" style={{ margin: "16px 0" }}>
        <Metric label="Student Records" value={studentCount} hint={`${projectStudentCount} PROJECT_ONLY records`} />
        <Metric label="Official For Validation" value={count(officialCounts, "FOR_VALIDATION")} hint="Institutional Registrar queue" />
        <Metric label="Official Requires Correction" value={count(officialCounts, "REQUIRES_CORRECTION")} hint="Institutional records" />
        <Metric label="Official Validated" value={count(officialCounts, "VALIDATED")} hint="Eligible for protected confirmation" />
        <Metric label="Officially Enrolled" value={count(officialCounts, "CONFIRMED")} hint="CONFIRMED institutional transactions" />
        <Metric label="Project Submitted" value={count(projectCounts, "SUBMITTED")} hint="Demonstration workflow only" />
        <Metric label="Project Validated" value={count(projectCounts, "VALIDATED")} hint="Demonstration workflow only" />
        <Metric
          label="Grade Import History"
          value={gradeImportSummary.available ? gradeImportSummary.total : "Unavailable"}
          hint={gradeImportSummary.available ? "Live grade import batches" : "Current schema exposes write workflow but no Registrar history reader"}
        />
      </div>

      <div className="content-grid">
        <Panel title="Enrollment Workload" subtitle="Official and demonstration statuses remain separate." className="span-7">
          <div className="list-stack">
            {[
              ["Official · For Validation", count(officialCounts, "FOR_VALIDATION"), "FOR_VALIDATION"],
              ["Official · Needs Academic Review", count(officialCounts, "NEEDS_ACADEMIC_REVIEW"), "NEEDS_ACADEMIC_REVIEW"],
              ["Official · Validated", count(officialCounts, "VALIDATED"), "VALIDATED"],
              ["Project · Submitted", count(projectCounts, "SUBMITTED"), "SUBMITTED"],
              ["Project · Validated", count(projectCounts, "VALIDATED"), "VALIDATED"],
              ["Project · Confirmed Simulation", count(projectCounts, "CONFIRMED_SIMULATION"), "CONFIRMED"],
            ].map(([label, value, status]) => (
              <div className="list-item" key={label}>
                <div className="list-item-header">
                  <strong>{label}</strong>
                  <span><StatusBadge value={status} /> · {value}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Quick Actions" className="span-5">
          <div className="list-stack">
            {[
              ["Review Enrollments", "/registrar/enrollment"],
              ["Find Student", "/registrar/students"],
              ["Import Official Grades", "/registrar/students"],
              ["View Reports", "/registrar/reports-monitoring"],
            ].map(([label, href]) => (
              <Link key={label} href={href} className="list-item section-link">
                {label} <AppIcon name="arrowRight" className="inline-action-icon" />
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Recent Registrar Activity" subtitle="Traceable Registrar business actions visible through the existing audit history." className="span-8" actions={<LinkButton href="/registrar/reports-monitoring">View History</LinkButton>}>
          <DataTable
            rowKey="id"
            rows={recentActivity.slice(0, 6)}
            emptyMessage="No Registrar activity is visible in the current history."
            columns={[
              { key: "occurredAtLabel", label: "Date & Time" },
              { key: "module", label: "Module" },
              { key: "record_reference", label: "Record" },
              { key: "action", label: "Action" },
            ]}
          />
        </Panel>

        <Panel title="Important Notifications" className="span-4" actions={<LinkButton href="/registrar/notifications">View All</LinkButton>}>
          <div className="list-stack">
            {notifications.map((item) => (
              <Link key={item.id} href={item.relatedHref || "/registrar/notifications"} className="list-item">
                <strong>{item.title}</strong>
                <p>{item.date}</p>
              </Link>
            ))}
            {!notifications.length ? <div className="notice">No Registrar notifications are currently available.</div> : null}
          </div>
        </Panel>

        <Panel title="Project Block Capacity Concerns" subtitle="PROJECT_ONLY blocks at or near configured capacity." className="span-12" actions={<LinkButton href="/registrar/academic-scheduling">View Sections & Schedules</LinkButton>}>
          <DataTable
            rowKey="id"
            rows={capacityConcerns}
            emptyMessage="No project block capacity concerns are currently detected."
            columns={[
              { key: "code", label: "Block Section" },
              { key: "programCode", label: "Program" },
              { key: "yearLevel", label: "Year Level" },
              { key: "capacity", label: "Capacity" },
              { key: "assigned", label: "Assigned Students" },
              { key: "remaining", label: "Remaining", render: (row) => Math.max(0, row.capacity - row.assigned) },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
