"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, DataTable, FilterControl, Modal, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";
import AppIcon from "@/components/ui/AppIcon";
import { Panel, Tabs, Info, Feedback, Details } from "./RegistrarShared";

const ALL = { value: "ALL", label: "All" };

export default function RegistrarStudents() {
  const { registrar, correctRegistrarStudent } = useDemoData();
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState("ALL");
  const [term, setTerm] = useState("ALL");
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

  const selected = registrar.students.find((item) => item.studentNumber === selectedId);
  const selectedEnrollments = registrar.enrollments.filter((item) => item.studentNumber === selectedId);
  const options = (key) => [ALL, ...new Set(registrar.students.map((item) => item[key])).values()].map((item) => typeof item === "string" ? { value: item, label: item } : item);
  const filtered = registrar.students.filter((item) => {
    const searchText = `${item.studentNumber} ${item.admissionReference} ${item.fullName} ${item.program}`.toLowerCase();
    return searchText.includes(search.trim().toLowerCase()) &&
      (program === "ALL" || item.program === program) &&
      (term === "ALL" || item.academicTerm === term) &&
      (studentStatus === "ALL" || item.studentStatus === studentStatus) &&
      (enrollmentStatus === "ALL" || (registrar.enrollments.find((entry) => entry.studentNumber === item.studentNumber)?.status || item.enrollmentStatus) === enrollmentStatus);
  }).sort((a, b) => sort === "name_desc" ? b.fullName.localeCompare(a.fullName) : sort === "student_asc" ? a.studentNumber.localeCompare(b.studentNumber) : sort === "student_desc" ? b.studentNumber.localeCompare(a.studentNumber) : a.fullName.localeCompare(b.fullName));

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
      <PageHeader title="Students" description="Search official student records, inspect enrollment history and make authorized contact corrections." />
      <Panel title="Student List" subtitle={`${filtered.length} matching student records. Records originate from the Admission handoff.`}>
        <div className="toolbar">
          <SearchControl label="Search students" value={search} onChange={setSearch} placeholder="Search student name, number or admission reference" />
          <FilterControl label="Program" value={program} onChange={setProgram} options={options("program")} />
          <FilterControl label="Academic Term" value={term} onChange={setTerm} options={options("academicTerm")} />
          <FilterControl label="Student Status" value={studentStatus} onChange={setStudentStatus} options={options("studentStatus")} />
          <FilterControl label="Enrollment Status" value={enrollmentStatus} onChange={setEnrollmentStatus} options={[ALL, ...new Set([...registrar.students.map((item) => item.enrollmentStatus), ...registrar.enrollments.map((item) => item.status)])].map((item) => typeof item === "string" ? {value:item,label:item.replaceAll("_", " ")} : item)} />
          <FilterControl label="Sort By" value={sort} onChange={setSort} options={[{value:"name_asc",label:"Name A to Z"},{value:"name_desc",label:"Name Z to A"},{value:"student_asc",label:"Student Number Ascending"},{value:"student_desc",label:"Student Number Descending"}]} />
          <Button type="button" variant="ghost" onClick={() => { setSearch(""); setProgram("ALL"); setTerm("ALL"); setStudentStatus("ALL"); setEnrollmentStatus("ALL"); setSort("name_asc"); }}>Clear Filters</Button>
        </div>
        <DataTable rowKey="studentNumber" rows={filtered} columns={[
          {key:"studentNumber",label:"Student Number"},{key:"fullName",label:"Full Name"},{key:"admissionReference",label:"Admission Reference"},{key:"program",label:"Program"},{key:"academicTerm",label:"Academic Term"},{key:"studentStatus",label:"Student Status",render:(row)=><StatusBadge value={row.studentStatus} />},
          {key:"enrollmentStatus",label:"Enrollment",render:(row)=><StatusBadge value={registrar.enrollments.find((entry) => entry.studentNumber === row.studentNumber)?.status || row.enrollmentStatus} />},
          {key:"actions",label:"Actions",render:(row)=><div className="cell-actions"><button className="table-action" type="button" onClick={() => openStudent(row.studentNumber)}>View Student</button>{registrar.enrollments.some((entry) => entry.studentNumber === row.studentNumber) ? <Link className="table-action" href={`/registrar/enrollment?reference=${encodeURIComponent(registrar.enrollments.find((entry) => entry.studentNumber === row.studentNumber).reference)}`}>Open Enrollment</Link> : null}<button className="table-action" type="button" onClick={() => {openStudent(row.studentNumber);setView("history");}}>View History</button></div>}
        ]} />
      </Panel>

      {selected ? <div style={{marginTop:16}}><Panel title={`${selected.fullName} · Student Profile`} subtitle={`Student ${selected.studentNumber}`} className="span-12" actions={<div className="action-row"><Button type="button" variant="secondary" onClick={beginCorrection}>Edit Authorized Information</Button><Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>Close Profile</Button></div>}>
        <Tabs selected={view} onSelect={setView} items={[{value:"profile",label:"Profile"},{value:"enrollment",label:"Current Enrollment"},{value:"history",label:"Enrollment History"},{value:"records",label:"Record History"}]} />
        {view === "profile" ? <div className="info-grid">{[["Student Number",selected.studentNumber],["Admission Reference",selected.admissionReference],["Full Name",selected.fullName],["Email",selected.email],["Contact Number",selected.contactNumber],["Program",selected.program],["Academic Term",selected.academicTerm],["Student Status",selected.studentStatus]].map(([label,value]) => <Info key={label} label={label} value={value} />)}</div> : null}
        {view === "enrollment" ? selectedEnrollments.length ? <div className="list-stack">{selectedEnrollments.map((entry) => <div className="list-item" key={entry.reference}><div className="list-item-header"><strong>{entry.reference} · {entry.term}</strong><StatusBadge value={entry.status} /></div><p>{entry.units} units · {entry.curriculum}</p><Link className="section-link" href={`/registrar/enrollment?reference=${encodeURIComponent(entry.reference)}`}>Review Enrollment <AppIcon name="arrowRight" className="inline-action-icon" /></Link></div>)}</div> : <div className="notice">No enrollment transaction is linked to this demo student.</div> : null}
        {view === "history" ? selectedEnrollments.length ? <DataTable rowKey="reference" rows={selectedEnrollments} columns={[{key:"term",label:"Academic Term"},{key:"program",label:"Program"},{key:"status",label:"Status",render:(row)=><StatusBadge value={row.status} />},{key:"units",label:"Total Units"},{key:"confirmationReference",label:"Confirmation Ref.",render:(row)=>row.confirmationReference || "Not confirmed"},{key:"confirmationDate",label:"Confirmation Date",render:(row)=>row.confirmationDate || "Not confirmed"}]} /> : <div className="notice">No previous term records are available in this demo.</div> : null}
        {view === "records" ? <DataTable rowKey="id" rows={registrar.activity.filter((item) => item.reference === selected.studentNumber || selectedEnrollments.some((entry) => entry.reference === item.reference))} emptyMessage="No record changes are recorded for this student." columns={[{key:"date",label:"Date"},{key:"registrar",label:"Registrar"},{key:"action",label:"Action"},{key:"reason",label:"Reason"}]} /> : null}
        <Feedback message={feedback} />
      </Panel></div> : null}

      <Modal open={correctionOpen && Boolean(selected)} title="Authorized Student Record Correction" onClose={() => setCorrectionOpen(false)} footer={<><Button variant="ghost" onClick={() => setCorrectionOpen(false)}>Cancel</Button><Button type="submit" form="registrar-student-correction">Save Changes</Button></>}>
        <form id="registrar-student-correction" onSubmit={saveCorrection} className="form-grid">
          <label className="field full">Editable field<select value={field} onChange={(event) => { const next = event.target.value; setField(next); setValue(selected?.[next] || ""); }}><option value="email">Email Address</option><option value="contactNumber">Contact Number</option></select></label>
          <Info label="Current Value" value={selected?.[field]} />
          <label className="field">Corrected Value<input required value={value} onChange={(event) => setValue(event.target.value)} /></label>
          <label className="field full">Correction Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="State the authorized reason for this change" /></label>
        </form>
        <p className="notice" style={{marginTop:12}}>The original value, corrected value, Registrar identity and date are retained in record history.</p>
      </Modal>
    </>
  );
}
