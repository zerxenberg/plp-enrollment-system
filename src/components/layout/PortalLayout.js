
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { PortalHeaderContext } from "./PortalHeaderContext";
import { PORTAL_META } from "@/config/portal-navigation";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getLiveSession } from "@/lib/auth/live-auth";
import { LoadingState } from "@/components/ui/PortalUI";

function matchesStaffRecord(record, identifier) {
  const normalized = String(identifier || "").toLowerCase();
  return [
    record?.username,
    record?.employeeId,
    record?.email,
  ].some((value) => String(value || "").toLowerCase() === normalized);
}

export default function PortalLayout({ role, children }) {
  const router = useRouter();
  const {
    student,
    registrar,
    systemAdministrators,
    academicCoordinators,
    notifications,
    markNotification,
  } = useDemoData();

  const [ready, setReady] = useState(false);
  const [authenticatedAccount, setAuthenticatedAccount] = useState(null);
  const [authError, setAuthError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const meta = PORTAL_META[role];

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((current) => !current), []);

  useEffect(() => {
    let cancelled = false;
    async function verifyPortalAccount() {
      try {
        const session = await getLiveSession();
        if (cancelled) return;
        if (!session) {
          router.replace("/");
          return;
        }
        if (session.role !== role) {
          router.replace(PORTAL_META[session.role]?.homeHref || "/");
          return;
        }
        setAuthenticatedAccount(session);
        setReady(true);
      } catch {
        if (!cancelled) setAuthError("Could not verify this account's portal access.");
      }
    }
    verifyPortalAccount();
    return () => { cancelled = true; };
  }, [role, router]);

  const user = useMemo(() => {
    const session = authenticatedAccount;

    if (role === "student") {
      return {
        name: student.profile.fullName,
        subtitle: student.profile.studentNumber,
      };
    }

    if (role === "registrar") {
      return {
        name: registrar.registrar.fullName,
        subtitle: registrar.registrar.role,
      };
    }

    if (role === "system-administrator") {
      const record =
        systemAdministrators.find((item) => matchesStaffRecord(item, session?.identifier)) ||
        systemAdministrators[0];

      return {
        name: record?.fullName || session?.name || "System Administrator",
        subtitle: record?.employeeId || "System Administrator",
      };
    }

    if (role === "academic-coordinator") {
      const record =
        academicCoordinators.find((item) => matchesStaffRecord(item, session?.identifier)) ||
        academicCoordinators[0];

      return {
        name: record?.fullName || session?.name || "Academic Coordinator",
        subtitle: record?.employeeId || "Academic Coordinator",
      };
    }

    return {
      name: session?.name || "Portal User",
      subtitle: role,
    };
  }, [academicCoordinators, authenticatedAccount, registrar, role, student, systemAdministrators]);

  if (!meta) {
    return <LoadingState label="Portal configuration is unavailable." />;
  }

  const term = student.term;
  const roleNotifications = notifications[role] || [];
  if (!ready) {
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
          showTerm: role !== "system-administrator",
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
