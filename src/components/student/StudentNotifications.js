"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, Card, FilterControl, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";

export default function StudentNotifications() {
  const { notifications, markNotification, markAllNotifications } = useDemoData();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [readFilter, setReadFilter] = useState("ALL");

  const rows = useMemo(() => notifications.student.filter((item) => {
    const haystack = `${item.title} ${item.message}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesCategory = category === "ALL" || item.category === category;
    const matchesRead = readFilter === "ALL" || (readFilter === "UNREAD" ? !item.read : item.read);
    return matchesSearch && matchesCategory && matchesRead;
  }), [category, notifications.student, readFilter, search]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Enrollment, academic, and system notices with direct links to the related Student portal page."
        actions={<Button variant="secondary" onClick={() => markAllNotifications("student")}>Mark All as Read</Button>}
      />
      <Card className="section-card">
        <div className="toolbar">
          <SearchControl value={search} onChange={setSearch} placeholder="Search notifications" />
          <FilterControl
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              { value: "ALL", label: "All categories" },
              { value: "Enrollment", label: "Enrollment" },
              { value: "Academic", label: "Academic" },
              { value: "System", label: "System" },
            ]}
          />
          <FilterControl
            label="Status"
            value={readFilter}
            onChange={setReadFilter}
            options={[
              { value: "ALL", label: "All" },
              { value: "UNREAD", label: "Unread" },
              { value: "READ", label: "Read" },
            ]}
          />
        </div>

        <div className="list-stack">
          {rows.map((item) => (
            <article className="list-item" key={item.id}>
              <div className="list-item-header">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.date} • {item.category}</p>
                </div>
                <StatusBadge value={item.read ? "READ" : "IN_PROGRESS"} label={item.read ? "Read" : "Unread"} />
              </div>
              <p>{item.message}</p>
              <div className="action-row" style={{ marginTop: 9 }}>
                <Button variant="ghost" onClick={() => markNotification("student", item.id, !item.read)}>
                  {item.read ? "Mark as Unread" : "Mark as Read"}
                </Button>
                <Link className="portal-button portal-button-secondary" href={item.relatedHref} onClick={() => markNotification("student", item.id)}>
                  Open Related Page
                </Link>
              </div>
            </article>
          ))}
          {!rows.length ? <div className="empty-state"><strong>No notifications found.</strong><p>Try changing the search or filter.</p></div> : null}
        </div>
      </Card>
    </>
  );
}
