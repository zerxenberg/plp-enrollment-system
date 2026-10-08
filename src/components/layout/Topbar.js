
"use client";

import Image from "next/image";
import Link from "next/link";
import AppIcon from "@/components/ui/AppIcon";

export default function Topbar({
  pageTitle,
  term,
  user,
  unreadCount,
  notificationHref,
  profileHref,
  utilityLabel = "notifications",
  showUniversityBrand = true,
  onMenu,
  menuOpen,
}) {
  return (
    <header className={`portal-topbar ${showUniversityBrand ? "" : "is-compact"}`}>
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

      {showUniversityBrand ? (
        <div className="topbar-university">
          <Image src="/assets/images/plp_logo.png" alt="" width={42} height={42} />
          <div>
            <strong>Pamantasan ng Lungsod ng Pasig</strong>
            <span>{pageTitle}</span>
          </div>
        </div>
      ) : null}

      <div className="topbar-actions">
        <div className="term-pill" title={`Online Enrollment: ${term.shortLabel}, ${term.enrollmentStart} to ${term.enrollmentEnd}`}>
          <AppIcon name="calendar" />
          <span>
            <strong>Online Enrollment</strong>
            <small>{term.shortLabel} • {term.enrollmentStart} to {term.enrollmentEnd}</small>
          </span>
        </div>

        <Link
          className="notification-button"
          href={notificationHref}
          aria-label={`${unreadCount} unread ${utilityLabel}`}
        >
          <AppIcon name="bell" />
          {unreadCount > 0 ? <span>{unreadCount}</span> : null}
        </Link>

        <Link className="topbar-profile" href={profileHref}>
          <span className="profile-avatar small" aria-hidden="true">
            {user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
          </span>
          <strong>{user.name}</strong>
        </Link>
      </div>
    </header>
  );
}
