
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { PortalHeaderContext } from "./PortalHeaderContext";
import { PORTAL_META } from "@/config/portal-navigation";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getLiveSession } from "@/lib/auth/live-auth";
import { LoadingState } from "@/components/ui/PortalUI";
import { markStudentNotificationRead } from "@/features/students/student-portal-actions";

export default function PortalLayout({ role, authUser, projectOnly = false, institutionalStudent = false,
  portalTerm = null, portalNotifications = null, children }) {
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

  // Real fictional PROJECT_ONLY students must not inherit another demo
  // student's term or notification inbox from the shared mock provider.
  // Neither verified institutional students nor fictional project accounts may
  // inherit another student's shared mock term or notification inbox.
  const isolatedStudent = projectOnly || institutionalStudent;
  const term = portalTerm || (isolatedStudent ? null : student.term);
  const roleNotifications = isolatedStudent ? (portalNotifications || []) : (notifications[role] || []);
  const markHeaderNotification = isolatedStudent && role === "student"
    ? (_role, id) => markStudentNotificationRead(id, true)
      .then(() => router.refresh()).catch(() => {})
    : markNotification;
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
          markNotification: markHeaderNotification,
          notificationHref: meta.notificationHref,
          utilityLabel: meta.topbarUtilityLabel,
          showTerm: Boolean(term),
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
