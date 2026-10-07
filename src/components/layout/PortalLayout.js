"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { PORTAL_META } from "@/config/portal-navigation";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getDemoSession } from "@/lib/auth/demo-auth";
import { LoadingState } from "@/components/ui/PortalUI";

export default function PortalLayout({ role, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { student, registrar, notifications } = useDemoData();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const meta = PORTAL_META[role];
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((current) => !current), []);

  useEffect(() => {
    const session = getDemoSession();
    if (!session) {
      router.replace(role === "student" ? "/student-portal" : "/");
      return undefined;
    }
    if (session.role !== role) {
      router.replace(session.role === "student" ? "/student/dashboard" : "/registrar/dashboard");
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

  const pageTitle = useMemo(() => {
    const match = meta.navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.label || "Profile";
  }, [meta.navigation, pathname]);
  const user = role === "student" ? { name: student.profile.fullName, subtitle: student.profile.studentNumber } : { name: registrar.registrar.fullName, subtitle: registrar.registrar.role };
  const term = student.term;
  const unreadCount = notifications[role].filter((item) => !item.read).length;

  if (!ready) return <LoadingState label="Checking demo session..." />;

  return (
    <div className={`portal-app portal-role-${role}`}>
      <Sidebar role={role} meta={meta} user={user} open={sidebarOpen} onClose={closeSidebar} />
      <div className="portal-main-shell">
        <Topbar role={role} pageTitle={pageTitle} term={term} user={user} unreadCount={unreadCount} notificationHref={`/${role}/notifications`} menuOpen={sidebarOpen} onMenu={toggleSidebar} />
        <main className="portal-content" id="main-content">{children}</main>
      </div>
    </div>
  );
}
