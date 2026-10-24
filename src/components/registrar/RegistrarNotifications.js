"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { registrarDebug } from "@/features/registrar/registrar-client-utils";
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

  useEffect(() => {
    if (!notificationsData.announcementsAvailable) {
      registrarDebug("info", "Enrollment Announcements", "Announcement publishing and archive actions are not available in the current Registrar contract.");
    }
  }, [notificationsData.announcementsAvailable]);

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
        description="Registrar notifications and enrollment announcements."
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
          <Panel title="My Notifications" subtitle="Review enrollment-related notices and mark items as read or unread.">
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
            subtitle="Create and publish enrollment announcements when this function becomes available."
          >
            <div className="notice warning">
              <strong>Enrollment announcement publishing is currently unavailable.</strong>
              <p>Please use the existing Registrar communication process until this function is enabled.</p>
            </div>

            <div className="detail-list" style={{ marginTop: 14 }}>
              <div className="detail-row"><span>Compose Announcement</span><strong>Unavailable</strong></div>
              <div className="detail-row"><span>Recipient Selection</span><strong>Unavailable</strong></div>
              <div className="detail-row"><span>Publish</span><strong>Unavailable</strong></div>
              <div className="detail-row"><span>Archive</span><strong>Unavailable</strong></div>
            </div>
          </Panel>
        ) : null}
      </InternalTabs>

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
