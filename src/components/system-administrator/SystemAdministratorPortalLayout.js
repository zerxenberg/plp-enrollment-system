"use client";

import { useCallback, useMemo, useState } from "react";

import { PORTAL_META } from "@/config/portal-navigation";
import { PortalHeaderContext } from "@/components/layout/PortalHeaderContext";
import Sidebar from "@/components/layout/Sidebar";

export default function SystemAdministratorPortalLayout({
  authUser,
  shellData,
  markNotificationAction,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState(
    () => shellData?.notifications || [],
  );

  const meta = PORTAL_META["system-administrator"];

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(
    () => setSidebarOpen((current) => !current),
    [],
  );

  const user = useMemo(
    () => ({
      name: authUser?.full_name || "System Administrator",
      subtitle:
        authUser?.source_account_key ||
        meta?.portalName ||
        "System Administrator",
    }),
    [authUser, meta?.portalName],
  );

  const markNotification = useCallback(
    async (_role, notificationId, read = true) => {
      let previous = [];

      setNotifications((current) => {
        previous = current;
        return current.map((item) =>
          item.id === notificationId
            ? { ...item, read: Boolean(read) }
            : item,
        );
      });

      const result = await markNotificationAction(
        notificationId,
        Boolean(read),
      );

      if (!result?.ok) {
        setNotifications(previous);
      }

      return result;
    },
    [markNotificationAction],
  );

  if (!meta) return null;

  return (
    <div className="portal-app portal-role-system-administrator">
      <Sidebar
        role="system-administrator"
        meta={meta}
        user={user}
        open={sidebarOpen}
        onClose={closeSidebar}
      />

      <div className="portal-main-shell">
        <PortalHeaderContext.Provider
          value={{
            role: "system-administrator",
            term: shellData?.term || null,
            notifications,
            markNotification,
            notificationHref: meta.notificationHref,
            utilityLabel: meta.topbarUtilityLabel,
            showTerm: true,
            menuOpen: sidebarOpen,
            onMenu: toggleSidebar,
          }}
        >
          <main className="portal-content" id="main-content">
            {children}
          </main>
        </PortalHeaderContext.Provider>
      </div>
    </div>
  );
}
