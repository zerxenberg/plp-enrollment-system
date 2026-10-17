
"use client";

import { useCallback, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import { PortalHeaderContext } from "./PortalHeaderContext";
import { PORTAL_META } from "@/config/portal-navigation";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";

export default function PortalLayout({ role, authUser, children }) {
  const {
    student,
    notifications,
    markNotification,
  } = useDemoData();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const meta = PORTAL_META[role];

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((current) => !current), []);

  const user = useMemo(() => ({
    name: authUser?.full_name || "Portal User",
    subtitle:
      authUser?.source_account_key ||
      (role === "student" ? student.profile.studentNumber : meta?.portalName || role),
  }), [authUser, meta?.portalName, role, student.profile.studentNumber]);

  if (!meta) {
    return null;
  }

  const term = student.term;
  const roleNotifications = notifications[role] || [];

  return (
    <div className={`portal-app portal-role-${role}`}>
      <Sidebar
        role={role}
        meta={meta}
        user={user}
        open={sidebarOpen}
        onClose={closeSidebar}
      />

      <div className="portal-main-shell">
        <PortalHeaderContext.Provider value={{
          role,
          term,
          notifications: roleNotifications,
          markNotification,
          notificationHref: meta.notificationHref,
          utilityLabel: meta.topbarUtilityLabel,
          showTerm: true,
          menuOpen: sidebarOpen,
          onMenu: toggleSidebar,
        }}>
          <main className="portal-content" id="main-content">
            {children}
          </main>
        </PortalHeaderContext.Provider>
      </div>
    </div>
  );
}
