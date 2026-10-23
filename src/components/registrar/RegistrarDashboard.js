"use client";

import Link from "next/link";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { DataTable, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import AppIcon from "@/components/ui/AppIcon";
import { Panel, Metric, LinkButton } from "./RegistrarShared";

export default function RegistrarDashboard({ projectRoster }) {
  const { registrar, notifications, student } = useDemoData();
  const { enrollments, students, sections, activity } = registrar;
  const projectAvailable = projectRoster?.kind === "ready" && Array.isArray(projectRoster.students);
  const projectStudents = projectAvailable ? projectRoster.students : [];
  const projectSections = projectAvailable && Array.isArray(projectRoster.sections) ? projectRoster.sections : [];
  const projectWindow = projectRoster?.demoWindow;
  const count = (status) => enrollments.filter((item) => item.status === status).length;
  const pending = count("SUBMITTED");
  const validation = count("FOR_VALIDATION");
  const corrections = count("REQUIRES_CORRECTION");
  const capacitySections = projectAvailable ? projectSections.map((item) => ({
    ...item,
    subject: item.programCode || item.program,
    confirmed: Number(item.confirmed || 0),
    proposed: Number(item.proposed || 0),
    capacity: Number(item.capacity || 0),
  })) : sections;
  const occupancy = (item) => projectAvailable ? item.proposed : item.confirmed;
  const full = capacitySections.filter((item) => item.capacity > 0 && occupancy(item) >= item.capacity);
  const near = capacitySections.filter((item) => item.capacity > 0 && occupancy(item) < item.capacity && item.capacity - occupancy(item) <= 5);

  if (projectRoster && !projectAvailable) return <>
    <PageHeader title="Registrar Dashboard" description="Student records and enrollment review workload." />
    <Panel title="Dashboard records unavailable"><p className="notice warning" role="status">The authorized student cohort could not be loaded. Refresh the page or check your Registrar session.</p></Panel>
  </>;

  return (
    <>
      <PageHeader title="Registrar Dashboard" description="Student records, enrollment review workload, block sections and academic term overview." actions={<LinkButton href="/registrar/enrollment">Open Enrollment Queue</LinkButton>} />
      <section className="portal-card hero-card" aria-label="Current enrollment term">
        <h2>Enrollment operations at a glance</h2>
        {projectAvailable ? <><p>Fictional classroom cohort. Demonstration review and block assignments do not constitute official enrollment.</p><div className="hero-meta"><span className="hero-chip">{projectRoster.term?.label || "TERM-2026-1"}</span><span className="hero-chip">Demonstration window: {projectWindow?.status || "Not available"}</span><span className="hero-chip">{projectWindow?.start_date && projectWindow?.end_date ? `${projectWindow.start_date} to ${projectWindow.end_date}` : "See Enrollment Period"}</span></div></> : <div className="hero-meta"><span className="hero-chip">{student.term.label}</span><span className="hero-chip">Demo period: {student.term.status}</span><span className="hero-chip">{student.term.enrollmentStart} to {student.term.enrollmentEnd}</span></div>}
      </section>
      <div className="stats-grid" style={{ margin: "16px 0" }}>
        <Metric label="Student Records" value={projectAvailable ? projectStudents.length : students.length} hint={projectAvailable ? "Verified fictional roster" : "Available browser demo records"} />
        {projectAvailable ? <>
          <Metric label="Block Sections" value={projectSections.length} hint="Proposed classroom sections" />
          <Metric label="Regular Students" value={projectStudents.filter((item) => item.classification === "REGULAR").length} hint="Fictional academic classification" />
          <Metric label="Irregular Students" value={projectStudents.filter((item) => item.classification === "IRREGULAR").length} hint="Fictional academic classification" />
        </> : <>
        <Metric label="Pending (Submitted)" value={pending} hint="Awaiting Registrar queue processing" />
        <Metric label="For Validation" value={validation} hint="Ready for review" />
        <Metric label="Requires Correction" value={corrections} hint="Returned for student updates" />
        <Metric label="Validated" value={count("VALIDATED")} hint="Ready for confirmation" />
        <Metric label="Confirmed" value={count("CONFIRMED")} hint="Browser demo records only" />
        </>}
        <Metric label="Full Sections" value={full.length} hint="No available slots" />
        <Metric label="Near Capacity" value={near.length} hint="Five or fewer slots remaining" />
      </div>
      <div className="content-grid">
        {!projectAvailable ? null : <Panel title="Classroom Enrollment Status" className="span-7" subtitle="Review active submissions and validation in Enrollment Processing."><p className="notice">Demonstration processing uses separately authorized records. Official confirmations require the institutional enrollment workflow.</p><LinkButton href="/registrar/enrollment">Open Enrollment Processing</LinkButton></Panel>}
        {!projectAvailable ? null : <Panel title="Block Section Student List" className="span-5"><p>{projectStudents.length} fictional students in the current verified project cohort.</p><LinkButton href="/registrar/students">View Student Roster</LinkButton></Panel>}
        {!projectAvailable ? null : <Panel title="Block Section Capacity" className="span-12"><DataTable rowKey="code" rows={[...full,...near.filter((row) => !full.includes(row))]} emptyMessage="No block sections are near their proposed capacity." columns={[{key:"code",label:"Block Section"},{key:"subject",label:"Program"},{key:"capacity",label:"Maximum Capacity"},{key:"proposed",label:"Proposed Students"}]} /></Panel>}
        {!projectAvailable ? <>
        <Panel title="Enrollment Status Overview" className="span-7">
          <div className="list-stack">
            {["SUBMITTED", "FOR_VALIDATION", "NEEDS_ACADEMIC_REVIEW", "REQUIRES_CORRECTION", "VALIDATED", "CONFIRMED"].map((status) => <div className="list-item" key={status}><div className="list-item-header"><StatusBadge value={status} /><strong>{count(status)}</strong></div></div>)}
          </div>
        </Panel>
        <Panel title="Quick Actions" className="span-5">
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
        </> : null}
      </div>
    </>
  );
}
