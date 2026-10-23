"use client";

import { useMemo, useState } from "react";
import {
  Button, Card, DataTable, EmptyState, FilterControl, InternalTabs, Modal,
  PageHeader, SearchControl, StatusBadge, TablePagination,
} from "@/components/ui/PortalUI";
import { displayCurriculumCode, displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";

const TABS=["Academic History","Curriculum Progress"], PAGE_SIZE=20;
function formatUnits(units){
  const number=Number(units);
  return units!=null&&Number.isFinite(number)?number.toLocaleString():"Not recorded";
}
function resultRows(snapshot,isProject){
  const grades=(snapshot.previousResults||[]).map((item,index)=>({
    key:`grade:${item.term}:${item.subject_code}:${index}`,code:item.subject_code,
    name:item.subject_name||item.subject_code,units:item.units,term:item.term||"Not recorded",
    grade:item.grade,status:item.result,
    source:isProject?"Classroom demonstration":"Official PLP academic result",
    note:isProject?"This grade is part of the classroom demonstration dataset."
      :"This result is part of your institutional PLP academic record.",
  }));
  const transfer=(snapshot.transferCredits||[]).map((item,index)=>{
    const decision=item.project_decision||item.decision_status||"PENDING";
    return {
      key:`transfer:${item.target_subject}:${index}`,code:item.target_subject,
      name:snapshot.curriculum.find((row)=>row.code===item.target_subject)?.name||item.target_subject,
      units:item.credited_units,term:isProject?"Transfer demonstration":"Transfer evaluation",grade:null,
      status:decision==="PROJECT_CREDITED"?"CREDITED":decision==="PROJECT_DENIED"?"DENIED":decision,
      source:isProject?"Demonstration transfer evaluation":"PLP transfer evaluation",
      note:item.source_course?`Source course: ${item.source_course}${item.source_institution?` · ${item.source_institution}`:""}`
        :(item.decision_reason||null),
    };
  });
  return [...grades,...transfer].sort((a,b)=>String(b.term).localeCompare(String(a.term))||a.code.localeCompare(b.code));
}
function curriculumRows(snapshot){
  const credited=new Set((snapshot.transferCredits||[]).filter((item)=>
    ["PROJECT_CREDITED","CREDITED"].includes(item.project_decision||item.decision_status)).map((item)=>item.target_subject));
  const completed=new Set((snapshot.previousResults||[]).filter((item)=>item.result==="COMPLETED").map((item)=>item.subject_code));
  const failed=new Set((snapshot.previousResults||[]).filter((item)=>item.result==="FAILED").map((item)=>item.subject_code));
  const incomplete=new Set((snapshot.previousResults||[]).filter((item)=>item.result==="INCOMPLETE").map((item)=>item.subject_code));
  const eligibility=new Map((snapshot.eligibility||[]).map((item)=>[item.subject_code,item]));
  return (snapshot.curriculum||[]).map((row)=>({
    ...row,
    status:credited.has(row.code)?"CREDITED":completed.has(row.code)?"COMPLETED":
      incomplete.has(row.code)?"INCOMPLETE":failed.has(row.code)?"FAILED":
      eligibility.get(row.code)?.eligibility||"NOT_TAKEN",
    reason:eligibility.get(row.code)?.reason||null,
  }));
}

export default function StudentAcademicRecords({mode="unavailable",snapshot}){
  const [tab,setTab]=useState(TABS[0]),[search,setSearch]=useState(""),[term,setTerm]=useState("ALL");
  const [status,setStatus]=useState("ALL"),[year,setYear]=useState("ALL"),[selected,setSelected]=useState(null);
  const [page,setPage]=useState(1),[sort,setSort]=useState("NEWEST");
  const usable=["project","live"].includes(mode)&&snapshot,isProject=mode==="project";
  const history=useMemo(()=>usable?resultRows(snapshot,isProject):[],[usable,snapshot,isProject]);
  const curriculum=useMemo(()=>usable?curriculumRows(snapshot):[],[usable,snapshot]);
  const terms=[...new Set(history.map((i)=>i.term))];
  const statuses=[...new Set(tab===TABS[0]?history.map((i)=>i.status):curriculum.map((i)=>i.status))];

  const filteredHistory=history.filter((i)=>(term==="ALL"||i.term===term)&&(status==="ALL"||i.status===status)&&
    `${i.code} ${displaySubjectCode(i.code)} ${i.name}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a,b)=>sort==="SUBJECT"?a.code.localeCompare(b.code):sort==="OLDEST"
      ?String(a.term).localeCompare(String(b.term)):String(b.term).localeCompare(String(a.term)));
  const filteredCurriculum=curriculum.filter((i)=>(year==="ALL"||String(i.yearLevel)===year)&&
    (status==="ALL"||i.status===status)&&
    `${i.code} ${displaySubjectCode(i.code)} ${i.name}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a,b)=>sort==="SUBJECT"?a.code.localeCompare(b.code):
      Number(a.yearLevel)-Number(b.yearLevel)||String(a.semester).localeCompare(String(b.semester)));
  const currentRows=tab===TABS[0]?filteredHistory:filteredCurriculum;
  const totalPages=Math.max(1,Math.ceil(currentRows.length/PAGE_SIZE)),safePage=Math.max(1,Math.min(page,totalPages));
  const pagedRows=currentRows.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const totalUnits=curriculum.reduce((sum,row)=>sum+(Number(row.units)||0),0);
  const completedUnits=curriculum.reduce((sum,row)=>sum+(["COMPLETED","CREDITED"].includes(row.status)?Number(row.units)||0:0),0);
  const progressPercent=totalUnits?Math.round(100*completedUnits/totalUnits):0;

  if(!usable) return <>
    <PageHeader title="Academic Records" description="Academic history and progress through your assigned curriculum."/>
    <Card><EmptyState title="Academic records unavailable" description="Your Student academic record could not be verified."/></Card>
  </>;

  return <>
    <PageHeader title="Academic Records" description="Academic history and progress through your assigned curriculum."/>
    {isProject?<div className="notice" role="status" style={{marginBottom:16}}>
      Classroom demonstration. Grades and transfer decisions shown here are demonstration records and are not official PLP academic results.
    </div>:null}
    <div className="summary-strip" style={{marginBottom:16}}>
      <span>Student: <strong>{snapshot.studentNumber}</strong></span>
      <span>Program: <strong>{snapshot.program}{snapshot.track?` · ${snapshot.track}`:""}</strong></span>
      <span>Curriculum: <strong>{displayCurriculumCode(snapshot.curriculumCode)}</strong></span>
      <span>Year: <strong>{snapshot.yearLevel||"Pending"}</strong></span>
    </div>
    <InternalTabs items={TABS.map((item)=>({value:item,label:item}))} selected={tab}
      onSelect={(value)=>{setTab(value);setStatus("ALL");setSearch("");setPage(1);}}
      label="Academic record sections" panelCard>
      {tab===TABS[0]?<>
        <div className="toolbar">
          <SearchControl value={search} onChange={(v)=>{setSearch(v);setPage(1);}} placeholder="Search code or subject"/>
          <FilterControl label="Term" value={term} onChange={(v)=>{setTerm(v);setPage(1);}}
            options={[{value:"ALL",label:"All terms"},...terms.map((v)=>({value:v,label:v}))]}/>
          <FilterControl label="Result" value={status} onChange={(v)=>{setStatus(v);setPage(1);}}
            options={[{value:"ALL",label:"All results"},...statuses.map((v)=>({value:v,label:String(v).replaceAll("_"," ")}))]}/>
          <FilterControl label="Sort" value={sort} onChange={setSort}
            options={[{value:"NEWEST",label:"Newest term"},{value:"OLDEST",label:"Oldest term"},{value:"SUBJECT",label:"Subject code"}]}/>
        </div>
        <DataTable rows={pagedRows} rowKey="key"
          emptyMessage={isProject?"No demonstration academic history matches these filters.":"No official PLP academic results or approved transfer credits are available yet."}
          onRowClick={setSelected}
          columns={[
            {key:"code",label:"Code",render:(row)=>displaySubjectCode(row.code)},
            {key:"name",label:"Subject"},{key:"units",label:"Units",render:(row)=>formatUnits(row.units)},
            {key:"term",label:"Term"},{key:"grade",label:"Grade",render:(row)=>row.grade==null?"Not recorded":String(row.grade)},
            {key:"status",label:"Result",render:(row)=><StatusBadge value={row.status}/>},
          ]}/>
      </>:<>
        <div className="summary-strip">
          <span>Assigned Curriculum Units: <strong>{formatUnits(totalUnits)}</strong></span>
          <span>Completed or Credited: <strong>{formatUnits(completedUnits)}</strong></span>
          <span>Completion: <strong>{progressPercent}%</strong></span>
        </div>
        <div className="toolbar" style={{marginTop:16}}>
          <SearchControl value={search} onChange={(v)=>{setSearch(v);setPage(1);}} placeholder="Search curriculum subjects"/>
          <FilterControl label="Year level" value={year} onChange={(v)=>{setYear(v);setPage(1);}}
            options={[{value:"ALL",label:"All years"},...[...new Set(curriculum.map((r)=>String(r.yearLevel)).filter(Boolean))].map((v)=>({value:v,label:`Year ${v}`}))]}/>
          <FilterControl label="Progress" value={status} onChange={(v)=>{setStatus(v);setPage(1);}}
            options={[{value:"ALL",label:"All statuses"},...statuses.map((v)=>({value:v,label:String(v).replaceAll("_"," ")}))]}/>
        </div>
        <DataTable rows={pagedRows} rowKey="code" emptyMessage="No curriculum subjects match these filters."
          onRowClick={setSelected}
          columns={[
            {key:"code",label:"Subject Code",render:(row)=>displaySubjectCode(row.code)},
            {key:"name",label:"Subject"},{key:"yearLevel",label:"Year",render:(row)=>row.yearLevel?`Year ${row.yearLevel}`:"Pending"},
            {key:"semester",label:"Semester"},{key:"units",label:"Units",render:(row)=>formatUnits(row.units)},
            {key:"status",label:"Progress",render:(row)=><StatusBadge value={row.status}/>},
          ]}/>
      </>}
      {currentRows.length>PAGE_SIZE?<TablePagination page={safePage} pageSize={PAGE_SIZE}
        total={currentRows.length} onPageChange={setPage} label="Academic record pages"/>:null}
    </InternalTabs>
    <Modal open={Boolean(selected)} onClose={()=>setSelected(null)}
      title={selected?`${displaySubjectCode(selected.code)} · ${selected.name}`:"Subject details"}
      footer={<Button variant="secondary" onClick={()=>setSelected(null)}>Close</Button>}>
      {selected?<div className="info-grid">
        <div className="info-item"><span>Subject Code</span><strong>{displaySubjectCode(selected.code)}</strong></div>
        <div className="info-item"><span>Units</span><strong>{formatUnits(selected.units)}</strong></div>
        <div className="info-item"><span>Status</span><strong><StatusBadge value={selected.status}/></strong></div>
        {"term" in selected?<><div className="info-item"><span>Term</span><strong>{selected.term}</strong></div>
          <div className="info-item"><span>Grade</span><strong>{selected.grade==null?"Not recorded":selected.grade}</strong></div>
          <div className="info-item"><span>Record Type</span><strong>{selected.source}</strong></div></>:null}
      </div>:null}
      {selected?.note||selected?.reason?<div className="notice" style={{marginTop:14}}>{selected.note||selected.reason}</div>:null}
    </Modal>
  </>;
}
