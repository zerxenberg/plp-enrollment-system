"use client";

import Image from "next/image";
import Link from "next/link";
import PortalIcon from "./PortalIcon";

export default function Topbar({ role, pageTitle, term, user, unreadCount, notificationHref, onMenu, menuOpen }) {
  return (
    <header className="portal-topbar">
      <button id="portal-menu-button" className="mobile-menu-button" type="button" onClick={onMenu} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="portal-sidebar"><PortalIcon name="menu" /></button>
      <div className="topbar-university">
        <Image src="/assets/images/plp_logo.png" alt="" width={42} height={42} />
        <div><strong>Pamantasan ng Lungsod ng Pasig</strong><span>{pageTitle}</span></div>
      </div>
      <div className="topbar-actions">
        <div className="term-pill"><PortalIcon name="calendar" /><span><strong>Online Enrollment</strong><small>{term.shortLabel} • {term.enrollmentStart} to {term.enrollmentEnd}</small></span></div>
        <Link className="notification-button" href={notificationHref} aria-label={`${unreadCount} unread notifications`}><PortalIcon name="bell" />{unreadCount > 0 ? <span>{unreadCount}</span> : null}</Link>
        <Link className="topbar-profile" href={role === "student" ? "/student/student-profile" : "/registrar/profile"}><span className="profile-avatar small">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><strong>{user.name}</strong></Link>
      </div>
    </header>
  );
}
