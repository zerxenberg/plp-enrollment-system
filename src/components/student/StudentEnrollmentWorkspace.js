"use client";

import { useState, useTransition } from "react";
import {
  Button, Card, DataTable, InternalTabs, Modal, PageHeader, StatusBadge, TableActionButton,
} from "@/components/ui/PortalUI";
import {
  getConfirmedProjectDemonstrationCor,
  getInstitutionalOfficialCor,
  selectInstitutionalEnrollmentSubject,
  startInstitutionalEnrollment,
  submitInstitutionalEnrollment,
  submitPreparedProjectEnrollment,
} from "@/features/students/student-portal-actions";
import { displayCurriculumCode, displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";

function ProjectEnrollment({data}){
  const [pending,startTransition]=useTransition();
  const [feedback,setFeedback]=useState("");
  const [cor,setCor]=useState(null);
  const submit=()=>startTransition(async()=>{
    try{await submitPreparedProjectEnrollment();setFeedback("Your demonstration enrollment was submitted for Registrar review.");}
    catch(error){setFeedback(error?.message||"Enrollment could not be submitted.");}
  });
  const viewCor=()=>startTransition(async()=>{
    try{setCor(await getConfirmedProjectDemonstrationCor());}
    catch(error){setFeedback(error?.message||"Registration demonstration is unavailable.");}
  });
  return <>
    <div className="notice" role="note" style={{marginBottom:16}}>
      Classroom demonstration. This workflow is separate from official institutional enrollment.
    </div>
    <div className="summary-strip" style={{marginBottom:16}}>
      <span>Student: <strong>{data.student.number}</strong></span>
      <span>Program: <strong>{data.student.program}</strong></span>
      <span>Curriculum: <strong>{displayCurriculumCode(data.student.curriculum)}</strong></span>
      <span>Term: <strong>{data.term.label}</strong></span>
    </div>
    {feedback?<div className="notice" role="status" style={{marginBottom:16}}>{feedback}</div>:null}
    <Card className="section-card">
      <div className="section-header"><div><h2>Prepared Subjects</h2><p>Subjects cleared for this classroom enrollment demonstration.</p></div>
        <StatusBadge value={data.simulation?.status||"NOT_STARTED"}/></div>
      <DataTable rows={data.proposedSubjects} rowKey="code" emptyMessage="No prepared subjects are currently available."
        columns={[
          {key:"code",label:"Subject Code",render:(row)=>displaySubjectCode(row.code)},
          {key:"name",label:"Subject"},{key:"units",label:"Units"},
          {key:"section",label:"Section",render:(row)=>row.section||"Not assigned"},
          {key:"eligibility",label:"Eligibility",render:(row)=><StatusBadge value={row.eligibility}/>},
        ]}/>
      <div className="action-row" style={{marginTop:16}}>
        {data.canSubmit?<Button disabled={pending} onClick={submit}>{pending?"Submitting...":"Submit Demonstration Enrollment"}</Button>:null}
        {data.simulation?.status==="CONFIRMED_SIMULATION"
          ?<Button variant="secondary" disabled={pending} onClick={viewCor}>View Registration Demonstration</Button>:null}
      </div>
      {data.blockingReasons?.length?<div className="notice" style={{marginTop:16}}>
        <strong>Current requirements</strong>{data.blockingReasons.map((reason)=><p key={reason}>{reason}</p>)}</div>:null}
    </Card>
    <Modal open={Boolean(cor)} title="Registration Demonstration" onClose={()=>setCor(null)}
      footer={<Button variant="secondary" onClick={()=>setCor(null)}>Close</Button>}>
      {cor?<div className="detail-list">
        <div className="detail-row"><span>Student</span><strong>{cor.student?.student_number}</strong></div>
        <div className="detail-row"><span>Program</span><strong>{cor.student?.program_code}</strong></div>
        <div className="detail-row"><span>Status</span><strong>Confirmed demonstration</strong></div>
      </div>:null}
      <div className="notice" style={{marginTop:14}}>This is not an official PLP Certificate of Registration.</div>
    </Modal>
  </>;
}

function InstitutionalEnrollment({data}){
  const [tab,setTab]=useState("current");
  const [pending,startTransition]=useTransition();
  const [feedback,setFeedback]=useState("");
  const [selectedSubject,setSelectedSubject]=useState(null);
  const [cor,setCor]=useState(data.officialCor||null);

  function run(action,reload=true){
    startTransition(async()=>{
      const result=await action().catch((error)=>({ok:false,message:error?.message||"The action could not be completed."}));
      setFeedback(result?.message||"Action completed.");
      if(result?.ok&&reload){setSelectedSubject(null);window.location.reload();}
    });
  }
  const viewCor=()=>startTransition(async()=>{
    try{setCor(await getInstitutionalOfficialCor(data.enrollment.id));}
    catch(error){setFeedback(error?.message||"Official registration record is unavailable.");}
  });

  return <>
    <div className="summary-strip" style={{marginBottom:16}}>
      <span>Student: <strong>{data.student.number}</strong></span>
      <span>Program: <strong>{data.student.program||"Pending"}</strong></span>
      <span>Curriculum: <strong>{displayCurriculumCode(data.student.curriculum)||"Pending"}</strong></span>
      <span>Term: <strong>{data.term?.label||"Pending"}</strong></span>
    </div>
    {feedback?<div className="notice" role="status" style={{marginBottom:16}}>{feedback}</div>:null}

    <InternalTabs items={[
      {value:"current",label:"Current Enrollment"},
      {value:"history",label:"Enrollment History"},
    ]} selected={tab} onSelect={setTab} label="Student enrollment sections" panelCard>
      {tab==="current"?<>
        <div className="content-grid">
          <Card className="section-card span-5">
            <div className="section-header"><h2>Enrollment Status</h2></div>
            <div className="detail-list">
              <div className="detail-row"><span>Admission</span><StatusBadge value={data.admission?.status||"PENDING"}/></div>
              <div className="detail-row"><span>Student Record</span><StatusBadge value={data.student.status||"ADMITTED"}/></div>
              <div className="detail-row"><span>Enrollment</span><StatusBadge value={data.enrollment?.status||"NOT_STARTED"}/></div>
              <div className="detail-row"><span>Enrollment Period</span><strong>{data.term?.windowOpen?"Open":"Closed"}</strong></div>
            </div>
            {!data.enrollment&&data.canStart?<div className="action-row" style={{marginTop:14}}>
              <Button disabled={pending} onClick={()=>run(startInstitutionalEnrollment)}>{pending?"Starting...":"Start Enrollment"}</Button>
            </div>:null}
            {data.enrollment?.status==="IN_PROGRESS"&&data.canSubmit?<div className="action-row" style={{marginTop:14}}>
              <Button disabled={pending} onClick={()=>run(()=>submitInstitutionalEnrollment(data.enrollment.id))}>
                {pending?"Submitting...":"Submit for Registrar Processing"}
              </Button>
            </div>:null}
            {data.enrollment?.status==="CONFIRMED"?<div className="action-row" style={{marginTop:14}}>
              <Button variant="secondary" disabled={pending} onClick={viewCor}>View Official Registration</Button>
            </div>:null}
          </Card>
          <Card className="section-card span-7">
            <div className="section-header"><div><h2>Current Requirements</h2><p>Your official enrollment depends on these conditions.</p></div></div>
            {data.blockingReasons?.length?<div className="list-stack">
              {data.blockingReasons.map((reason)=><div className="list-item" key={reason}>{reason}</div>)}
            </div>:<div className="notice">Your current enrollment requirements are satisfied.</div>}
          </Card>
        </div>
        <Card className="section-card" style={{marginTop:16}}>
          <div className="section-header"><div><h2>Subjects & Class Sections</h2>
            <p>Only cleared subjects and finalized institutional class sections can be selected.</p></div></div>
          <DataTable rows={data.subjects} rowKey="code" emptyMessage="No subjects are currently prepared for this enrollment."
            columns={[
              {key:"code",label:"Subject Code",render:(row)=>displaySubjectCode(row.code)},
              {key:"name",label:"Subject"},{key:"units",label:"Units"},
              {key:"eligibility",label:"Eligibility",render:(row)=><StatusBadge value={row.eligibility}/>},
              {key:"selection",label:"Selection",render:(row)=>row.selectedSectionId?"Selected":
                row.sections.length?`${row.sections.length} section${row.sections.length===1?"":"s"}`:"No finalized section"},
              {key:"action",label:"Action",render:(row)=>
                data.canEdit&&["ELIGIBLE","RETAKE"].includes(row.eligibility)&&row.sections.length
                  ?<TableActionButton onClick={()=>setSelectedSubject(row)}>Choose Section</TableActionButton>:null},
            ]}/>
        </Card>
      </>:null}

      {tab==="history"?<DataTable rows={data.history} rowKey="id" emptyMessage="No enrollment history is available."
        columns={[
          {key:"term",label:"Academic Term"},{key:"reference",label:"Enrollment Reference"},
          {key:"status",label:"Status",render:(row)=><StatusBadge value={row.status}/>},
          {key:"units",label:"Units",render:(row)=>row.units??"Not available"},
          {key:"submittedAt",label:"Submitted"},{key:"confirmedAt",label:"Confirmed"},
        ]}/>:null}
    </InternalTabs>

    <Modal open={Boolean(selectedSubject)}
      title={selectedSubject?`${displaySubjectCode(selectedSubject.code)} · Choose Class Section`:"Choose Class Section"}
      onClose={()=>!pending&&setSelectedSubject(null)}
      footer={<Button variant="secondary" disabled={pending} onClick={()=>setSelectedSubject(null)}>Close</Button>}>
      {selectedSubject?<div className="list-stack">{selectedSubject.sections.map((section)=>
        <div className="list-item" key={section.id}>
          <div className="list-item-header"><div><strong>{section.code}</strong><p>{section.instructor}</p></div>
            <StatusBadge value={section.status}/></div>
          <p>{section.meetings.length?section.meetings.map((m)=>`Day ${m.day} ${m.start}-${m.end} · ${m.room}`).join("; "):"Schedule details are not available."}</p>
          <div className="action-row" style={{marginTop:10}}>
            <Button disabled={pending} onClick={()=>run(()=>selectInstitutionalEnrollmentSubject(
              data.enrollment.id,selectedSubject.code,section.id))}>{pending?"Selecting...":"Select This Section"}</Button>
          </div>
        </div>)}</div>:null}
    </Modal>

    <Modal open={Boolean(cor)} title="Official Registration" onClose={()=>setCor(null)}
      footer={<><Button variant="secondary" onClick={()=>setCor(null)}>Close</Button>
        <Button onClick={()=>window.print()}>Print</Button></>}>
      {cor?<>
        <div className="detail-list">
          <div className="detail-row"><span>Student</span><strong>{cor.student_name}</strong></div>
          <div className="detail-row"><span>Student Number</span><strong>{cor.student_number}</strong></div>
          <div className="detail-row"><span>Academic Term</span><strong>{cor.academic_term}</strong></div>
          <div className="detail-row"><span>Program</span><strong>{cor.program_name}</strong></div>
          <div className="detail-row"><span>Confirmation Reference</span><strong>{cor.confirmation_reference}</strong></div>
        </div>
        <DataTable rows={cor.subjects||[]} rowKey="subject_code" columns={[
          {key:"subject_code",label:"Subject Code",render:(row)=>displaySubjectCode(row.subject_code)},
          {key:"subject_name",label:"Subject"},{key:"units",label:"Units"},
        ]}/>
      </>:null}
    </Modal>
  </>;
}

export default function StudentEnrollmentWorkspace({data}){
  return <>
    <PageHeader title="Enrollment" description="Review your prepared subjects, enrollment status, and registration history."/>
    {data.kind!=="ready"?<Card><div className="notice">Your enrollment information is currently unavailable.</div></Card>
      :data.mode==="institutional"?<InstitutionalEnrollment data={data}/>:<ProjectEnrollment data={data}/>}
  </>;
}
