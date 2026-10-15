
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { PortalHeaderContext } from "./PortalHeaderContext";
import { PORTAL_META } from "@/config/portal-navigation";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getDemoSession } from "@/lib/auth/demo-auth";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const meta = PORTAL_META[role];

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((current) => !current), []);

  useEffect(() => {
    const session = getDemoSession();

    if (!session) {
      router.replace("/");
      return undefined;
    }

    if (session.role !== role) {
      const destination = PORTAL_META[session.role]?.homeHref || "/";
      router.replace(destination);
      return undefined;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [role, router]);

  const user = useMemo(() => {
    const session = getDemoSession();

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
  }, [academicCoordinators, registrar, role, student, systemAdministrators]);

  if (!meta) {
    return <LoadingState label="Portal configuration is unavailable." />;
  }

  const term = student.term;
  const roleNotifications = notifications[role] || [];
  if (!ready) {
    return <LoadingState label="Checking demo session..." />;
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
