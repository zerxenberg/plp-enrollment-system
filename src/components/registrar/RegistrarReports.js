"use client";

import { useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, DataTable, FilterControl, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { Panel, Tabs, Metric, Feedback } from "./RegistrarShared";

const VIEW_OPTIONS = [{value:"reports",label:"Reports"},{value:"statistics",label:"Enrollment Statistics"},{value:"monitoring",label:"Enrollment Monitoring"},{value:"quality",label:"Data Quality Review"},{value:"history",label:"Registrar Transaction History"}];
const REPORTS = ["Enrollment Report", "Student Enrollment Report", "Enrollment Status Report", "Program Enrollment Report", "Subject Registration Report", "Section Capacity Report", "Academic Term Report"];

function exportCsv(rows, filename) {
  const headings = Object.keys(rows[0] || {message:"No records"});
  const escape = (value) => `"${String(value ?? "").replaceAll('"','""')}"`;
  const csv = [headings.join(","), ...rows.map((row) => headings.map((heading)=>escape(row[heading])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv],{type:"text/csv;charset=utf-8;"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function RegistrarReports() {
  const { registrar, catalog } = useDemoData();
  const [view,setView] = useState("reports");
  const [report,setReport] = useState(REPORTS[0]);
  const [term,setTerm] = useState("ALL");
  const [program,setProgram] = useState("ALL");
  const [status,setStatus] = useState("ALL");
  const [subject,setSubject] = useState("ALL");
  const [section,setSection] = useState("ALL");
  const [preview,setPreview] = useState(false);
  const [message,setMessage] = useState("");
  const enrolled = registrar.enrollments.filter((entry) => (term === "ALL" || entry.term === term) && (program === "ALL" || entry.program === program) && (status === "ALL" || entry.status === status));
  const reportEnrollments = enrolled.filter((entry) => (subject === "ALL" || entry.subjects.some((item)=>item.code===subject)) && (section === "ALL" || entry.subjects.some((item)=>item.section===section)));
  const reportRows = report === "Section Capacity Report" ? registrar.sections.filter((row)=>(section==="ALL" || row.code===section) && (subject==="ALL" || row.subject===subject)).map(({code,subject,capacity,confirmed,status})=>({code,subject,capacity,confirmed,remaining:Math.max(0,capacity-confirmed),status})) :
    report === "Subject Registration Report" ? reportEnrollments.flatMap((entry)=>entry.subjects.filter((item)=>(subject==="ALL" || item.code===subject) && (section==="ALL" || item.section===section)).map((item)=>({enrollment:entry.reference,student:entry.studentName,program:entry.program,term:entry.term,code:item.code,subject:item.name,section:item.section}))) :
    report === "Academic Term Report" ? [...new Set(reportEnrollments.map((entry)=>entry.term))].map((academicTerm)=>({term:academicTerm,enrollments:reportEnrollments.filter((entry)=>entry.term===academicTerm).length,confirmed:reportEnrollments.filter((entry)=>entry.term===academicTerm && entry.status==="CONFIRMED").length})) :
    report === "Program Enrollment Report" ? catalog.programs.filter((item)=>program==="ALL" || program===item.code).map((item)=>({program:item.code,name:item.name,enrollments:reportEnrollments.filter((entry)=>entry.program===item.code).length,confirmed:reportEnrollments.filter((entry)=>entry.program===item.code && entry.status==="CONFIRMED").length})) :
    reportEnrollments.map(({reference,studentNumber,studentName,program,term,units,status,submittedDate,confirmationReference})=>({reference,studentNumber,studentName,program,term,units,status,submittedDate,confirmationReference:confirmationReference || ""}));
  const count = (filter) => enrolled.filter((entry)=>entry.status===filter).length;
  const reportColumns = Object.keys(reportRows[0] || {}).map((key)=>({key,label:key.replace(/([A-Z])/g," $1").replace(/^./, (letter)=>letter.toUpperCase())}));
  const choices = (array) => [{value:"ALL",label:"All"},...new Set(array)].map((item)=>typeof item==="string"?{value:item,label:item.replaceAll("_"," ")}:item);
  const showEnrollmentFilters = view === "statistics" || view === "monitoring" || (view === "reports" && report !== "Section Capacity Report");

  return (
    <>
      <PageHeader title="Reports & Monitoring" description="Generate enrollment summaries, examine workload and review Registrar transaction history." />
      <Panel title="Registrar Reporting" subtitle="Operational enrollment data and student record quality only.">
        <Tabs selected={view} onSelect={(next)=>{setView(next);setMessage("");}} items={VIEW_OPTIONS} />
        {showEnrollmentFilters ? <div className="toolbar">
          <FilterControl label="Academic Term" value={term} onChange={(next)=>{setTerm(next);setPreview(false);}} options={choices(registrar.enrollments.map((entry)=>entry.term))} />
          <FilterControl label="Program" value={program} onChange={(next)=>{setProgram(next);setPreview(false);}} options={choices(registrar.enrollments.map((entry)=>entry.program))} />
          <FilterControl label="Enrollment Status" value={status} onChange={(next)=>{setStatus(next);setPreview(false);}} options={choices(registrar.enrollments.map((entry)=>entry.status))} />
        </div> : null}
        {view==="reports" ? <>
          <div className="toolbar"><FilterControl label="Report Type" value={report} onChange={(next)=>{setReport(next);setPreview(false);}} options={REPORTS.map((item)=>({value:item,label:item}))} />
            <FilterControl label="Subject" value={subject} onChange={(next)=>{setSubject(next);setPreview(false);}} options={choices([...registrar.enrollments.flatMap((entry)=>entry.subjects.map((item)=>item.code)),...registrar.sections.map((item)=>item.subject)])} />
            <FilterControl label="Section" value={section} onChange={(next)=>{setSection(next);setPreview(false);}} options={choices([...registrar.enrollments.flatMap((entry)=>entry.subjects.map((item)=>item.section)),...registrar.sections.map((item)=>item.code)])} />
            <Button type="button" onClick={()=>{setPreview(true);setMessage(`${report} generated from ${reportRows.length} demo records.`);}}>Generate & Preview</Button>
            <Button type="button" variant="secondary" onClick={()=>exportCsv(reportRows,`${report.toLowerCase().replaceAll(" ","-")}.csv`)}>Export Spreadsheet (CSV)</Button>
            <Button type="button" variant="secondary" onClick={()=>window.print()}>Print / Save as PDF</Button>
          </div>
          {preview ? <DataTable rowKey={(row)=>Object.values(row).join(":")} rows={reportRows} columns={reportColumns} emptyMessage="No records meet the report filters." /> : <div className="notice">Select a report and click Generate & Preview to inspect the current filtered data.</div>}
        </> : null}
        {view==="statistics" ? <>
          <div className="stats-grid" style={{marginBottom:14}}><Metric label="Enrollment Transactions" value={enrolled.length} /><Metric label="Confirmed" value={count("CONFIRMED")} /><Metric label="Submitted" value={count("SUBMITTED")} /><Metric label="Requires Correction" value={count("REQUIRES_CORRECTION")} /></div>
          <div className="list-stack">{catalog.programs.map((item)=>{const total=enrolled.filter((entry)=>entry.program===item.code).length;return <div className="chart-row" key={item.code}><span>{item.code} · {total} registrations</span><div className="chart-bar"><span style={{width:`${enrolled.length?100*total/enrolled.length:0}%`}} /></div><strong>{enrolled.length?Math.round(100*total/enrolled.length):0}%</strong></div>;})}</div>
        </> : null}
        {view==="monitoring" ? <><div className="stats-grid" style={{marginBottom:14}}><Metric label="For Validation" value={count("FOR_VALIDATION")} /><Metric label="Needs Academic Review" value={count("NEEDS_ACADEMIC_REVIEW")} /><Metric label="Correction Queue" value={count("REQUIRES_CORRECTION")} /><Metric label="Full Sections" value={registrar.sections.filter((item)=>item.confirmed>=item.capacity).length} /></div><DataTable rowKey="reference" rows={enrolled} columns={[{key:"reference",label:"Reference"},{key:"studentName",label:"Student"},{key:"status",label:"Status",render:(row)=><StatusBadge value={row.status} />},{key:"program",label:"Program"}]} /></> : null}
        {view==="quality" ? <DataTable rowKey="id" rows={registrar.dataQuality} columns={[{key:"issue",label:"Data Quality Issue"},{key:"record",label:"Related Record"},{key:"severity",label:"Severity",render:(row)=><StatusBadge label={row.severity} value={row.severity==="High"?"REQUIRES_CORRECTION":"REQUIRES_REVIEW"} />}]} /> : null}
        {view==="history" ? <DataTable rowKey="id" rows={registrar.activity} columns={[{key:"date",label:"Timestamp"},{key:"registrar",label:"Registrar"},{key:"student",label:"Student"},{key:"reference",label:"Record"},{key:"action",label:"Action"},{key:"previousStatus",label:"Previous State"},{key:"newStatus",label:"Resulting State"},{key:"reason",label:"Reason"}]} /> : null}
        <Feedback message={message} />
      </Panel>
    </>
  );
}
