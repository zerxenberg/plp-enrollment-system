
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
import { getNotificationDestination } from "@/features/notifications/notification-links";
import { Panel } from "@/components/registrar/RegistrarShared";

export default function SystemAdministratorNotifications() {
  const { notifications, markNotification, markAllNotifications } = useDemoData();
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const items = useMemo(() => notifications["system-administrator"] || [], [notifications]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);

  const visible = items.filter((item) =>
    `${item.title} ${item.message} ${item.category}`.toLowerCase().includes(search.toLowerCase()) &&
    (readFilter === "ALL" || (readFilter === "UNREAD" ? !item.read : item.read)) &&
    (categoryFilter === "ALL" || item.category === categoryFilter)
  );

  return (
    <>
      <PageHeader
        title="Technical Alerts"
        description="Integration, security, backup, database, and system health notifications for the System Administrator."
        actions={<Button variant="secondary" disabled={!items.some((item) => !item.read)} onClick={() => markAllNotifications("system-administrator")}>Mark All as Read</Button>}
      />

      <Panel title="System Administrator Notifications" subtitle={`${items.filter((item) => !item.read).length} unread technical alerts.`}>
        <div className="toolbar">
          <SearchControl value={search} onChange={setSearch} label="Search technical alerts" placeholder="Search title, message, or category" />
          <FilterControl label="Read Status" value={readFilter} onChange={setReadFilter} options={[{ value: "ALL", label: "All" }, { value: "UNREAD", label: "Unread" }, { value: "READ", label: "Read" }]} />
          <FilterControl label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[{ value: "ALL", label: "All Categories" }, ...categories.map((item) => ({ value: item, label: item }))]} />
          {(search || readFilter !== "ALL" || categoryFilter !== "ALL") ? <Button variant="ghost" onClick={() => { setSearch(""); setReadFilter("ALL"); setCategoryFilter("ALL"); }}>Clear Filters</Button> : null}
        </div>

        <div className="list-stack">
          {visible.map((item) => {
            const destination = getNotificationDestination("system-administrator", item, "/system-administrator/notifications");
            return (
              <article className="list-item" key={item.id}>
                <div className="list-item-header">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.date} · {item.category}</p>
                  </div>
                  <StatusBadge value={item.read ? "READ" : "UNREAD"} label={item.read ? "Read" : "Unread"} />
                </div>
                <p>{item.message}</p>
                <div className="action-row" style={{ marginTop: 10 }}>
                  <Button variant="ghost" onClick={() => markNotification("system-administrator", item.id, !item.read)}>
                    Mark as {item.read ? "Unread" : "Read"}
                  </Button>
                  {destination !== "/system-administrator/notifications" ? (
                    <Link
                      className="portal-button portal-button-secondary"
                      href={destination}
                      onClick={() => markNotification("system-administrator", item.id)}
                    >
                      Open Related Module
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!visible.length ? <div className="notice">No technical alerts match the selected filters.</div> : null}
        </div>
      </Panel>
    </>
  );
}
