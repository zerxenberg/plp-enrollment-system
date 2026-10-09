"use client";

import Link from "next/link";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getNotificationDestination } from "@/features/notifications/notification-links";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import styles from "./RoleNotifications.module.css";

const ROLE_LABELS = {
  "academic-coordinator": "Academic Coordinator",
  "system-administrator": "System Administrator",
};

export default function RoleNotifications({ role }) {
  const { notifications, markNotification, markAllNotifications } = useDemoData();
  const records = notifications?.[role];
  const isLoading = !Array.isArray(records);
  const notices = isLoading ? [] : records;
  const unreadCount = notices.filter((item) => !item.read).length;
  const listHref = `/${role}/notifications`;
  const roleLabel = ROLE_LABELS[role] || "Portal";

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${roleLabel} notices and alerts. Demo records are stored only for this browser session.`}
        actions={
          <Button
            variant="secondary"
            disabled={isLoading || unreadCount === 0}
            onClick={() => markAllNotifications(role)}
          >
            Mark All as Read
          </Button>
        }
      />
      <Card className="section-card">
        <div className="section-header">
          <div>
            <h2>All Notifications</h2>
            <p>{isLoading ? "Loading notices..." : `${notices.length} total · ${unreadCount} unread`}</p>
          </div>
        </div>
        {isLoading ? (
          <div className="notice" role="status">Loading notifications...</div>
        ) : notices.length === 0 ? (
          <div className="empty-state">
            <strong>No notifications yet.</strong>
            <p>New notices will appear here during this demo session.</p>
          </div>
        ) : (
          <div className="list-stack">
            {notices.map((item) => {
              const destination = getNotificationDestination(role, item, listHref);
              const hasRelatedPage = !destination.startsWith(`${listHref}#`) && destination !== listHref;

              return (
                <article
                  className={`list-item ${styles.entry}`}
                  id={`notification-${item.id}`}
                  key={item.id}
                  tabIndex={-1}
                >
                  <div className="list-item-header">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.date} · {item.category}</p>
                    </div>
                    <StatusBadge
                      value={item.read ? "READ" : "UNREAD"}
                      label={item.read ? "Read" : "Unread"}
                    />
                  </div>
                  <p>{item.message}</p>
                  <div className="action-row" style={{ marginTop: 12 }}>
                    <Button
                      variant="ghost"
                      onClick={() => markNotification(role, item.id, !item.read)}
                    >
                      Mark as {item.read ? "Unread" : "Read"}
                    </Button>
                    {hasRelatedPage ? (
                      <Link
                        className="portal-button portal-button-secondary"
                        href={destination}
                        onClick={() => markNotification(role, item.id)}
                      >
                        Open Related Page
                      </Link>
                    ) : (
                      <span className={styles.detailNote}>Notice details shown above</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
