"use client";

import { useMemo, useState } from "react";

import {
  Button,
  DataTable,
  FilterControl,
  InternalTabs,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Panel } from "./RegistrarShared";
import { titleStatus } from "@/features/registrar/registrar-client-utils";

const ALL = "ALL";

function opts(values, label) {
  return [{ value: ALL, label }, ...[...new Set(values.filter(Boolean))].sort().map((value) => ({ value, label: value }))];
}

export default function RegistrarAcademic({ academicData }) {
  const [tab, setTab] = useState("reference");
  const [referenceType, setReferenceType] = useState("curricula");
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState(ALL);
  const [curriculum, setCurriculum] = useState(ALL);
  const [term, setTerm] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selected, setSelected] = useState(null);
  const [selectedKind, setSelectedKind] = useState("");

  const programMap = new Map(academicData.programs.map((item) => [item.code, item]));
  const subjectMap = new Map(academicData.subjects.map((item) => [item.code, item]));
  const termMap = new Map(academicData.terms.map((item) => [item.id, item.label || item.id]));

  const referenceRows = useMemo(() => {
    if (referenceType === "programs") {
      return academicData.programs
        .filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(search.toLowerCase()) && (status === ALL || item.status === status))
        .map((item) => ({ ...item, rowKind: "Program" }));
    }
    if (referenceType === "subjects") {
      return academicData.curriculumSubjects
        .filter((item) =>
          `${item.subject_code} ${subjectMap.get(item.subject_code)?.name || ""}`.toLowerCase().includes(search.toLowerCase()) &&
          (program === ALL || academicData.curricula.find((c) => c.code === item.curriculum_code)?.program_code === program) &&
          (curriculum === ALL || item.curriculum_code === curriculum) &&
          (year === ALL || String(item.year_level) === year))
        .map((item) => ({
          ...item,
          rowKind: "Subject",
          program_code: academicData.curricula.find((c) => c.code === item.curriculum_code)?.program_code || "Not available",
          subject_name: subjectMap.get(item.subject_code)?.name || "Not available",
          units: item.units_override ?? subjectMap.get(item.subject_code)?.units ?? "Not available",
          subject_status: subjectMap.get(item.subject_code)?.status || "Not available",
          prerequisites: academicData.prerequisites.filter((rule) => rule.curriculum_code === item.curriculum_code && rule.subject_code === item.subject_code && rule.is_active).map((rule) => rule.prerequisite_subject_code),
        }));
    }
    return academicData.curricula
      .filter((item) => `${item.code} ${item.name || ""} ${item.program_code}`.toLowerCase().includes(search.toLowerCase()) && (program === ALL || item.program_code === program) && (status === ALL || item.status === status))
      .map((item) => ({ ...item, rowKind: "Curriculum" }));
  }, [academicData, referenceType, search, program, curriculum, year, status]);

  const blockRows = academicData.blocks.filter((item) =>
    `${item.code} ${item.program_code} ${item.curriculum_code}`.toLowerCase().includes(search.toLowerCase()) &&
    (program === ALL || item.program_code === program) &&
    (curriculum === ALL || item.curriculum_code === curriculum) &&
    (term === ALL || item.term_id === term) &&
    (year === ALL || String(item.year_level) === year) &&
    (status === ALL || item.planning_status === status));

  function open(row, kind) {
    setSelected(row);
    setSelectedKind(kind);
  }

  return (
    <>
      <PageHeader title="Academic & Scheduling" description="Read-only reference to Curriculum Project 2026, block sections, class schedules, rooms, professors, and capacity information." />

      <InternalTabs items={[{ value: "reference", label: "Academic Reference" }, { value: "sections", label: "Sections & Schedules" }]} selected={tab} onSelect={(value) => { setTab(value); setSelected(null); setSearch(""); setProgram(ALL); setCurriculum(ALL); setTerm(ALL); setYear(ALL); setStatus(ALL); }} label="Academic and scheduling views">
        {tab === "reference" ? (
          <Panel title="Academic Reference" subtitle="This view shows Curriculum Project 2026. Academic planning changes remain under Academic Coordinator authority.">
            <div className="toolbar">
              <FilterControl label="Reference Type" value={referenceType} onChange={(value) => { setReferenceType(value); setSelected(null); }} options={[{ value: "programs", label: "Programs" }, { value: "curricula", label: "Curricula" }, { value: "subjects", label: "Subjects & Prerequisites" }]} />
              <SearchControl value={search} onChange={setSearch} label="Search academic reference" placeholder="Search code or name" />
              {referenceType !== "programs" ? <FilterControl label="Program" value={program} onChange={setProgram} options={opts(academicData.programs.map((item) => item.code), "All Programs")} /> : null}
              {referenceType === "subjects" ? <><FilterControl label="Curriculum" value={curriculum} onChange={setCurriculum} options={opts(academicData.curricula.map((item) => item.code), "All Curricula")} /><FilterControl label="Year Level" value={year} onChange={setYear} options={opts(academicData.curriculumSubjects.map((item) => String(item.year_level || "")).filter(Boolean), "All Years")} /></> : null}
              {referenceType !== "subjects" ? <FilterControl label="Status" value={status} onChange={setStatus} options={opts((referenceType === "programs" ? academicData.programs : academicData.curricula).map((item) => item.status), "All Statuses")} /> : null}
            </div>

            {referenceType === "programs" ? <DataTable rowKey="code" rows={referenceRows} onRowClick={(row) => open(row, "Program")} columns={[{ key: "code", label: "Program" }, { key: "name", label: "Program Name" }, { key: "organizational_unit_code", label: "College / Department", render: (row) => row.organizational_unit_code || "Not available" }, { key: "status", label: "Status", render: (row) => <StatusBadge value={String(row.status).toUpperCase()} label={row.status} /> }]} /> : null}
            {referenceType === "curricula" ? <DataTable rowKey="code" rows={referenceRows} onRowClick={(row) => open(row, "Curriculum")} columns={[{ key: "code", label: "Curriculum Version" }, { key: "program_code", label: "Program" }, { key: "name", label: "Name", render: (row) => row.name || "Not available" }, { key: "effective_year_start", label: "Effective Year", render: (row) => row.effective_year_start || "Not available" }, { key: "status", label: "Status", render: (row) => <StatusBadge value={String(row.status).toUpperCase()} label={row.status} /> }]} /> : null}
            {referenceType === "subjects" ? <DataTable rowKey={(row) => `${row.curriculum_code}:${row.subject_code}:${row.year_level}:${row.semester}`} rows={referenceRows} onRowClick={(row) => open(row, "Subject")} columns={[{ key: "program_code", label: "Program" }, { key: "curriculum_code", label: "Curriculum" }, { key: "year_level", label: "Year" }, { key: "semester", label: "Semester" }, { key: "subject_code", label: "Subject Code" }, { key: "subject_name", label: "Subject Name" }, { key: "units", label: "Units" }, { key: "subject_status", label: "Status" }]} /> : null}
          </Panel>
        ) : null}

        {tab === "sections" ? (
          <Panel title="Sections & Schedules" subtitle="Reference only. Current Curriculum Project 2026 blocks and linked schedules are shown here.">
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label="Search sections" placeholder="Search block, program, or curriculum" />
              <FilterControl label="Program" value={program} onChange={setProgram} options={opts(academicData.blocks.map((item) => item.program_code), "All Programs")} />
              <FilterControl label="Curriculum" value={curriculum} onChange={setCurriculum} options={opts(academicData.blocks.map((item) => item.curriculum_code), "All Curricula")} />
              <FilterControl label="Academic Term" value={term} onChange={setTerm} options={opts(academicData.blocks.map((item) => item.term_id), "All Terms")} />
              <FilterControl label="Year Level" value={year} onChange={setYear} options={opts(academicData.blocks.map((item) => String(item.year_level || "")).filter(Boolean), "All Years")} />
              <FilterControl label="Planning Status" value={status} onChange={setStatus} options={opts(academicData.blocks.map((item) => item.planning_status), "All Statuses")} />
            </div>
            <DataTable rowKey="id" rows={blockRows} onRowClick={(row) => open(row, "Block")} emptyMessage="No block sections match the selected filters." columns={[
              { key: "code", label: "Block Section" }, { key: "program_code", label: "Program" }, { key: "year_level", label: "Year Level" }, { key: "term_id", label: "Academic Term", render: (row) => termMap.get(row.term_id) || row.term_id }, { key: "capacity", label: "Capacity" }, { key: "projectAssignedCount", label: "Assigned Students" }, { key: "sections", label: "Subject Sections", render: (row) => row.sections.length }, { key: "planning_status", label: "Planning Status", render: (row) => <StatusBadge value={String(row.planning_status).toUpperCase()} label={titleStatus(row.planning_status)} /> },
            ]} />
          </Panel>
        ) : null}
      </InternalTabs>

      <Modal open={Boolean(selected)} title={selectedKind ? `${selectedKind} Details` : "Academic Details"} onClose={() => setSelected(null)} className="registrar-detail-modal" footer={<Button onClick={() => setSelected(null)}>Close</Button>}>
        {selected && selectedKind === "Program" ? <Details items={[["Program Code", selected.code], ["Program Name", selected.name], ["College / Department", selected.organizational_unit_code], ["Status", selected.status]]} /> : null}
        {selected && selectedKind === "Curriculum" ? <Details items={[["Curriculum Code", selected.code], ["Program", `${selected.program_code} · ${programMap.get(selected.program_code)?.name || "Not available"}`], ["Name", selected.name || "Not available"], ["Effective Year", selected.effective_year_start || "Not available"], ["Status", selected.status]]} /> : null}
        {selected && selectedKind === "Subject" ? <><Details items={[["Program", selected.program_code], ["Curriculum", selected.curriculum_code], ["Year Level", selected.year_level], ["Semester", selected.semester], ["Subject", `${selected.subject_code} · ${selected.subject_name}`], ["Units", selected.units], ["Status", selected.subject_status], ["Prerequisites", selected.prerequisites?.length ? selected.prerequisites.join(", ") : "None recorded"]]} /></> : null}
        {selected && selectedKind === "Block" ? <><Details items={[["Block Section", selected.code], ["Program", `${selected.program_code} · ${programMap.get(selected.program_code)?.name || "Not available"}`], ["Curriculum", selected.curriculum_code], ["Year Level", selected.year_level], ["Academic Term", termMap.get(selected.term_id) || selected.term_id], ["Capacity", selected.capacity], ["Assigned Students", selected.projectAssignedCount ?? "Not available"], ["Capacity Remaining", selected.capacity ? Math.max(0, selected.capacity - (selected.projectAssignedCount || 0)) : "Not available"], ["Planning Status", titleStatus(selected.planning_status)]]} /><h3 style={{ marginTop: 18 }}>Subject Sections and Schedule</h3><DataTable rowKey="id" rows={selected.sections || []} emptyMessage="No subject sections are linked to this block." columns={[{ key: "subject_code", label: "Subject Code" }, { key: "subjectName", label: "Subject Name" }, { key: "section_code", label: "Section" }, { key: "instructor", label: "Professor" }, { key: "schedule_status", label: "Schedule Status", render: (row) => titleStatus(row.schedule_status) }, { key: "meetings", label: "Meeting Schedule", render: (row) => row.meetings.length ? row.meetings.map((m) => `Day ${m.day_of_week} ${m.start_time}-${m.end_time} · ${m.roomCode}`).join("; ") : "Not available" }]} /></> : null}
      </Modal>
    </>
  );
}
