"use client";

import { useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { DataTable, PageHeader, SearchControl, StatusBadge, TableActionButton, TableActions } from "@/components/ui/PortalUI";
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

export default function RegistrarAcademic() {
  const { catalog, registrar, student, blockPlanning } = useDemoData();
  const [view, setView] = useState("term");
  const [search, setSearch] = useState("");
  const [selectedSection, setSelectedSection] = useState(null);
  const match = (value) => `${JSON.stringify(value)} ${displaySubjectCode(value?.code || "")} ${displaySubjectCode(value?.subjectCode || "")}`
    .toLowerCase().includes(search.trim().toLowerCase());

  // Block plans remain Academic Coordinator proposals. Only confirmed Registrar
  // transactions count as official registrations, regardless of planning status.
  const hasPlanning = Boolean(blockPlanning?.blockSections?.length);
  const sectionRows = hasPlanning ? blockPlanning.blockSections.map((section) => {
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
  const scheduleRows = hasPlanning ? blockPlanning.subjectClasses.flatMap((subjectClass) => {
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
  const openDetails = (id) => setSelectedSection(id);

  return (
    <>
      <PageHeader title="Academic & Scheduling" description="Read only reference for academic terms, curricula, published block proposals, class meetings and capacity." />
      <Tabs items={VIEWS} selected={view} onSelect={(next) => { setView(next); setSearch(""); setSelectedSection(null); }} label="Academic reference sections" title="Academic Reference" subtitle="The Academic Coordinator publishes academic plans. The Registrar alone confirms official enrollment.">
        {view !== "term" && view !== "curriculum" ? <div className="toolbar"><SearchControl label={`Search ${view}`} value={search} onChange={setSearch} placeholder={`Search ${view} records`} /></div> : null}
        {view === "term" ? <>
          <div className="info-grid"><Info label="Academic Year" value={student.term.academicYear} /><Info label="Semester" value={student.term.semester} /><Info label="Term" value={student.term.label} /><Info label="Enrollment Status" value={student.term.status} /><Info label="Opening Date" value={student.term.enrollmentStart} /><Info label="Closing Date" value={student.term.enrollmentEnd} /></div>
          <div className="notice" style={{ marginTop: 14 }}>Registrar enrollment period operations require authorized backend persistence and an audit trail. This demo displays the current period without changing shared term configuration.</div>
        </> : null}
        {view === "programs" ? <DataTable rows={catalog.programs.filter(match)} rowKey="code" columns={[{ key: "code", label: "Program Code" }, { key: "name", label: "Program" }, { key: "department", label: "Department" }, { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status.toUpperCase()} /> }, { key: "enrolled", label: "Enrollment Total" }]} /> : null}
        {view === "curriculum" ? <>
          <div className="notice">Curriculum assignments are read only. Program curricula, required subjects and version changes are maintained by the Academic Coordinator.</div>
          <DataTable rowKey="reference" rows={[...new Map(registrar.enrollments.map((entry) => [`${entry.program}:${entry.curriculum}`, { reference: `${entry.program}:${entry.curriculum}`, program: entry.program, curriculum: entry.curriculum, term: entry.term }])).values()]} columns={[{ key: "program", label: "Program" }, { key: "curriculum", label: "Assigned Curriculum Version", render: (row) => displayCurriculumCode(row.curriculum) }, { key: "term", label: "Academic Term" }]} />
        </> : null}
        {view === "subjects" ? <DataTable rowKey="code" rows={catalog.subjects.filter(match)} columns={[{ key: "code", label: "Code", render: (row) => displaySubjectCode(row.code) }, { key: "name", label: "Subject", render: (row) => displaySubjectCode(row.name) }, { key: "units", label: "Units" }, { key: "yearLevel", label: "Year" }, { key: "semester", label: "Term" }, { key: "prerequisites", label: "Prerequisites", render: (row) => row.prerequisites.map(displaySubjectCode).join(", ") || "None" }, { key: "eligibility", label: "Demo Eligibility", render: (row) => <StatusBadge value={row.eligibility} /> }]} /> : null}
        {["sections", "schedules", "capacity"].includes(view) && hasPlanning ? <p className="notice">Academic plans and proposed assignments are references only. Published proposals and available planning slots do not grant enrollment confirmation.</p> : null}
        {view === "sections" ? <DataTable rowKey="id" rows={sections} columns={[
          { key: "code", label: "Block Section" },
          { key: "programCode", label: "Program", render: (row) => row.programCode || row.subject },
          { key: "yearLevel", label: "Year Level", render: (row) => row.yearLevel || "Not recorded" },
          { key: "semester", label: "Semester", render: (row) => row.semester || "Not recorded" },
          { key: "capacity", label: "Capacity" },
          { key: "proposed", label: "Proposed Students", render: (row) => row.proposed ?? "Not tracked" },
          { key: "confirmed", label: "Confirmed" },
          { key: "planStatus", label: "Planning Status" },
          { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openDetails(row.id)}>View Section</TableActionButton></TableActions> },
        ]} /> : null}
        {view === "schedules" ? <DataTable rowKey="id" rows={scheduleRows} columns={[
          { key: "code", label: "Block Section" }, { key: "subjectCode", label: "Subject Code", render: (row) => displaySubjectCode(row.subjectCode || row.subject) },
          { key: "subject", label: "Subject", render: (row) => displaySubjectCode(row.subject || "Not recorded") },
          { key: "schedule", label: "Day & Time" }, { key: "room", label: "Room" },
          { key: "professor", label: "Professor", render: (row) => row.professor || "Not assigned" },
          { key: "status", label: "Plan", render: (row) => hasPlanning ? (row.status === "PUBLISHED" ? "Published proposal" : "Draft proposal") : "Legacy reference" },
          { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openDetails(row.sectionId)}>View Details</TableActionButton></TableActions> },
        ]} /> : null}
        {view === "capacity" ? <DataTable rowKey="id" rows={sections} columns={[
          { key: "code", label: "Block Section" }, { key: "capacity", label: "Maximum Slots" },
          { key: "proposed", label: "Proposed", render: (row) => row.proposed ?? "Not tracked" },
          { key: "confirmed", label: "Registrar Confirmed" },
          { key: "remaining", label: "Unassigned Planning Slots" },
          { key: "planStatus", label: "Plan Status" },
          { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openDetails(row.id)}>View Related Section</TableActionButton></TableActions> },
        ]} /> : null}
      </Tabs>
      {currentSection && ["sections", "schedules", "capacity"].includes(view) ? <div style={{ marginTop: 16 }}><Panel title={`Section Details · ${currentSection.code}`} actions={<button className="table-action" type="button" onClick={() => setSelectedSection(null)}>Close</button>}>
        <Details items={hasPlanning ? [
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
      </Panel></div> : null}
    </>
  );
}
