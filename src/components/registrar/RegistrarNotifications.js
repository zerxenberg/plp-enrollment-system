"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  FilterControl,
  InternalTabs,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Panel } from "./RegistrarShared";
import RegistrarActionResultModal from "./RegistrarActionResultModal";
import {
  markAllRegistrarNotifications,
  markRegistrarNotification,
} from "@/features/registrar/registrar-actions";

export default function RegistrarNotifications({ notificationsData }) {
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState("notifications");
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [result, setResult] = useState(null);

  const categories = useMemo(
    () => [...new Set(notificationsData.notifications.map((item) => item.category).filter(Boolean))],
    [notificationsData.notifications],
  );

  const visible = notificationsData.notifications.filter((item) => {
    const text = `${item.title} ${item.message} ${item.category}`.toLowerCase();
    return (
      text.includes(search.toLowerCase()) &&
      (readFilter === "ALL" || (readFilter === "READ" ? item.read : !item.read)) &&
      (category === "ALL" || item.category === category)
    );
  });

  function run(action) {
    startTransition(async () => {
      const response = await action();
      setResult(response);
    });
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Live Registrar notifications and the documented Enrollment Announcements workspace."
        actions={
          tab === "notifications" ? (
            <Button
              variant="secondary"
              disabled={isPending || !notificationsData.notifications.some((item) => !item.read)}
              onClick={() => run(markAllRegistrarNotifications)}
            >
              Mark All as Read
            </Button>
          ) : null
        }
      />

      <InternalTabs
        items={[
          { value: "notifications", label: "My Notifications" },
          { value: "announcements", label: "Enrollment Announcements" },
        ]}
        selected={tab}
        onSelect={setTab}
        label="Registrar notification sections"
      >
        {tab === "notifications" ? (
          <Panel title="My Notifications" subtitle="Notification state is persisted through the existing user_notifications table.">
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label="Search notifications" placeholder="Search title, message, or category" />
              <FilterControl
                label="Read Status"
                value={readFilter}
                onChange={setReadFilter}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "UNREAD", label: "Unread" },
                  { value: "READ", label: "Read" },
                ]}
              />
              <FilterControl
                label="Category"
                value={category}
                onChange={setCategory}
                options={[
                  { value: "ALL", label: "All Categories" },
                  ...categories.map((value) => ({ value, label: value })),
                ]}
              />
            </div>

            <div className="list-stack">
              {visible.map((item) => (
                <article className="list-item" key={item.id}>
                  <div className="list-item-header">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.date} · {item.category || "Not available"}</p>
                    </div>
                    <StatusBadge value={item.read ? "READ" : "UNREAD"} label={item.read ? "Read" : "Unread"} />
                  </div>
                  <p>{item.message}</p>
                  <div className="action-row" style={{ marginTop: 10 }}>
                    <Button
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => markRegistrarNotification(item.id, !item.read))}
                    >
                      Mark as {item.read ? "Unread" : "Read"}
                    </Button>
                    {item.relatedHref ? (
                      <Link className="portal-button portal-button-secondary" href={item.relatedHref}>
                        Open Related Record
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
              {!visible.length ? <div className="notice">No notifications match the selected filters.</div> : null}
            </div>
          </Panel>
        ) : null}

        {tab === "announcements" ? (
          <Panel
            title="Enrollment Announcements"
            subtitle="The simplified Registrar doctrine retains this workspace, but publication is not exposed by the current normalized backend."
          >
            <div className="notice warning">
              <strong>Publishing is not connected yet.</strong>
              <p>
                The live notifications table contains only notification content and delivery records. There is no protected Registrar announcement publication or archive contract, and no existing recipient scope metadata. This interface therefore does not create or pretend to publish announcements.
              </p>
            </div>

            <div className="detail-list" style={{ marginTop: 14 }}>
              <div className="detail-row"><span>Compose Announcement</span><strong>Backend gap</strong></div>
              <div className="detail-row"><span>Recipient Selection</span><strong>Backend gap</strong></div>
              <div className="detail-row"><span>Publish</span><strong>Backend gap</strong></div>
              <div className="detail-row"><span>Archive</span><strong>Backend gap</strong></div>
            </div>
          </Panel>
        ) : null}
      </InternalTabs>

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
