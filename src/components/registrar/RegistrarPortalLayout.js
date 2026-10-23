"use client";

import { useCallback, useMemo, useState } from "react";

import Sidebar from "@/components/layout/Sidebar";
import { PortalHeaderContext } from "@/components/layout/PortalHeaderContext";
import { PORTAL_META } from "@/config/portal-navigation";

export default function RegistrarPortalLayout({
  authUser,
  shellData,
  markNotificationAction,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => shellData?.notifications || []);
  const meta = PORTAL_META.registrar;

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((current) => !current), []);

  const user = useMemo(() => ({
    name: authUser?.full_name || "Registrar",
    subtitle: authUser?.source_account_key || meta?.portalName || "Registrar",
  }), [authUser, meta?.portalName]);

  const markNotification = useCallback(async (_role, notificationId, read = true) => {
    let previous = [];
    setNotifications((current) => {
      previous = current;
      return current.map((item) => item.id === notificationId ? { ...item, read: Boolean(read) } : item);
    });
    const result = await markNotificationAction(notificationId, Boolean(read));
    if (!result?.ok) setNotifications(previous);
    return result;
  }, [markNotificationAction]);

  return (
    <div className="portal-app portal-role-registrar">
      <Sidebar
        role="registrar"
        meta={meta}
        user={user}
        open={sidebarOpen}
        onClose={closeSidebar}
      />
      <div className="portal-main-shell">
        <PortalHeaderContext.Provider value={{
          role: "registrar",
          term: shellData?.term || null,
          notifications,
          markNotification,
          notificationHref: meta.notificationHref,
          utilityLabel: meta.topbarUtilityLabel,
          showTerm: true,
          menuOpen: sidebarOpen,
          onMenu: toggleSidebar,
        }}>
          <main className="portal-content" id="main-content">{children}</main>
        </PortalHeaderContext.Provider>
      </div>
    </div>
  );
}
