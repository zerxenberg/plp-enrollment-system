
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  FilterControl,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Panel } from "@/components/registrar/RegistrarShared";

export default function AcademicCoordinatorNotifications() {
  const { notifications, markNotification, markAllNotifications } = useDemoData();
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const items = useMemo(() => notifications["academic-coordinator"] || [], [notifications]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);

  const visible = items.filter((item) =>
    `${item.title} ${item.message} ${item.category}`.toLowerCase().includes(search.toLowerCase()) &&
    (readFilter === "ALL" || (readFilter === "UNREAD" ? !item.read : item.read)) &&
    (categoryFilter === "ALL" || item.category === categoryFilter)
  );

  return (
    <>
      <PageHeader
        title="Academic Alerts"
        description="Curriculum notices, capacity warnings, schedule warnings, academic review requests, and enrollment period reminders."
      />

      <Panel title="Academic Coordinator Notifications" subtitle={`${items.filter((item) => !item.read).length} unread academic alerts.`}>
        <div className="toolbar">
          <SearchControl value={search} onChange={setSearch} label="Search academic alerts" placeholder="Search title, message, or category" />
          <FilterControl label="Read Status" value={readFilter} onChange={setReadFilter} options={[{ value: "ALL", label: "All" }, { value: "UNREAD", label: "Unread" }, { value: "READ", label: "Read" }]} />
          <FilterControl label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[{ value: "ALL", label: "All" }, ...categories.map((item) => ({ value: item, label: item }))]} />
          <Button variant="ghost" onClick={() => { setSearch(""); setReadFilter("ALL"); setCategoryFilter("ALL"); }}>Clear Filters</Button>
        </div>

        <div className="action-row" style={{ marginBottom: 12 }}>
          <Button variant="secondary" onClick={() => markAllNotifications("academic-coordinator")}>Mark All as Read</Button>
        </div>

        <div className="list-stack">
          {visible.map((item) => (
            <article className="list-item" key={item.id}>
              <div className="list-item-header">
                <strong>{item.title}</strong>
                <StatusBadge value={item.read ? "READ" : "UNREAD"} label={item.read ? "Read" : "Unread"} />
              </div>
              <p>{item.message}</p>
              <p>{item.date} · {item.category}</p>
              <div className="action-row" style={{ marginTop: 9 }}>
                {!item.read ? <Button variant="ghost" onClick={() => markNotification("academic-coordinator", item.id)}>Mark as Read</Button> : null}
                <Link className="portal-button portal-button-secondary" href={item.relatedHref}>Open Related Page</Link>
              </div>
            </article>
          ))}
          {visible.length === 0 ? <div className="notice">No academic alerts match the selected filters.</div> : null}
        </div>
      </Panel>
    </>
  );
}
