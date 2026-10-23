"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, DataTable, FilterControl, InternalTabs, Modal, PageHeader, SearchControl, StatusBadge, TableActionButton, TableActions, TablePagination } from "@/components/ui/PortalUI";
import AppIcon from "@/components/ui/AppIcon";
import { Panel, Tabs, Info, Feedback } from "./RegistrarShared";
import RegistrarGradeImports from "./RegistrarGradeImports";
import AcademicFilterBar from "@/components/shared/AcademicFilterBar";
import { ALL_ACADEMIC_FILTERS, filterAcademicRecords, updateAcademicFilters } from "@/features/students/academic-student-filters";
import { displayCurriculumCode } from "@/features/academic/project-academic-display-aliases.mjs";

const ALL = { value: "ALL", label: "All" };

export default function RegistrarStudents({ projectRoster }) {
  const [section, setSection] = useState("list");
  const { registrar, catalog, correctRegistrarStudent } = useDemoData();
  const [search, setSearch] = useState("");
  const [academicFilters, setAcademicFilters] = useState(ALL_ACADEMIC_FILTERS);
  const [studentStatus, setStudentStatus] = useState("ALL");
  const [enrollmentStatus, setEnrollmentStatus] = useState("ALL");
  const [sort, setSort] = useState("name_asc");
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("profile");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [field, setField] = useState("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [blockSection, setBlockSection] = useState("ALL");
  const [projectPage, setProjectPage] = useState(1);
  const projectAvailable = projectRoster?.kind === "ready" && Array.isArray(projectRoster.students);
  const projectStudents = projectAvailable ? projectRoster.students : [];
  const blockOptions = [...new Set(projectStudents.map((row) => row.blockSection).filter(Boolean))].sort();
  const projectFiltered = projectStudents.filter((row) => {
    const term = `${row.studentNumber || ""} ${row.fullName || ""} ${row.program || ""} ${row.blockSection || ""}`.toLowerCase();
    return term.includes(search.trim().toLowerCase()) && (blockSection === "ALL" || row.blockSection === blockSection);
  }).sort((a, b) => sort === "name_desc" ? String(b.fullName || "").localeCompare(String(a.fullName || ""))
    : sort === "student_asc" ? String(a.studentNumber || "").localeCompare(String(b.studentNumber || ""))
    : sort === "student_desc" ? String(b.studentNumber || "").localeCompare(String(a.studentNumber || ""))
    : String(a.fullName || "").localeCompare(String(b.fullName || "")));
  const safeProjectPage = Math.min(projectPage, Math.ceil(projectFiltered.length / 25) || 1);
  const visibleProjectStudents = projectFiltered.slice((safeProjectPage - 1) * 25, safeProjectPage * 25);
  const selectedProject = projectStudents.find((item) => item.studentNumber === selectedId);

  const selected = registrar.students.find((item) => item.studentNumber === selectedId);
  const selectedEnrollments = registrar.enrollments.filter((item) => item.studentNumber === selectedId);
  const options = (key) => [ALL, ...new Set(registrar.students.map((item) => item[key])).values()].map((item) => typeof item === "string" ? { value: item, label: item } : item);
  const statusFiltered = registrar.students.filter((item) => {
    const searchText = `${item.studentNumber} ${item.admissionReference} ${item.fullName} ${item.program}`.toLowerCase();
    return searchText.includes(search.trim().toLowerCase()) &&
      (studentStatus === "ALL" || item.studentStatus === studentStatus) &&
      (enrollmentStatus === "ALL" || (registrar.enrollments.find((entry) => entry.studentNumber === item.studentNumber)?.status || item.enrollmentStatus) === enrollmentStatus);
  });
  const filtered = filterAcademicRecords(statusFiltered, academicFilters, registrar.enrollments, catalog.programs)
    .sort((a, b) => sort === "name_desc" ? b.fullName.localeCompare(a.fullName) : sort === "student_asc" ? a.studentNumber.localeCompare(b.studentNumber) : sort === "student_desc" ? b.studentNumber.localeCompare(a.studentNumber) : a.fullName.localeCompare(b.fullName));
  const changeAcademicFilter = (key, value) => setAcademicFilters((previous) => key ? updateAcademicFilters(previous, key, value) : value);

  function openStudent(number) { setSelectedId(number); setView("profile"); setFeedback(""); }
  function beginCorrection() { setField("email"); setValue(selected?.email || ""); setReason(""); setFeedback(""); setCorrectionOpen(true); }
  function saveCorrection(event) {
    event.preventDefault();
    if (!value.trim() || !reason.trim()) { setFeedback("Enter a corrected value and an audit reason."); return; }
    const success = correctRegistrarStudent(selectedId, field, value.trim(), reason.trim());
    setFeedback(success ? "Authorized change saved in the Registrar transaction history." : "Correction could not be saved.");
    if (success) setCorrectionOpen(false);
  }

  return (
    <>
      <PageHeader title="Students" description="Review block section student lists, official grade imports and import history." />
      <InternalTabs
        items={[{ value: "list", label: "Block Section Student List" }, { value: "import", label: "Official Grades Import" }, { value: "history", label: "Grade Import History" }]}
        selected={section}
        onSelect={setSection}
        label="Registrar Students sections"
      >
      {section === "list" ? <>
      {projectAvailable ? <Panel title="Block Section Student List" subtitle={`${projectFiltered.length} of ${projectStudents.length} authorized fictional student records. Block assignments are proposals and are not official enrollments.`}>
        <div className="toolbar">
          <SearchControl label="Search block students" value={search} onChange={(value) => {setSearch(value);setProjectPage(1);}} placeholder="Search name, student number, program or section" />
          <FilterControl label="Block Section" value={blockSection} onChange={(value) => {setBlockSection(value);setProjectPage(1);}} options={[ALL, ...blockOptions.map((value) => ({ value, label: value }))]} />
          <FilterControl label="Sort By" value={sort} onChange={(value) => {setSort(value);setProjectPage(1);}} options={[{value:"name_asc",label:"Name A to Z"},{value:"name_desc",label:"Name Z to A"},{value:"student_asc",label:"Student Number Ascending"},{value:"student_desc",label:"Student Number Descending"}]} />
          <Button type="button" variant="ghost" onClick={() => { setSearch(""); setBlockSection("ALL"); setSort("name_asc"); setProjectPage(1); }}>Clear Filters</Button>
        </div>
        <DataTable rowKey="studentNumber" rows={visibleProjectStudents} emptyMessage="No students match the selected block section filters." columns={[
          {key:"studentNumber",label:"Student Number"},
          {key:"fullName",label:"Fictional Student"},
          {key:"program",label:"Program"},
          {key:"yearLevel",label:"Year Level"},
          {key:"blockSection",label:"Block Section",render:(row)=>row.blockSection || "Unassigned"},
          {key:"classification",label:"Classification",render:(row)=>row.classification || "Not evaluated"},
          {key:"studentType",label:"Student Type",render:(row)=>row.studentType?.replaceAll("_", " ") || "Not available"},
          {key:"actions",label:"Actions",render:(row)=><TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openStudent(row.studentNumber)}>View Details</TableActionButton></TableActions>},
        ]} />
        {projectFiltered.length > 25 ? <TablePagination page={safeProjectPage} pageSize={25} total={projectFiltered.length} onPageChange={setProjectPage} label="Block section roster pagination" /> : null}
      </Panel> : null}
      {projectAvailable && selectedProject ? <div style={{marginTop:16}}><Panel title={`${selectedProject.fullName} · Demonstration Record`} subtitle="Academic placement reference only. Official grade records and confirmation are managed separately." actions={<Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>Close Details</Button>}>
        <div className="info-grid">{[["Student Number",selectedProject.studentNumber],["Full Name",selectedProject.fullName],["Program",selectedProject.program],["Year Level",selectedProject.yearLevel],["Block Section",selectedProject.blockSection],["Academic Classification",selectedProject.classification],["Student Type",selectedProject.studentType?.replaceAll("_", " ")],["Curriculum",displayCurriculumCode(selectedProject.curriculum)]].map(([label,value])=><Info key={label} label={label} value={value} />)}</div>
      </Panel></div> : null}
      {projectRoster && !projectAvailable ? <Panel title="Student roster unavailable" subtitle="The authorized classroom roster could not be loaded."><p className="notice warning" role="status">Refresh the page or check the Registrar session. No replacement student records are displayed.</p></Panel> : null}
      {!projectRoster ? <>
      <Panel title="Student List" subtitle={`${filtered.length} matching student records. Records originate from the Admission handoff.`}>
        <div className="toolbar">
          <SearchControl label="Search students" value={search} onChange={setSearch} placeholder="Search student name, number or admission reference" />
          <FilterControl label="Student Status" value={studentStatus} onChange={setStudentStatus} options={options("studentStatus")} />
          <FilterControl label="Enrollment Status" value={enrollmentStatus} onChange={setEnrollmentStatus} options={[ALL, ...new Set([...registrar.students.map((item) => item.enrollmentStatus), ...registrar.enrollments.map((item) => item.status)])].map((item) => typeof item === "string" ? {value:item,label:item.replaceAll("_", " ")} : item)} />
          <FilterControl label="Sort By" value={sort} onChange={setSort} options={[{value:"name_asc",label:"Name A to Z"},{value:"name_desc",label:"Name Z to A"},{value:"student_asc",label:"Student Number Ascending"},{value:"student_desc",label:"Student Number Descending"}]} />
          <Button type="button" variant="ghost" onClick={() => { setSearch(""); setAcademicFilters(ALL_ACADEMIC_FILTERS); setStudentStatus("ALL"); setEnrollmentStatus("ALL"); setSort("name_asc"); }}>Clear Filters</Button>
        </div>
        <AcademicFilterBar records={statusFiltered} enrollments={registrar.enrollments} programs={catalog.programs} departments={catalog.departments} value={academicFilters} onChange={changeAcademicFilter} matchingCount={filtered.length} label="Student list academic filters" />
        <DataTable rowKey="studentNumber" rows={filtered} emptyMessage="No student records match the selected filters." columns={[
          {key:"studentNumber",label:"Student Number"},{key:"fullName",label:"Full Name"},{key:"admissionReference",label:"Admission Reference"},{key:"program",label:"Program"},{key:"academicTerm",label:"Academic Term"},{key:"studentStatus",label:"Student Status",render:(row)=><StatusBadge value={row.studentStatus} />},
          {key:"enrollmentStatus",label:"Enrollment",render:(row)=><StatusBadge value={registrar.enrollments.find((entry) => entry.studentNumber === row.studentNumber)?.status || row.enrollmentStatus} />},
          {key:"actions",label:"Actions",render:(row)=><TableActions><TableActionButton icon="eye" tone="view" type="button" onClick={() => openStudent(row.studentNumber)}>View Student</TableActionButton>{registrar.enrollments.some((entry) => entry.studentNumber === row.studentNumber) ? <TableActionButton as={Link} icon="calendar" tone="schedule" href={`/registrar/enrollment?reference=${encodeURIComponent(registrar.enrollments.find((entry) => entry.studentNumber === row.studentNumber).reference)}`}>Open Enrollment</TableActionButton> : null}<TableActionButton icon="history" tone="history" type="button" onClick={() => {openStudent(row.studentNumber);setView("history");}}>View History</TableActionButton></TableActions>}
        ]} />
      </Panel>

      {selected ? <div style={{marginTop:16}}>
        <Tabs selected={view} onSelect={setView} label="Student record sections" title={`${selected.fullName} · Student Profile`} subtitle={`Student ${selected.studentNumber}`} actions={<div className="action-row"><Button type="button" variant="secondary" onClick={beginCorrection}>Edit Authorized Information</Button><Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>Close Profile</Button></div>} items={[{value:"profile",label:"Profile"},{value:"enrollment",label:"Current Enrollment"},{value:"history",label:"Enrollment History"},{value:"records",label:"Record History"}]}>
        {view === "profile" ? <div className="info-grid">{[["Student Number",selected.studentNumber],["Admission Reference",selected.admissionReference],["Full Name",selected.fullName],["Email",selected.email],["Contact Number",selected.contactNumber],["Program",selected.program],["Academic Term",selected.academicTerm],["Student Status",selected.studentStatus]].map(([label,value]) => <Info key={label} label={label} value={value} />)}</div> : null}
        {view === "enrollment" ? selectedEnrollments.length ? <div className="list-stack">{selectedEnrollments.map((entry) => <div className="list-item" key={entry.reference}><div className="list-item-header"><strong>{entry.reference} · {entry.term}</strong><StatusBadge value={entry.status} /></div><p>{entry.units} units · {displayCurriculumCode(entry.curriculum)}</p><Link className="section-link" href={`/registrar/enrollment?reference=${encodeURIComponent(entry.reference)}`}>Review Enrollment <AppIcon name="arrowRight" className="inline-action-icon" /></Link></div>)}</div> : <div className="notice">No enrollment transaction is linked to this demo student.</div> : null}
        {view === "history" ? selectedEnrollments.length ? <DataTable rowKey="reference" rows={selectedEnrollments} columns={[{key:"term",label:"Academic Term"},{key:"program",label:"Program"},{key:"status",label:"Status",render:(row)=><StatusBadge value={row.status} />},{key:"units",label:"Total Units"},{key:"confirmationReference",label:"Confirmation Ref.",render:(row)=>row.confirmationReference || "Not confirmed"},{key:"confirmationDate",label:"Confirmation Date",render:(row)=>row.confirmationDate || "Not confirmed"}]} /> : <div className="notice">No previous term records are available in this demo.</div> : null}
        {view === "records" ? <DataTable rowKey="id" rows={registrar.activity.filter((item) => item.reference === selected.studentNumber || selectedEnrollments.some((entry) => entry.reference === item.reference))} emptyMessage="No record changes are recorded for this student." columns={[{key:"date",label:"Date"},{key:"registrar",label:"Registrar"},{key:"action",label:"Action"},{key:"reason",label:"Reason"}]} /> : null}
        <Feedback message={feedback} />
        </Tabs>
      </div> : null}

      <Modal open={correctionOpen && Boolean(selected)} title="Authorized Student Record Correction" onClose={() => setCorrectionOpen(false)} footer={<><Button variant="ghost" onClick={() => setCorrectionOpen(false)}>Cancel</Button><Button type="submit" form="registrar-student-correction">Save Changes</Button></>}>
        <form id="registrar-student-correction" onSubmit={saveCorrection} className="form-grid">
          <label className="field full">Editable field<select value={field} onChange={(event) => { const next = event.target.value; setField(next); setValue(selected?.[next] || ""); }}><option value="email">Email Address</option><option value="contactNumber">Contact Number</option></select></label>
          <Info label="Current Value" value={selected?.[field]} />
          <label className="field">Corrected Value<input required value={value} onChange={(event) => setValue(event.target.value)} /></label>
          <label className="field full">Correction Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="State the authorized reason for this change" /></label>
        </form>
        <p className="notice" style={{marginTop:12}}>The original value, corrected value, Registrar identity and date are retained in record history.</p>
      </Modal>
      </> : null}
      </> : <RegistrarGradeImports mode={section} onNavigate={setSection} />}
      </InternalTabs>
    </>
  );
}
