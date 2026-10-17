"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, FilterControl, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";
import { PanelHeading, Tabs, Feedback } from "./RegistrarShared";

const AUDIENCES = ["All Students", "Selected Program", "Selected Academic Term", "Students Requiring Correction"];

export default function RegistrarNotifications() {
  const { notifications, markNotification, markAllNotifications, catalog, student } = useDemoData();
  const [view, setView] = useState("mine");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [group, setGroup] = useState(AUDIENCES[0]);
  const [program, setProgram] = useState("BSIT");
  const [term, setTerm] = useState(student.term.shortLabel);
  const [announcements, setAnnouncements] = useState([]);
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const visibleNotifications = notifications.registrar.filter((item) =>
    `${item.title} ${item.message} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (readFilter === "ALL" || (readFilter === "UNREAD" ? !item.read : item.read)) &&
    (categoryFilter === "ALL" || item.category === categoryFilter)
  );

  function publish(event) {
    event.preventDefault();
    if (!title.trim() || !message.trim()) {setFeedback("Enter an announcement title and message before publishing.");return;}
    setAnnouncements((current)=>[{id:`announcement-${Date.now()}`,title:title.trim(),message:message.trim(),group,program:group==="Selected Program"?program:null,term,archived:false,date:new Intl.DateTimeFormat("en-PH",{dateStyle:"medium"}).format(new Date())},...current]);
    setFeedback("Announcement added to this Registrar demo session. Publishing to student accounts requires backend integration.");
    setTitle("");setMessage("");setPreview(false);
  }

  return (
    <>
      <PageHeader title="Notifications" description="Registrar messages, enrollment queue reminders and official enrollment announcements." />
      <Tabs selected={view} onSelect={(next)=>{setView(next);setFeedback("");}} label="Notification sections" title="Enrollment Communication" items={[{value:"mine",label:`My Notifications (${notifications.registrar.filter((item)=>!item.read).length} unread)`},{value:"announcements",label:"Enrollment Announcements"}]}>
        {view==="mine" ? <>
          <div className="toolbar">
            <SearchControl value={search} onChange={setSearch} label="Search notifications" placeholder="Search titles, messages or categories" />
            <FilterControl label="Read Status" value={readFilter} onChange={setReadFilter} options={[{value:"ALL",label:"All"},{value:"UNREAD",label:"Unread"},{value:"READ",label:"Read"}]} />
            <FilterControl label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[{value:"ALL",label:"All"},...new Set(notifications.registrar.map((item)=>item.category))].map((item)=>typeof item==="string"?{value:item,label:item}:item)} />
            <Button type="button" variant="ghost" onClick={()=>{setSearch("");setReadFilter("ALL");setCategoryFilter("ALL");}}>Clear Filters</Button>
          </div>
          <div className="action-row" style={{marginBottom:12}}><Button type="button" variant="secondary" onClick={()=>markAllNotifications("registrar")}>Mark All as Read</Button></div>
          <div className="list-stack">{visibleNotifications.map((item)=><article className="list-item notification-entry" key={item.id} id={`notification-${item.id}`} tabIndex={-1}>
            <div className="list-item-header"><strong>{item.title}</strong><StatusBadge value={item.read?"READ":"UNREAD"} label={item.read?"Read":"Unread"} /></div>
            <p>{item.message}</p><p>{item.date} · {item.category}</p>
            <div className="action-row" style={{marginTop:9}}>{!item.read ? <Button type="button" variant="ghost" onClick={()=>markNotification("registrar",item.id)}>Mark as Read</Button> : null}<Link className="portal-button portal-button-secondary" href={item.relatedHref}>Open Related Record</Link></div>
          </article>)}{visibleNotifications.length===0 ? <div className="notice">No notifications match the selected filters.</div> : null}</div>
        </> : null}
        {view==="announcements" ? <>
          <form className="form-grid" onSubmit={publish}>
            <label className="field full">Announcement Title<input required value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="Enrollment schedule announcement" /></label>
            <label className="field full">Message<textarea required value={message} onChange={(event)=>setMessage(event.target.value)} placeholder="Write the enrollment announcement" /></label>
            <label className="field">Recipient Group<select value={group} onChange={(event)=>setGroup(event.target.value)}>{AUDIENCES.map((item)=><option key={item}>{item}</option>)}</select></label>
            <label className="field">Academic Term<input value={term} onChange={(event)=>setTerm(event.target.value)} /></label>
            {group==="Selected Program" ? <label className="field">Program<select value={program} onChange={(event)=>setProgram(event.target.value)}>{catalog.programs.map((item)=><option key={item.code} value={item.code}>{item.code}</option>)}</select></label> : null}
            <div className="field full"><div className="action-row"><Button type="button" variant="secondary" onClick={()=>{setPreview(true);setFeedback("");}}>Preview</Button><Button type="submit">Publish to Demo List</Button><Button type="button" variant="ghost" onClick={()=>{setTitle("");setMessage("");setPreview(false);}}>Clear</Button></div></div>
          </form>
          {preview ? <div className="notice" style={{marginTop:12}}><strong>Preview: {title || "Untitled announcement"}</strong><p>{message || "No message entered"}</p><p>Recipients: {group}{group==="Selected Program"?` (${program})`:""} · Term: {term}</p></div> : null}
          <p className="notice" style={{marginTop:12}}>This frontend demo stores announcements only in the current page session. It does not deliver messages to student accounts.</p>
          <section style={{marginTop:16}}>
            <PanelHeading title="Published Demo Announcements" />
            {announcements.length ? <div className="list-stack">{announcements.map((item)=><article className="list-item" key={item.id}><div className="list-item-header"><strong>{item.title}</strong><StatusBadge value={item.archived?"ARCHIVED":"PUBLISHED"} label={item.archived?"Archived":"Published (Demo)"} /></div><p>{item.message}</p><p>{item.group}{item.program?` (${item.program})`:""} · {item.term} · {item.date}</p><div className="action-row" style={{marginTop:9}}><Button type="button" variant="secondary" disabled={item.archived} onClick={()=>setAnnouncements((current)=>current.map((entry)=>entry.id===item.id?{...entry,archived:true}:entry))}>Archive</Button></div></article>)}</div> : <p className="notice">No demo announcements published yet.</p>}
          </section>
        </> : null}
        <Feedback message={feedback} />
      </Tabs>
    </>
  );
}
