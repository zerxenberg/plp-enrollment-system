
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { PortalHeaderContext } from "./PortalHeaderContext";
import { PORTAL_META } from "@/config/portal-navigation";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getLiveSession } from "@/lib/auth/live-auth";
import { LoadingState } from "@/components/ui/PortalUI";

export default function PortalLayout({ role, authUser, children }) {
  const router = useRouter();
  const {
    student,
    notifications,
    markNotification,
  } = useDemoData();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authenticatedAccount, setAuthenticatedAccount] = useState(null);
  const [authError, setAuthError] = useState("");
  const meta = PORTAL_META[role];

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((current) => !current), []);

  useEffect(() => {
    if (authUser) return undefined;
    let cancelled = false;
    async function verifyPortalAccount() {
      try {
        const session = await getLiveSession();
        if (cancelled) return;
        if (!session) {
          router.replace("/");
        } else if (session.role !== role) {
          router.replace(PORTAL_META[session.role]?.homeHref || "/");
        } else {
          setAuthenticatedAccount(session);
        }
      } catch {
        if (!cancelled) setAuthError("Could not verify this account's portal access.");
      }
    }
    verifyPortalAccount();
    return () => { cancelled = true; };
  }, [authUser, role, router]);

  const user = useMemo(() => ({
    name: authUser?.full_name || authenticatedAccount?.name || "Portal User",
    subtitle:
      authUser?.source_account_key ||
      authenticatedAccount?.identifier ||
      (role === "student" ? student.profile.studentNumber : meta?.portalName || role),
  }), [authUser, authenticatedAccount, meta?.portalName, role, student.profile.studentNumber]);

  if (!meta) {
    return null;
  }

  const term = student.term;
  const roleNotifications = notifications[role] || [];
  if (!authUser && !authenticatedAccount) {
    return <LoadingState label={authError || "Verifying secure portal access..."} />;
  }

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
