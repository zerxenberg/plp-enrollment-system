
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Feedback, LinkButton, Metric, Panel } from "@/components/registrar/RegistrarShared";

export default function SystemAdministratorDashboard() {
  const router = useRouter();
  const { registrar, systemAdministrators, academicCoordinators, notifications } = useDemoData();
  const [message, setMessage] = useState("");

  const directory = useMemo(() => {
    const students = registrar.students.map((item) => ({
      role: "Student",
      active: item.studentStatus === "ACTIVE",
    }));
    const registrarAccount = [{
      role: "Registrar",
      active: registrar.registrar.accountStatus === "Active",
    }];
    const coordinators = academicCoordinators.map((item) => ({
      role: "Academic Coordinator",
      active: item.accountStatus === "Active",
    }));
    const administrators = systemAdministrators.map((item) => ({
      role: "System Administrator",
      active: item.accountStatus === "Active",
    }));
    return [...students, ...registrarAccount, ...coordinators, ...administrators];
  }, [academicCoordinators, registrar, systemAdministrators]);

  const activeUsers = directory.filter((item) => item.active).length;
  const inactiveUsers = directory.length - activeUsers;
  const technicalAlerts = notifications["system-administrator"] || [];
  const unreadAlerts = technicalAlerts.filter((item) => !item.read).length;

  function refreshDashboard() {
    setMessage(`Dashboard refreshed at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
  }

  return (
    <>
      <PageHeader
        title="System Administrator Dashboard"
        description="Technical access, integration, security, backup, audit, and system health overview."
        actions={<Button variant="secondary" onClick={refreshDashboard}>Refresh Status</Button>}
      />

      <section className="portal-card hero-card system-admin-enter" aria-label="System administration overview">
        <h2>Technical operations at a glance</h2>
        <p>
          Monitor access, integration, security, backups, and system health without taking over
          Registrar enrollment decisions or Academic Coordinator academic decisions.
        </p>
        <div className="hero-meta">
          <span className="hero-chip">Application Healthy</span>
          <span className="hero-chip">Database Connected</span>
          <span className="hero-chip">Admission API Connected</span>
        </div>
      </section>

      <Feedback message={message} />

      <div className="stats-grid" style={{ margin: "16px 0" }}>
        <Metric label="Active Users" value={activeUsers} hint={`${directory.length} directory records`} />
        <Metric label="Inactive Users" value={inactiveUsers} hint="Account review scope" />
        <Metric label="Active Administrator Sessions" value="3" hint="Protected staff sessions" />
        <Metric label="API Connection" value="Connected" hint="Admission System reachable" />
        <Metric label="Successful Synchronizations" value="42" hint="Current enrollment period" />
        <Metric label="Failed API Requests" value="2" hint="Require technical review" />
        <Metric label="Unread Technical Alerts" value={unreadAlerts} hint="Notification center" />
        <Metric label="Recent System Errors" value="1" hint="Open technical error" />
      </div>

      <div className="content-grid">
        <Panel
          title="Integration Summary"
          subtitle="Admission System connection and synchronization condition."
          className="span-6"
          actions={<LinkButton href="/system-administrator/system-integration">Open Integration</LinkButton>}
        >
          <div className="detail-list">
            <div className="detail-row"><span>Admission System Connection</span><strong><StatusBadge value="ACTIVE" label="Connected" /></strong></div>
            <div className="detail-row"><span>Last Successful Request</span><strong>Oct 7, 2026 · 5:42 PM</strong></div>
            <div className="detail-row"><span>Last Failed Request</span><strong>Oct 7, 2026 · 4:18 PM</strong></div>
            <div className="detail-row"><span>Pending Synchronization</span><strong>1</strong></div>
          </div>
        </Panel>

        <Panel
          title="Security & Access"
          subtitle="Authentication, account, and permission signals."
          className="span-6"
          actions={<LinkButton href="/system-administrator/users-access">Open Users & Access</LinkButton>}
        >
          <div className="detail-list">
            <div className="detail-row"><span>Directory Records</span><strong>{directory.length}</strong></div>
            <div className="detail-row"><span>Inactive Accounts</span><strong>{inactiveUsers}</strong></div>
            <div className="detail-row"><span>Failed Logins</span><strong>3</strong></div>
            <div className="detail-row"><span>Recent Permission Changes</span><strong>1</strong></div>
          </div>
        </Panel>

        <Panel title="Backup & Recovery" subtitle="Current recovery readiness." className="span-5">
          <div className="detail-list">
            <div className="detail-row"><span>Last Backup Date</span><strong>Oct 7, 2026</strong></div>
            <div className="detail-row"><span>Last Backup Result</span><strong><StatusBadge value="COMPLETED" label="Successful" /></strong></div>
            <div className="detail-row"><span>Available Backups</span><strong>6</strong></div>
            <div className="detail-row"><span>Last Restore Activity</span><strong>Sep 15, 2026</strong></div>
          </div>
        </Panel>

        <Panel title="Recent Administrative Activity" subtitle="Recent traceable technical changes." className="span-7">
          <div className="list-stack">
            <div className="list-item"><strong>API configuration changed</strong><p>Adrian Reyes · 5:10 PM</p></div>
            <div className="list-item"><strong>Backup created</strong><p>Adrian Reyes · 8:30 AM</p></div>
            <div className="list-item"><strong>User role changed</strong><p>Karen Mendoza · Yesterday</p></div>
          </div>
        </Panel>

        <Panel
          title="Technical Alerts"
          subtitle={`${unreadAlerts} unread technical alert${unreadAlerts === 1 ? "" : "s"}.`}
          className="span-5"
          actions={<LinkButton href="/system-administrator/notifications">View All</LinkButton>}
        >
          <div className="list-stack">
            {technicalAlerts.slice(0, 4).map((item) => (
              <div className="list-item" key={item.id}>
                <div className="list-item-header">
                  <strong>{item.title}</strong>
                  <StatusBadge value={item.read ? "READ" : "UNREAD"} label={item.read ? "Read" : "Unread"} />
                </div>
                <p>{item.date} · {item.category}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Quick Actions" subtitle="Only high value administrative actions are surfaced here." className="span-7">
          <div className="action-row">
            <Button onClick={() => router.push("/system-administrator/users-access")}>Create User Account</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-integration")}>Review Failed Requests</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-administration")}>Backup & Recovery</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/audit-monitoring")}>Audit & System Health</Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
