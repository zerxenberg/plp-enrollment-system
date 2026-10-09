"use client";

import Link from "next/link";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { DataTable, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import AppIcon from "@/components/ui/AppIcon";
import { Panel, Metric, LinkButton } from "./RegistrarShared";

export default function RegistrarDashboard() {
  const { registrar, notifications, student } = useDemoData();
  const { enrollments, students, sections, activity } = registrar;
  const count = (status) => enrollments.filter((item) => item.status === status).length;
  const pending = count("SUBMITTED");
  const validation = count("FOR_VALIDATION");
  const corrections = count("REQUIRES_CORRECTION");
  const full = sections.filter((item) => item.confirmed >= item.capacity || item.status === "Full");
  const near = sections.filter((item) => item.confirmed < item.capacity && item.capacity - item.confirmed <= 5);

  return (
    <>
      <PageHeader title="Registrar Dashboard" description="Official enrollment operations, student records, validation workload and academic term overview." actions={<LinkButton href="/registrar/enrollment">Open Enrollment Queue</LinkButton>} />
      <section className="portal-card hero-card" aria-label="Current enrollment term">
        <h2>Enrollment operations at a glance</h2>
        <p>Review submitted records, resolve student corrections and confirm validated enrollments.</p>
        <div className="hero-meta"><span className="hero-chip">{student.term.label}</span><span className="hero-chip">Enrollment period: {student.term.status}</span><span className="hero-chip">{student.term.enrollmentStart} to {student.term.enrollmentEnd}</span></div>
      </section>
      <div className="stats-grid" style={{ margin: "16px 0" }}>
        <Metric label="Student Records" value={students.length} hint="Available demo records" />
        <Metric label="Pending (Submitted)" value={pending} hint="Awaiting Registrar queue processing" />
        <Metric label="For Validation" value={validation} hint="Ready for review" />
        <Metric label="Requires Correction" value={corrections} hint="Returned for student updates" />
        <Metric label="Validated" value={count("VALIDATED")} hint="Ready for confirmation" />
        <Metric label="Confirmed" value={count("CONFIRMED")} hint="Officially completed" />
        <Metric label="Full Sections" value={full.length} hint="No available slots" />
        <Metric label="Near Capacity" value={near.length} hint="Five or fewer slots remaining" />
      </div>
      <div className="content-grid">
        <Panel title="Enrollment Status Overview" subtitle="Counts use canonical transaction statuses." className="span-7">
          <div className="list-stack">
            {["SUBMITTED", "FOR_VALIDATION", "NEEDS_ACADEMIC_REVIEW", "REQUIRES_CORRECTION", "VALIDATED", "CONFIRMED"].map((status) => <div className="list-item" key={status}><div className="list-item-header"><StatusBadge value={status} /><strong>{count(status)}</strong></div></div>)}
          </div>
        </Panel>
        <Panel title="Quick Actions" subtitle="Go directly to the owning workflow." className="span-5">
          <div className="list-stack">
            {[["Find Student", "/registrar/students"], ["Review Pending Enrollment", "/registrar/enrollment"], ["View Requires Correction", "/registrar/enrollment"], ["Generate Enrollment Report", "/registrar/reports-monitoring"]].map(([label, href]) => <Link key={href + label} href={href} className="list-item section-link">{label} <AppIcon name="arrowRight" className="inline-action-icon" /></Link>)}
          </div>
        </Panel>
        <Panel title="Recent Enrollment Activity" subtitle="Registrar operations and changes to student records." className="span-8" actions={<LinkButton href="/registrar/reports-monitoring">View History</LinkButton>}>
          <DataTable rowKey="id" rows={activity.slice(0, 5)} columns={[{key:"date",label:"Date & Time"},{key:"student",label:"Student"},{key:"action",label:"Action"},{key:"newStatus",label:"Result",render:(row)=><StatusBadge value={row.newStatus} />}]} />
        </Panel>
        <Panel title="Important Notifications" className="span-4" actions={<LinkButton href="/registrar/notifications">View All</LinkButton>}>
          <div className="list-stack">{notifications.registrar.slice(0, 4).map((item) => <Link key={item.id} href={item.relatedHref} className="list-item"><strong>{item.title}</strong><p>{item.date}</p></Link>)}</div>
        </Panel>
        <Panel title="Section Capacity Concerns" className="span-12" actions={<LinkButton href="/registrar/academic-scheduling">View Sections</LinkButton>}>
          <DataTable rowKey="code" rows={[...full, ...near.filter((item) => !full.includes(item))]} emptyMessage="No capacity concerns in the demo sections." columns={[{key:"code",label:"Section"},{key:"subject",label:"Subject"},{key:"capacity",label:"Maximum Slots"},{key:"confirmed",label:"Confirmed"},{key:"status",label:"Capacity",render:(row)=><StatusBadge value={row.confirmed >= row.capacity ? "FULL" : "NEAR_CAPACITY"} label={row.confirmed >= row.capacity ? "Full" : "Near Capacity"} />}]} />
        </Panel>
      </div>
    </>
  );
}
