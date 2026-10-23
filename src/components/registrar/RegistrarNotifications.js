"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, FilterControl, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";
import { PanelHeading, Tabs, Feedback } from "./RegistrarShared";
import {
  loadRegistrarNotifications, markRegistrarNotification, markAllRegistrarNotifications,
  publishRegistrarAnnouncement,
} from "@/features/notifications/registrar-notifications-actions";

const AUDIENCES = ["All Students", "Selected Program", "Selected Academic Term", "Students Requiring Correction"];
const TERM = "TERM-2026-1";
const DEFAULT = { kind: "loading", notifications: [], announcements: [], programs: [] };
const prettyDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

export default function RegistrarNotifications() {
  const [data, setData] = useState(DEFAULT);
  const [view, setView] = useState("mine");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [group, setGroup] = useState(AUDIENCES[0]);
  const [program, setProgram] = useState("");
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    loadRegistrarNotifications().then((result) => {
      if (!active) return;
      setData(result);
      if (result.programs?.length) setProgram((old) => old || result.programs[0].code);
    }).catch(() => { if (active) setData({ ...DEFAULT, kind: "unavailable" }); });
    return () => { active = false; };
  }, [revision]);

  const notifications = data.notifications || [];
  const visible = notifications.filter((item) =>
    `${item.title} ${item.message} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (readFilter === "ALL" || (readFilter === "UNREAD" ? !item.read : item.read)) &&
    (categoryFilter === "ALL" || item.category === categoryFilter));

  async function run(action) {
    setBusy(true);
    try {
      const result = await action();
      setFeedback(result.ok ? (result.message || "Notification updated.") :
        (result.message || "Unable to update notifications."));
      if (result.ok) setRevision((value) => value + 1);
      return Boolean(result.ok);
    } catch {
      setFeedback("This operation is temporarily unavailable.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function publish(event) {
    event.preventDefault();
    const success = await run(() => publishRegistrarAnnouncement({
      title, message, group, program, term: TERM,
    }));
    if (success) { setTitle(""); setMessage(""); setPreview(false); }
  }
  return (
    <>
      <PageHeader title="Notifications"
        description="Registrar inbox and enrollment announcements for the fictional student cohort." />
      {data.kind === "loading" ? <p className="notice" role="status">Loading notifications…</p> : null}
      {data.kind === "unavailable" ? <p className="notice warning" role="alert">
        Notifications are currently unavailable. Sample messages are not displayed.
      </p> : null}
      {data.kind === "ready" ? <Tabs selected={view} onSelect={(next) => { setView(next); setFeedback(""); }}
        label="Notification sections" title="Enrollment Communication"
        items={[{ value: "mine", label: `My Notifications (${notifications.filter((item) => !item.read).length} unread)` },
          { value: "announcements", label: "Enrollment Announcements" }]}>
        {view === "mine" ? <>
          <div className="toolbar">
            <SearchControl label="Search notifications" value={search} onChange={setSearch}
              placeholder="Search titles, messages or categories" />
            <FilterControl label="Read Status" value={readFilter} onChange={setReadFilter}
              options={[{ value: "ALL", label: "All" }, { value: "UNREAD", label: "Unread" }, { value: "READ", label: "Read" }]} />
            <FilterControl label="Category" value={categoryFilter} onChange={setCategoryFilter}
              options={[{ value: "ALL", label: "All" },
                ...[...new Set(notifications.map((item) => item.category).filter(Boolean))].map((category) => ({ value: category, label: category }))]} />
            <Button type="button" variant="ghost" onClick={() => { setSearch(""); setReadFilter("ALL"); setCategoryFilter("ALL"); }}>
              Clear Filters
            </Button>
          </div>
          <div className="action-row" style={{ marginBottom: 12 }}>
            <Button type="button" variant="secondary" disabled={busy || !notifications.some((item) => !item.read)}
              onClick={() => run(markAllRegistrarNotifications)}>Mark All as Read</Button>
          </div>
          <div className="list-stack">
            {visible.map((item) => <article className="list-item notification-entry"
              id={`notification-${item.id}`} key={item.id} tabIndex={-1}>
              <div className="list-item-header">
                <strong>{item.title}</strong>
                <StatusBadge value={item.read ? "READ" : "UNREAD"} label={item.read ? "Read" : "Unread"} />
              </div>
              <p>{item.message}</p>
              <p>{prettyDate(item.date)} · {item.category}</p>
              <div className="action-row" style={{ marginTop: 9 }}>
                {!item.read ? <Button type="button" variant="ghost" disabled={busy}
                  onClick={() => run(() => markRegistrarNotification(item.id))}>Mark as Read</Button> : null}
                {item.relatedHref ? <Link className="portal-button portal-button-secondary"
                  href={item.relatedHref}>Open Related Record</Link> : null}
              </div>
            </article>)}
            {!visible.length ? <p className="notice">No notifications match the selected filters.</p> : null}
          </div>
        </> : <>
          <p className="notice">Announcements are delivered to the existing fictional student inboxes. No email is sent, and no announcement is represented as an official university notice.</p>
          <form className="form-grid" onSubmit={publish}>
            <label className="field full">Announcement Title
              <input required minLength={3} maxLength={160} value={title}
                onChange={(event) => { setTitle(event.target.value); setPreview(false); }} placeholder="Enrollment schedule reminder" />
            </label>
            <label className="field full">Message
              <textarea required minLength={5} maxLength={3000} value={message}
                onChange={(event) => { setMessage(event.target.value); setPreview(false); }} placeholder="Write the announcement" />
            </label>
            <label className="field">Recipient Group
              <select value={group} onChange={(event) => { setGroup(event.target.value); setPreview(false); }}>
                {AUDIENCES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">Academic Term
              <input readOnly value={TERM} aria-label="Academic term" />
            </label>
            {group === "Selected Program" ? <label className="field">Program
              <select value={program} onChange={(event) => { setProgram(event.target.value); setPreview(false); }}>
                {data.programs.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
              </select>
            </label> : null}
            <div className="field full">
              <div className="action-row">
                <Button type="button" variant="secondary" disabled={busy}
                  onClick={() => { setPreview(true); setFeedback(""); }}>Preview</Button>
                <Button type="submit" disabled={busy || !title.trim() || !message.trim() ||
                  (group === "Selected Program" && !program)}>Publish to Student Inboxes</Button>
                <Button type="button" variant="ghost" disabled={busy}
                  onClick={() => { setTitle(""); setMessage(""); setPreview(false); }}>Clear</Button>
              </div>
            </div>
          </form>
          {preview ? <div className="notice" style={{ marginTop: 12 }}>
            <strong>Preview: {title || "Untitled announcement"}</strong>
            <p>{message || "No message entered"}</p>
            <p>Recipients: {group}{group === "Selected Program" ? ` (${program})` : ""} · Term: {TERM} · Demonstration only</p>
          </div> : null}
          <section style={{ marginTop: 16 }}>
            <PanelHeading title="Published Announcements" subtitle="Sent by your Registrar account" />
            <div className="list-stack">
              {data.announcements.map((item) => <article key={item.id} className="list-item">
                <div className="list-item-header"><strong>{item.title}</strong>
                  <StatusBadge value="PUBLISHED" label="Delivered" /></div>
                <p>{item.message}</p>
                <p>{item.details} · {prettyDate(item.date)} · {item.delivered} recipients</p>
              </article>)}
              {!data.announcements.length ? <p className="notice">No announcements published by this Registrar account yet.</p> : null}
            </div>
          </section>
        </>}
        <Feedback message={feedback} warning={feedback.startsWith("Unable") || feedback.startsWith("No verified")} />
      </Tabs> : null}
    </>
  );
}
