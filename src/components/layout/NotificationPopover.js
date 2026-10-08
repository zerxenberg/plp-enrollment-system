"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import AppIcon from "@/components/ui/AppIcon";
import styles from "./NotificationPopover.module.css";

export default function NotificationPopover({
  role,
  notifications,
  notificationHref,
  utilityLabel = "notifications",
  markNotification,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();
  const isLoading = !Array.isArray(notifications);
  const notices = isLoading ? [] : notifications;
  const unreadCount = notices.filter((item) => !item.read).length;
  const recentNotices = notices.slice(0, 5);
  const allHref = `/${role}/notifications`;
  const label = utilityLabel || "notifications";

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function onFocusLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  function onNotificationClick(item) {
    if (!item.read && typeof markNotification === "function") {
      markNotification(role, item.id);
    }
    setOpen(false);
  }

  return (
    <div className={styles.root} ref={rootRef} onBlur={onFocusLeave}>
      <button
        ref={triggerRef}
        className="notification-button"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`${unreadCount} unread ${label}. ${open ? "Close" : "Open"} notifications`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <AppIcon name="bell" />
        {unreadCount > 0 ? (
          <span aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <section
          className={styles.panel}
          id={panelId}
          aria-label="Recent notifications"
        >
          <div className={styles.heading}>
            <div>
              <h2>Notifications</h2>
              <p>{unreadCount} unread · Demo data</p>
            </div>
            <button
              type="button"
              className={styles.close}
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <AppIcon name="close" size={18} />
            </button>
          </div>
          <div className={styles.content}>
            {isLoading ? (
              <p className={styles.empty} role="status">Loading notifications...</p>
            ) : recentNotices.length === 0 ? (
              <p className={styles.empty}>No notifications yet.</p>
            ) : (
              <ul className={styles.list}>
                {recentNotices.map((item) => (
                  <li key={item.id}>
                    <Link
                      className={`${styles.item} ${item.read ? "" : styles.unread}`}
                      href={item.id ? `${allHref}#notification-${encodeURIComponent(String(item.id))}` : notificationHref}
                      onClick={() => onNotificationClick(item)}
                    >
                      <span className={styles.itemTop}>
                        <strong>
                          {!item.read ? <span className={styles.srOnly}>Unread: </span> : null}
                          {item.title}
                        </strong>
                        {!item.read ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
                      </span>
                      <span className={styles.message}>{item.message}</span>
                      <span className={styles.meta}>{item.date} · {item.category}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link className={styles.viewAll} href={allHref} onClick={() => setOpen(false)}>
            View All Notifications
            <AppIcon name="chevronRight" size={16} />
          </Link>
        </section>
      ) : null}
    </div>
  );
}
