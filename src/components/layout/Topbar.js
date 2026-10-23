
"use client";

import AppIcon from "@/components/ui/AppIcon";
import NotificationPopover from "./NotificationPopover";

export default function Topbar({
  role,
  term,
  notifications,
  notificationHref,
  markNotification,
  utilityLabel = "notifications",
  showTerm = true,
  onMenu,
  menuOpen,
}) {
  return (
    <div className="topbar-actions" role="group" aria-label="Portal utilities">
      <button
        id="portal-menu-button"
        className="mobile-menu-button"
        type="button"
        onClick={onMenu}
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen}
        aria-controls="portal-sidebar"
      >
        <AppIcon name="menu" />
      </button>
      {showTerm && term ? (
        <div className="term-pill" title={`${term.isDemonstration ? "Demonstration Enrollment" : "Online Enrollment"}: ${term.shortLabel}, ${term.enrollmentStart} to ${term.enrollmentEnd}`}>
          <AppIcon name="calendar" />
          <span>
            <strong>{term.isDemonstration ? "Demonstration Enrollment" : "Online Enrollment"}</strong>
            <small>{term.shortLabel} • {term.enrollmentStart} to {term.enrollmentEnd}</small>
          </span>
        </div>
      ) : null}
      <NotificationPopover
        role={role}
        notifications={notifications}
        notificationHref={notificationHref}
        utilityLabel={utilityLabel}
        markNotification={markNotification}
      />
    </div>
  );
}
