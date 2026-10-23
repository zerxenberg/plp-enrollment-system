"use client";

import { useMemo, useState } from "react";
import { displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";
import { Button, Card, DataTable, EmptyState, FilterControl, InternalTabs, Modal, PageHeader } from "@/components/ui/PortalUI";

const DAY_LABELS={1:"Monday",2:"Tuesday",3:"Wednesday",4:"Thursday",5:"Friday",6:"Saturday",7:"Sunday"};
const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const TABS=["Weekly Schedule","List View"];

function dayLabel(value){
  if(typeof value==="number"||/^\d+$/.test(String(value||""))) return DAY_LABELS[Number(value)]||String(value);
  return value||"Unspecified";
}
function labelTime(value){
  if(!value) return "Not recorded";
  const parts=String(value).match(/^(\d{1,2}):(\d{2})/);
  if(!parts) return String(value);
  const hour=Number(parts[1]); if(hour>23) return String(value);
  return `${hour%12||12}:${parts[2]} ${hour<12?"AM":"PM"}`;
}
function displayValue(value){return value&&value!=="NOT_RECORDED_IN_SOURCE"?value:"Not recorded";}

export default function StudentClassSchedule({mode="unavailable",officialSchedule}){
  const [view,setView]=useState(TABS[0]),[dayFilter,setDayFilter]=useState("ALL");
  const [subjectFilter,setSubjectFilter]=useState("ALL"),[selected,setSelected]=useState(null);
  const verified=["project","live"].includes(mode);
  const confirmed=verified&&Boolean(officialSchedule?.reference&&officialSchedule?.items?.length);

  const classes=useMemo(()=>{
    if(!confirmed) return [];
    const subjects=new Map((officialSchedule.subjects||[]).map((item)=>[item.subject_code,item]));
    return (officialSchedule.items||[]).map((item,index)=>({
      key:`${item.subject_code}:${item.day_of_week}:${item.start_time}:${index}`,
      code:item.subject_code,name:subjects.get(item.subject_code)?.subject_name||item.subject_code,
      units:subjects.get(item.subject_code)?.units??null,day:dayLabel(item.day_of_week),
      start:labelTime(item.start_time),end:labelTime(item.end_time),
      room:displayValue(item.room),instructor:displayValue(item.professor),
      component:displayValue(item.lecture_lab_type),
    }));
  },[confirmed,officialSchedule]);

  const days=[...new Set([...DAYS.slice(0,5),...classes.map((item)=>item.day)])]
    .sort((a,b)=>(DAYS.indexOf(a)<0?7:DAYS.indexOf(a))-(DAYS.indexOf(b)<0?7:DAYS.indexOf(b)));
  const visibleDays=dayFilter==="ALL"?days:days.filter((day)=>day===dayFilter);
  const subjects=[...new Map(classes.map((item)=>[item.code,{value:item.code,label:`${displaySubjectCode(item.code)} · ${item.name}`}])).values()];
  const filtered=classes.filter((item)=>(dayFilter==="ALL"||item.day===dayFilter)&&
    (subjectFilter==="ALL"||item.code===subjectFilter));

  return <>
    <PageHeader title="Class Schedule" description="View your timetable after official Registrar confirmation."
      actions={confirmed?<Button variant="secondary" onClick={()=>window.print()}>Print Schedule</Button>:null}/>
    {mode==="unavailable"?<Card><EmptyState title="Class schedule unavailable"
      description="Your authenticated Student record could not be verified."/></Card>
      :!confirmed?<Card><EmptyState title="Awaiting confirmed class schedule"
        description={mode==="project"
          ?"A demonstration timetable does not become an official class schedule. An official schedule appears only after an institutional Registrar confirmation."
          :"Your official class schedule becomes available after your enrollment is confirmed by the Registrar."}/></Card>
      :<>
        <div className="summary-strip" style={{marginBottom:16}}>
          <span>Term: <strong>{officialSchedule.term}</strong></span>
          <span>Confirmation Reference: <strong>{officialSchedule.reference}</strong></span>
          <span>Home Block: <strong>{officialSchedule.homeBlock||"Not recorded"}</strong></span>
        </div>
        <InternalTabs items={TABS.map((item)=>({value:item,label:item}))} selected={view}
          onSelect={setView} label="Class schedule views" panelCard>
          <div className="toolbar">
            <FilterControl label="Day" value={dayFilter} onChange={setDayFilter}
              options={[{value:"ALL",label:"All days"},...days.map((day)=>({value:day,label:day}))]}/>
            <FilterControl label="Subject" value={subjectFilter} onChange={setSubjectFilter}
              options={[{value:"ALL",label:"All subjects"},...subjects]}/>
          </div>
          {view===TABS[0]?<div className="table-scroll" role="region" tabIndex={0} aria-label="Weekly class timetable">
            <div className="weekly-schedule-grid">{visibleDays.map((day)=>{
              const items=filtered.filter((item)=>item.day===day);
              return <div className="schedule-day" key={day}><strong>{day}</strong>
                {items.length?items.map((item)=><button key={item.key} type="button" className="schedule-event"
                  onClick={()=>setSelected(item)} style={{display:"block",width:"100%",padding:9,marginTop:7,textAlign:"left",cursor:"pointer"}}>
                  <strong>{displaySubjectCode(item.code)}</strong><span style={{display:"block"}}>{item.start} to {item.end}</span>
                  <span style={{display:"block"}}>{item.room}</span></button>):<span>No class</span>}
              </div>;
            })}</div>
          </div>:<DataTable rows={filtered} rowKey="key" emptyMessage="No confirmed classes match the selected filters."
            onRowClick={setSelected} columns={[
              {key:"code",label:"Subject Code",render:(row)=>displaySubjectCode(row.code)},
              {key:"name",label:"Subject"},{key:"day",label:"Day"},
              {key:"time",label:"Time",render:(row)=>`${row.start} to ${row.end}`},
              {key:"room",label:"Room"},{key:"instructor",label:"Professor"},
            ]}/>}
        </InternalTabs>
        <Modal open={Boolean(selected)} onClose={()=>setSelected(null)}
          title={selected?`${displaySubjectCode(selected.code)} · ${selected.name}`:"Class details"}
          footer={<Button variant="secondary" onClick={()=>setSelected(null)}>Close</Button>}>
          {selected?<div className="info-grid">
            <div className="info-item"><span>Subject</span><strong>{selected.name}</strong></div>
            <div className="info-item"><span>Day</span><strong>{selected.day}</strong></div>
            <div className="info-item"><span>Time</span><strong>{selected.start} to {selected.end}</strong></div>
            <div className="info-item"><span>Room</span><strong>{selected.room}</strong></div>
            <div className="info-item"><span>Professor</span><strong>{selected.instructor}</strong></div>
            <div className="info-item"><span>Class Type</span><strong>{selected.component}</strong></div>
          </div>:null}
        </Modal>
      </>}
  </>;
}
