"use client";

import { useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { DataTable, PageHeader, SearchControl, StatusBadge, TableActionButton, TableActions } from "@/components/ui/PortalUI";
import { Panel, Tabs, Info, Details } from "./RegistrarShared";

const VIEWS = [
  {value:"term",label:"Academic Term & Enrollment Period"},
  {value:"programs",label:"Programs"},
  {value:"curriculum",label:"Curriculum Reference"},
  {value:"subjects",label:"Subjects & Prerequisites"},
  {value:"sections",label:"Sections"},
  {value:"schedules",label:"Class Schedules"},
  {value:"capacity",label:"Section Capacity"},
];

export default function RegistrarAcademic() {
  const {catalog, registrar, student} = useDemoData();
  const [view, setView] = useState("term");
  const [search, setSearch] = useState("");
  const [selectedSection, setSelectedSection] = useState(null);
  const currentSection = registrar.sections.find((section) => section.code === selectedSection);
  const match = (value) => JSON.stringify(value).toLowerCase().includes(search.toLowerCase());
  const sections = registrar.sections.filter(match);

  return (
    <>
      <PageHeader title="Academic & Scheduling" description="Registrar reference for academic terms, approved curricula, subjects, section schedules and available capacity." />
      <Tabs items={VIEWS} selected={view} onSelect={(next) => {setView(next);setSearch("");}} label="Academic reference sections" title="Academic Reference" subtitle="Academic Coordinator owns curriculum, prerequisite rules, schedule creation and capacity planning.">
        {view !== "term" && view !== "curriculum" ? <div className="toolbar"><SearchControl label={`Search ${view}`} value={search} onChange={setSearch} placeholder={`Search ${view} records`} /></div> : null}
        {view === "term" ? <>
          <div className="info-grid"><Info label="Academic Year" value={student.term.academicYear} /><Info label="Semester" value={student.term.semester} /><Info label="Term" value={student.term.label} /><Info label="Enrollment Status" value={student.term.status} /><Info label="Opening Date" value={student.term.enrollmentStart} /><Info label="Closing Date" value={student.term.enrollmentEnd} /></div>
          <div className="notice" style={{marginTop:14}}>Registrar enrollment period operations require authorized backend persistence and an audit trail. This demo displays the current period without changing shared term configuration.</div>
        </> : null}
        {view === "programs" ? <DataTable rows={catalog.programs.filter(match)} rowKey="code" columns={[{key:"code",label:"Program Code"},{key:"name",label:"Program"},{key:"department",label:"Department"},{key:"status",label:"Status",render:(row)=><StatusBadge value={row.status.toUpperCase()} />},{key:"enrolled",label:"Enrollment Total"}]} /> : null}
        {view === "curriculum" ? <>
          <div className="notice">Curriculum assignments are read only. Program curricula, required subjects and version changes are maintained by the Academic Coordinator.</div>
          <DataTable rowKey="reference" rows={[...new Map(registrar.enrollments.map((entry)=>[`${entry.program}:${entry.curriculum}`,{reference:`${entry.program}:${entry.curriculum}`,program:entry.program,curriculum:entry.curriculum,term:entry.term}])).values()]} columns={[{key:"program",label:"Program"},{key:"curriculum",label:"Assigned Curriculum Version"},{key:"term",label:"Academic Term"}]} />
        </> : null}
        {view === "subjects" ? <DataTable rowKey="code" rows={catalog.subjects.filter(match)} columns={[{key:"code",label:"Code"},{key:"name",label:"Subject"},{key:"units",label:"Units"},{key:"yearLevel",label:"Year"},{key:"semester",label:"Term"},{key:"prerequisites",label:"Prerequisites",render:(row)=>row.prerequisites.join(", ") || "None"},{key:"eligibility",label:"Demo Eligibility",render:(row)=><StatusBadge value={row.eligibility} />}]} /> : null}
        {view === "sections" ? <DataTable rowKey="code" rows={sections} columns={[{key:"code",label:"Section"},{key:"subject",label:"Subject"},{key:"capacity",label:"Capacity"},{key:"confirmed",label:"Confirmed"},{key:"status",label:"Capacity Indicator",render:(row)=><StatusBadge label={row.status} value={row.confirmed >= row.capacity ? "FULL" : "OPEN"} />},{key:"actions",label:"Actions",render:(row)=><TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => setSelectedSection(row.code)}>View Section</TableActionButton></TableActions>}]} /> : null}
        {view === "schedules" ? <DataTable rowKey="code" rows={sections} columns={[{key:"code",label:"Section"},{key:"subject",label:"Subject"},{key:"schedule",label:"Day & Time"},{key:"room",label:"Room"},{key:"actions",label:"Actions",render:(row)=><TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => setSelectedSection(row.code)}>View Details</TableActionButton></TableActions>}]} /> : null}
        {view === "capacity" ? <DataTable rowKey="code" rows={sections} columns={[{key:"code",label:"Section"},{key:"capacity",label:"Maximum"},{key:"confirmed",label:"Confirmed"},{key:"slots",label:"Remaining Slots",render:(row)=>Math.max(0,row.capacity-row.confirmed)},{key:"status",label:"Indicator",render:(row)=><StatusBadge label={row.status} value={row.confirmed >= row.capacity ? "FULL" : "OPEN"} />},{key:"actions",label:"Actions",render:(row)=><TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => setSelectedSection(row.code)}>View Related Section</TableActionButton></TableActions>}]} /> : null}
      </Tabs>
      {currentSection && ["sections","schedules","capacity"].includes(view) ? <div style={{marginTop:16}}><Panel title={`Section Details · ${currentSection.code}`} actions={<button className="table-action" type="button" onClick={() => setSelectedSection(null)}>Close</button>}>
        <Details items={[["Subject",currentSection.subject],["Section",currentSection.code],["Class Schedule",currentSection.schedule],["Room",currentSection.room],["Capacity",currentSection.capacity],["Confirmed Students",currentSection.confirmed],["Remaining Slots",Math.max(0,currentSection.capacity-currentSection.confirmed)],["Capacity Indicator",currentSection.status]]} />
        <p className="notice" style={{marginTop:12}}>Section details are shown for enrollment validation. Creating or changing academic offerings remains an Academic Coordinator function.</p>
      </Panel></div> : null}
    </>
  );
}
