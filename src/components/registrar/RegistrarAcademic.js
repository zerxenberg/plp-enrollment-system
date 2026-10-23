"use client";

import { useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { DataTable, InternalTabs, PageHeader, SearchControl, StatusBadge, TableActionButton, TableActions, TablePagination } from "@/components/ui/PortalUI";
import { Panel, Tabs, Info, Details } from "./RegistrarShared";
import { displayCurriculumCode, displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";

const VIEWS = [
  { value: "term", label: "Academic Term & Enrollment Period" },
  { value: "programs", label: "Programs" },
  { value: "curriculum", label: "Curriculum Reference" },
  { value: "subjects", label: "Subjects & Prerequisites" },
  { value: "sections", label: "Sections" },
  { value: "schedules", label: "Class Schedules" },
  { value: "capacity", label: "Section Capacity" },
];
const MAIN_VIEWS = [{ value: "reference", label: "Academic Reference" }, { value: "scheduling", label: "Sections & Schedules" }];

export default function RegistrarAcademic({ projectRoster }) {
  const { catalog, registrar, student, blockPlanning } = useDemoData();
  const [mainView, setMainView] = useState("reference");
  const [view, setView] = useState("term");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedSection, setSelectedSection] = useState(null);
  const projectAvailable = projectRoster?.kind === "ready" && Array.isArray(projectRoster.sections);
  const projectStudents = projectAvailable ? projectRoster.students || [] : [];
  const projectAcademic = projectAvailable ? projectRoster.academic : null;
  const projectWindow = projectAvailable ? projectRoster.demoWindow : null;
  const currentTerm = projectAvailable ? {
    academicYear: projectRoster.term?.label || "Not available",
    semester: projectRoster.term?.semester || "Not available",
    label: projectRoster.term?.label || "TERM-2026-1",
    status: `${projectWindow?.status || "Unavailable"} (classroom demonstration)`,
    enrollmentStart: projectWindow?.start_date || "Not available",
    enrollmentEnd: projectWindow?.end_date || "Not available",
  } : student.term;
  const match = (value) => `${JSON.stringify(value)} ${displaySubjectCode(value?.code || "")} ${displaySubjectCode(value?.subjectCode || "")}`
    .toLowerCase().includes(search.trim().toLowerCase());

  // Block plans remain Academic Coordinator proposals. Only confirmed Registrar
  // transactions count as official registrations, regardless of planning status.
  const hasPlanning = Boolean(blockPlanning?.blockSections?.length);
  const sectionRows = projectAvailable ? projectRoster.sections.map((section) => ({
    ...section,
    id: section.id || section.code,
    code: section.code,
    programCode: section.programCode || section.program,
    proposed: section.proposed ?? 0,
    confirmed: section.confirmed ?? 0,
    remaining: Math.max(0, Number(section.capacity || 0) - Number(section.proposed || 0)),
    planStatus: section.planStatus || "Fictional block proposal",
  })) : hasPlanning ? blockPlanning.blockSections.map((section) => {
    const proposed = blockPlanning.assignments.filter((item) =>
      item.sectionId === section.id && item.status === "PROPOSED").length;
    const confirmed = new Set(registrar.enrollments.filter((enrollment) =>
      enrollment.status === "CONFIRMED" &&
      enrollment.program === section.programCode &&
      enrollment.term === (section.semester === "First Semester" ? "1st Sem " : "2nd Sem ") + section.academicYear.slice(0, 4) &&
      enrollment.subjects.some((subject) => subject.section === section.code)
    ).map((enrollment) => enrollment.studentNumber)).size;
    return {
      ...section, proposed, confirmed,
      planStatus: section.status === "PUBLISHED" ? "Published proposal" : "Draft proposal",
      remaining: Math.max(0, section.capacity - proposed),
    };
  }) : registrar.sections.map((section) => ({
    ...section, id: section.code, proposed: null,
    planStatus: "Legacy section reference",
    remaining: Math.max(0, section.capacity - section.confirmed),
  }));
  const currentSection = sectionRows.find((section) => section.id === selectedSection);
  const sections = sectionRows.filter(match);
  const scheduleRows = projectAvailable ? (Array.isArray(projectRoster.schedules) ? projectRoster.schedules : [])
    .map((row, index) => ({ ...row, id: row.id || `${row.code}:${row.subjectCode}:${index}`,
      sectionId: row.sectionId || row.blockId || sectionRows.find((section) => section.code === row.code)?.id,
      status: row.status || "DRAFT" })).filter(match) : hasPlanning ? blockPlanning.subjectClasses.flatMap((subjectClass) => {
    const section = blockPlanning.blockSections.find((item) => item.id === subjectClass.sectionId);
    if (!section) return [];
    const subject = blockPlanning.subjects.find((item) => item.code === subjectClass.subjectCode);
    const professor = blockPlanning.professors.find((item) => item.id === subjectClass.professorId);
    const meetings = blockPlanning.classMeetings.filter((item) => item.subjectClassId === subjectClass.id);
    return (meetings.length ? meetings : [null]).map((meeting) => ({
      id: meeting?.id || subjectClass.id,
      sectionId: section.id, code: section.code,
      term: section.semester + " " + section.academicYear,
      subject: subject?.name || subjectClass.subjectCode,
      subjectCode: subjectClass.subjectCode,
      professor: professor?.name || "Not assigned",
      schedule: meeting ? `${meeting.day} ${meeting.start} to ${meeting.end}` : "Not scheduled",
      room: blockPlanning.rooms.find((room) => room.id === meeting?.roomId)?.name || "Not assigned",
      status: section.status,
    }));
  }).filter(match) : sections.map((section) => ({ ...section, sectionId: section.id }));
  const referencePrograms = projectAvailable ? (projectAcademic?.programs || []).map((row) => ({
    ...row, studentCount: projectStudents.filter((student) => student.program === row.code).length,
  }))
    .filter(match) : catalog.programs.filter(match);
  const referenceCurricula = projectAvailable ? (projectAcademic?.curricula || []).map((row) => ({
    reference: row.code, program: row.program, curriculum: row.code,
    version: row.version, term: projectRoster.term?.label || "TERM-2026-1",
  })) : [...new Map(registrar.enrollments.map((entry) => [`${entry.program}:${entry.curriculum}`, { reference: `${entry.program}:${entry.curriculum}`, program: entry.program, curriculum: entry.curriculum, term: entry.term }])).values()];
  const referenceSubjects = projectAvailable ? (projectAcademic?.subjects || []).filter(match) : catalog.subjects.filter(match);
  const paginated = view === "schedules" ? scheduleRows : view === "subjects" ? referenceSubjects : sections;
  const safePage = Math.min(page, Math.ceil(paginated.length / 25) || 1);
  const visiblePage = paginated.slice((safePage - 1) * 25, safePage * 25);
  const openDetails = (id) => setSelectedSection(id);

  if (projectRoster && !projectAvailable) return <>
    <PageHeader title="Academic & Scheduling" description="Review academic references and authorized classroom block plans." />
    <Panel title="Academic reference unavailable"><p className="notice warning" role="status">The authorized project sections could not be loaded. Refresh the page or check your Registrar session.</p></Panel>
  </>;

  return (
    <>
      <PageHeader title="Academic & Scheduling" description="Review academic references, block sections, schedules and classroom planning capacity." />
      <InternalTabs items={MAIN_VIEWS} selected={mainView} onSelect={(next) => { setMainView(next); setView(next === "reference" ? "term" : "sections"); setSearch(""); setSelectedSection(null); setPage(1); }} label="Registrar academic modules">
      <Tabs items={VIEWS.filter((item) => mainView === "reference" ? ["term", "programs", "curriculum", "subjects"].includes(item.value) : ["sections", "schedules", "capacity"].includes(item.value))} selected={view} onSelect={(next) => { setView(next); setSearch(""); setSelectedSection(null); setPage(1); }} label="Academic reference sections" title={mainView === "reference" ? "Academic Reference" : "Sections & Schedules"} subtitle="Academic plans and student block assignments are for reference. Only Registrar confirmation completes official enrollment.">
        {projectAvailable && mainView === "reference" ? <p className="notice">Programs, assigned curricula, subjects and prerequisites are read from the protected fictional cohort. The Registrar can review these references, while the Academic Coordinator owns academic rule changes.</p> : null}
        {view !== "term" && view !== "curriculum" ? <div className="toolbar"><SearchControl label={`Search ${view}`} value={search} onChange={(next) => { setSearch(next); setPage(1); }} placeholder={`Search ${view} records`} /></div> : null}
        {view === "term" ? <>
          <div className="info-grid"><Info label="Academic Year / Term" value={currentTerm.academicYear} /><Info label="Semester" value={currentTerm.semester} /><Info label="Term" value={currentTerm.label} /><Info label={projectAvailable ? "Demonstration Period" : "Enrollment Status"} value={currentTerm.status} /><Info label="Opening Date" value={currentTerm.enrollmentStart} /><Info label="Closing Date" value={currentTerm.enrollmentEnd} /></div>
          <div className="notice" style={{ marginTop: 14 }}>{projectAvailable ? "Dates above are the protected classroom demonstration window. They do not modify the official academic term." : "Registrar enrollment period operations require authorized backend persistence and an audit trail. This demo displays the current period without changing shared term configuration."}</div>
        </> : null}
        {view === "programs" ? <DataTable rows={referencePrograms} rowKey="code" columns={projectAvailable ? [{key:"code",label:"Program Code"},{key:"name",label:"Program"},{key:"department",label:"Department"},{key:"studentCount",label:"Fictional Student Count"}] : [{ key: "code", label: "Program Code" }, { key: "name", label: "Program" }, { key: "department", label: "Department" }, { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status.toUpperCase()} /> }, { key: "enrolled", label: "Enrollment Total" }]} /> : null}
        {view === "curriculum" ? <>
          <div className="notice">Curriculum assignments are read only. Program curricula, required subjects and version changes are maintained by the Academic Coordinator.</div>
          <DataTable rowKey="reference" rows={referenceCurricula} columns={[{ key: "program", label: "Program" }, { key: "curriculum", label: "Assigned Curriculum Version", render: (row) => displayCurriculumCode(row.curriculum) }, ...(projectAvailable ? [{ key: "version", label: "Version" }] : []), { key: "term", label: "Academic Term" }]} />
        </> : null}
        {view === "subjects" ? <DataTable rowKey="code" rows={visiblePage} columns={projectAvailable ? [{ key: "code", label: "Subject Code", render: (row) => displaySubjectCode(row.code) }, { key: "name", label: "Subject", render: (row) => displaySubjectCode(row.name) }, {key:"units",label:"Units"},{key:"yearLevel",label:"Year Level"},{key:"semester",label:"Semester"},{key:"prerequisites",label:"Prerequisites",render:(row)=>row.prerequisites?.map(displaySubjectCode).join(", ") || "None"}] : [{ key: "code", label: "Code", render: (row) => displaySubjectCode(row.code) }, { key: "name", label: "Subject", render: (row) => displaySubjectCode(row.name) }, { key: "units", label: "Units" }, { key: "yearLevel", label: "Year" }, { key: "semester", label: "Term" }, { key: "prerequisites", label: "Prerequisites", render: (row) => row.prerequisites.map(displaySubjectCode).join(", ") || "None" }, { key: "eligibility", label: "Demo Eligibility", render: (row) => <StatusBadge value={row.eligibility} /> }]} /> : null}
        {["sections", "schedules", "capacity"].includes(view) && (hasPlanning || projectAvailable) ? <p className="notice">{projectAvailable ? "Authorized fictional block records are shown for classroom demonstration. " : ""}Academic plans and proposed assignments are references only. Published proposals and available planning slots do not grant enrollment confirmation.</p> : null}
        {view === "sections" ? <DataTable rowKey="id" rows={visiblePage} columns={[
          { key: "code", label: "Block Section" },
          { key: "programCode", label: "Program", render: (row) => row.programCode || row.subject },
          { key: "yearLevel", label: "Year Level", render: (row) => row.yearLevel || "Not recorded" },
          { key: "semester", label: "Semester", render: (row) => row.semester || "Not recorded" },
          { key: "capacity", label: "Capacity" },
          { key: "proposed", label: "Proposed Students", render: (row) => row.proposed ?? "Not tracked" },
          { key: "confirmed", label: "Confirmed" },
          { key: "planStatus", label: "Planning Status" },
          { key: "students", label: "Block Roster", render: (row) => projectAvailable ? projectRoster.students?.filter((person) => person.blockSection === row.code).length ?? 0 : "Demo data" },
          { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openDetails(row.id)}>View Section</TableActionButton></TableActions> },
        ]} /> : null}
        {view === "schedules" ? <DataTable rowKey="id" rows={visiblePage} columns={[
          { key: "code", label: "Block Section" }, { key: "subjectCode", label: "Subject Code", render: (row) => displaySubjectCode(row.subjectCode || row.subject) },
          { key: "subject", label: "Subject", render: (row) => displaySubjectCode(row.subject || "Not recorded") },
          { key: "schedule", label: "Day & Time" }, { key: "room", label: "Room" },
          { key: "professor", label: "Professor", render: (row) => row.professor || "Not assigned" },
          { key: "status", label: "Plan", render: (row) => projectAvailable ? (row.planStatus || "Fictional schedule") : hasPlanning ? (row.status === "PUBLISHED" ? "Published proposal" : "Draft proposal") : "Legacy reference" },
          { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openDetails(row.sectionId)}>View Details</TableActionButton></TableActions> },
        ]} /> : null}
        {view === "capacity" ? <DataTable rowKey="id" rows={visiblePage} columns={[
          { key: "code", label: "Block Section" }, { key: "capacity", label: "Maximum Slots" },
          { key: "proposed", label: "Proposed", render: (row) => row.proposed ?? "Not tracked" },
          { key: "confirmed", label: "Registrar Confirmed" },
          { key: "remaining", label: "Unassigned Planning Slots" },
          { key: "planStatus", label: "Plan Status" },
          { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openDetails(row.id)}>View Related Section</TableActionButton></TableActions> },
        ]} /> : null}
        {["subjects", "sections", "schedules", "capacity"].includes(view) && paginated.length > 25 ? <TablePagination page={safePage} pageSize={25} total={paginated.length} onPageChange={setPage} label={`${view} pagination`} /> : null}
      </Tabs>
      </InternalTabs>
      {currentSection && ["sections", "schedules", "capacity"].includes(view) ? <div style={{ marginTop: 16 }}><Panel title={`Section Details · ${currentSection.code}`} actions={<button className="table-action" type="button" onClick={() => setSelectedSection(null)}>Close</button>}>
        <Details items={hasPlanning || projectAvailable ? [
          ["Block Section", currentSection.code], ["Program", currentSection.programCode],
          ["Year Level", currentSection.yearLevel], ["Academic Term", `${currentSection.semester} ${currentSection.academicYear}`],
          ["Capacity", currentSection.capacity], ["Proposed Students", currentSection.proposed],
          ["Registrar Confirmed", currentSection.confirmed], ["Available Planning Slots", currentSection.remaining],
          ["Planning Status", currentSection.planStatus],
        ] : [
          ["Subject", currentSection.subject], ["Section", currentSection.code],
          ["Class Schedule", currentSection.schedule], ["Room", currentSection.room],
          ["Capacity", currentSection.capacity], ["Confirmed Students", currentSection.confirmed],
          ["Remaining Slots", currentSection.remaining], ["Capacity Indicator", currentSection.status],
        ]} />
        {projectAvailable ? <div style={{ marginTop: 16 }}><DataTable rowKey="studentNumber" rows={(projectRoster.students || []).filter((person) => person.blockSection === currentSection.code)} emptyMessage="No authorized fictional students are assigned to this block." columns={[{ key: "studentNumber", label: "Student Number" }, { key: "fullName", label: "Fictional Student" }, { key: "classification", label: "Classification" }, { key: "yearLevel", label: "Year Level" }]} /></div> : null}
      </Panel></div> : null}
    </>
  );
}
