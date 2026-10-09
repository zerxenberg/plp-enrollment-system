
"use client";

import { useRouter } from "next/navigation";
import { DataTable, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { LinkButton, Metric, Panel } from "@/components/registrar/RegistrarShared";

export default function AcademicCoordinatorDashboard() {
  const router = useRouter();
  const { catalog, registrar, student, academicCoordinatorData, notifications } = useDemoData();

  const activePrograms = catalog.programs.filter((item) => item.status === "Active").length;
  const activeCurricula = academicCoordinatorData.curricula.filter((item) => item.status === "Active").length;
  const activeSubjects = catalog.subjects.filter((item) => item.status !== "Inactive").length;
  const prerequisiteRules = catalog.subjects.reduce((sum, item) => sum + (item.prerequisites?.length || 0), 0);
  const fullSections = registrar.sections.filter((item) => item.confirmed >= item.capacity || item.status === "Full");
  const nearSections = registrar.sections.filter(
    (item) => item.confirmed < item.capacity && item.capacity - item.confirmed <= 5,
  );
  const pendingReviews = registrar.enrollments.filter((item) => item.status === "NEEDS_ACADEMIC_REVIEW");
  const resolvedReviews = registrar.enrollments.filter((item) => item.academicReviewDecision);
  const highDemandSubjects = [...new Set(
    registrar.sections
      .filter((item) => item.capacity - item.confirmed <= 5)
      .map((item) => item.subject),
  )];

  return (
    <>
      <PageHeader
        title="Academic Coordinator Dashboard"
        description="Academic setup, section planning, schedule concerns, academic review requests, enrollment demand, and capacity overview."
        actions={<LinkButton href="/academic-coordinator/academic-review">Review Academic Exceptions</LinkButton>}
      />

      <section className="portal-card hero-card" aria-label="Current academic term">
        <h2>Academic planning at a glance</h2>
        <p>
          Maintain academic structures and make defined academic exception decisions while Registrar
          ownership of official enrollment processing remains unchanged.
        </p>
        <div className="hero-meta">
          <span className="hero-chip">{student.term.label}</span>
          <span className="hero-chip">Enrollment period: {student.term.status}</span>
          <span className="hero-chip">{student.term.enrollmentStart} to {student.term.enrollmentEnd}</span>
        </div>
      </section>

      <div className="stats-grid" style={{ margin: "16px 0" }}>
        <Metric label="Active Programs" value={activePrograms} hint="Approved programs" />
        <Metric label="Active Curriculum Versions" value={activeCurricula} hint="Current academic structures" />
        <Metric label="Active Subjects" value={activeSubjects} hint="Subject catalog" />
        <Metric label="Prerequisite Rules" value={prerequisiteRules} hint="Active relationships" />
        <Metric label="Offered Subjects" value={academicCoordinatorData.offerings.length} hint="Current planning list" />
        <Metric label="Full Sections" value={fullSections.length} hint="No remaining slots" />
        <Metric label="Near Capacity" value={nearSections.length} hint="Five or fewer slots" />
        <Metric label="Pending Reviews" value={pendingReviews.length} hint="Academic decisions required" />
      </div>

      <div className="content-grid">
        <Panel title="Academic Setup Summary" className="span-6">
          <div className="detail-list">
            <div className="detail-row"><span>Active Programs</span><strong>{activePrograms}</strong></div>
            <div className="detail-row"><span>Curriculum Versions</span><strong>{academicCoordinatorData.curricula.length}</strong></div>
            <div className="detail-row"><span>Subjects</span><strong>{catalog.subjects.length}</strong></div>
            <div className="detail-row"><span>Subjects with Prerequisites</span><strong>{catalog.subjects.filter((item) => item.prerequisites?.length).length}</strong></div>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <button className="portal-button portal-button-secondary" type="button" onClick={() => router.push("/academic-coordinator/academic-setup")}>Open Academic Setup</button>
          </div>
        </Panel>

        <Panel title="Current Term Summary" className="span-6">
          <div className="detail-list">
            <div className="detail-row"><span>Academic Year</span><strong>{student.term.academicYear}</strong></div>
            <div className="detail-row"><span>Semester</span><strong>{student.term.semester}</strong></div>
            <div className="detail-row"><span>Academic Term</span><strong>{student.term.label}</strong></div>
            <div className="detail-row"><span>Enrollment Period Status</span><strong><StatusBadge value={student.term.status.toUpperCase()} label={student.term.status} /></strong></div>
          </div>
        </Panel>

        <Panel title="Section Planning Summary" className="span-6">
          <div className="detail-list">
            <div className="detail-row"><span>Planned Sections</span><strong>{registrar.sections.filter((item) => (item.sectionStatus || "Open") === "Planned").length}</strong></div>
            <div className="detail-row"><span>Open Sections</span><strong>{registrar.sections.filter((item) => (item.sectionStatus || "Open") === "Open").length}</strong></div>
            <div className="detail-row"><span>Full Sections</span><strong>{fullSections.length}</strong></div>
            <div className="detail-row"><span>Near Capacity Sections</span><strong>{nearSections.length}</strong></div>
          </div>
        </Panel>

        <Panel title="Academic Review Summary" className="span-6">
          <div className="detail-list">
            <div className="detail-row"><span>Pending Academic Exceptions</span><strong>{pendingReviews.length}</strong></div>
            <div className="detail-row"><span>Cases Awaiting Decision</span><strong>{pendingReviews.length}</strong></div>
            <div className="detail-row"><span>Recently Resolved Cases</span><strong>{resolvedReviews.length}</strong></div>
          </div>
        </Panel>

        <Panel title="Demand Summary" subtitle="Capacity concerns are academic planning signals." className="span-5">
          <div className="detail-list">
            <div className="detail-row"><span>High Demand Subjects</span><strong>{highDemandSubjects.length}</strong></div>
            <div className="detail-row"><span>Full Sections</span><strong>{fullSections.length}</strong></div>
            <div className="detail-row"><span>Subjects Requiring Capacity Review</span><strong>{highDemandSubjects.length}</strong></div>
          </div>
        </Panel>

        <Panel title="Recent Academic Activity" className="span-7">
          <DataTable
            rowKey="id"
            rows={academicCoordinatorData.history.slice(0, 5)}
            columns={[
              { key: "dateTime", label: "Date & Time" },
              { key: "module", label: "Module" },
              { key: "record", label: "Record" },
              { key: "action", label: "Academic Action" },
            ]}
          />
        </Panel>

        <Panel title="Quick Actions" subtitle="Each action opens its existing parent module." className="span-8">
          <div className="action-row">
            <LinkButton href="/academic-coordinator/academic-setup?view=programs">Add Program</LinkButton>
            <LinkButton href="/academic-coordinator/academic-setup?view=curriculum">Create Curriculum Version</LinkButton>
            <LinkButton href="/academic-coordinator/academic-setup?view=subjects">Add Subject</LinkButton>
            <LinkButton href="/academic-coordinator/academic-setup?view=prerequisites">Define Prerequisite</LinkButton>
            <LinkButton href="/academic-coordinator/sections-schedules?view=sections">Create Section</LinkButton>
            <LinkButton href="/academic-coordinator/sections-schedules?view=schedules">Create Class Schedule</LinkButton>
            <LinkButton href="/academic-coordinator/academic-review">Review Academic Exception</LinkButton>
          </div>
        </Panel>

        <Panel title="Academic Alerts" className="span-4" actions={<LinkButton href="/academic-coordinator/notifications">View All</LinkButton>}>
          <div className="list-stack">
            {(notifications["academic-coordinator"] || []).slice(0, 4).map((item) => (
              <div className="list-item" key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.date} · {item.category}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
