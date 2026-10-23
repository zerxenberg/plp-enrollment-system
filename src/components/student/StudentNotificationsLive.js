"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button, Card, FilterControl, Modal, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";
import { markAllStudentNotificationsRead, markStudentNotificationRead } from "@/features/students/student-portal-actions";

export default function StudentNotificationsLive({ data }) {
  const [items, setItems] = useState(data.items || []);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const categories = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const visible = items.filter((item) =>
    `${item.title} ${item.message}`.toLowerCase().includes(search.toLowerCase()) &&
    (category === "ALL" || item.category === category) &&
    (statusFilter === "ALL" || (statusFilter === "UNREAD" ? !item.read : item.read)));

  function changeRead(id, read) {
    startTransition(async () => {
      const result = await markStudentNotificationRead(id, read).catch(() => ({ ok: false }));
      if (!result.ok) {
        setFeedback(result.message || "Unable to update notification.");
        return;
      }
      setItems((current) => current.map((item) => item.id === id ? { ...item, read } : item));
      setSelected((current) => current?.id === id ? { ...current, read } : current);
      setFeedback(read ? "Notification marked as read." : "Notification marked as unread.");
    });
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllStudentNotificationsRead().catch(() => ({ ok: false }));
      if (!result.ok) return setFeedback(result.message || "Unable to mark notifications as read.");
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setFeedback("Your notifications were marked as read.");
    });
  }

  return <>
    <PageHeader title="Notifications" description="Enrollment and academic announcements addressed to your account."
      actions={<Button variant="secondary" disabled={pending || !items.some((item) => !item.read)} onClick={markAll}>Mark All as Read</Button>} />
    <Card className="section-card">
      {data.kind !== "ready" ? <div className="notice" role="alert">Notifications are currently unavailable for your verified account.</div> : <>
        <div className="toolbar">
          <SearchControl value={search} onChange={setSearch} placeholder="Search notifications" />
          <FilterControl label="Category" value={category} onChange={setCategory}
            options={[{ value: "ALL", label: "All categories" }, ...categories.map((v) => ({ value: v, label: v }))]} />
          <FilterControl label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[{ value: "ALL", label: "All" }, { value: "UNREAD", label: "Unread" }, { value: "READ", label: "Read" }]} />
        </div>
        {feedback && <div className="notice" role="status" style={{ marginBottom: 12 }}>{feedback}</div>}
        <div className="list-stack">{visible.map((item) => <article className="list-item notification-entry" key={item.id}>
          <div className="list-item-header"><div><strong>{item.title}</strong><p>{item.date ? new Date(item.date).toLocaleString() : ""} · {item.category}</p></div>
            <StatusBadge value={item.read ? "READ" : "SUBMITTED"} label={item.read ? "Read" : "Unread"} /></div>
          <p>{item.message}</p>
          <div className="action-row" style={{ marginTop: 9 }}>
            <Button variant="secondary" disabled={pending} onClick={() => setSelected(item)}>View Details</Button>
            <Button variant="ghost" disabled={pending} onClick={() => changeRead(item.id, !item.read)}>{item.read ? "Mark as Unread" : "Mark as Read"}</Button>
            {item.relatedHref ? <Link className="portal-button portal-button-secondary" href={item.relatedHref}>Open Related Module</Link> : null}
          </div>
        </article>)}
          {!visible.length && <div className="empty-state"><strong>No notifications found.</strong><p>Only actual notification records appear here.</p></div>}
        </div>
      </>}
    </Card>
    <Modal open={Boolean(selected)} title={selected?.title || "Notification Details"} onClose={() => { if (!pending) setSelected(null); }}
      footer={<><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
        {selected && !selected.read && <Button disabled={pending} onClick={() => changeRead(selected.id, true)}>Mark as Read</Button>}</>}>
      {selected && <><p>{selected.message}</p><p>{selected.category} · {selected.date ? new Date(selected.date).toLocaleString() : ""}</p></>}
    </Modal>
  </>;
}
