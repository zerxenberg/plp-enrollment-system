
"use client";

import { useRouter } from "next/navigation";

import { Button, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { LinkButton, Metric, Panel } from "@/components/registrar/RegistrarShared";

export default function SystemAdministratorDashboard({ dashboardData }) {
  const router = useRouter();
  const {
    activeUsers,
    inactiveUsers,
    activeAdministrators,
    failedRequests,
    successfulSynchronizations,
    openErrors,
    unreadTechnicalAlerts,
    latestBackup,
    health,
    recentActivity,
  } = dashboardData;

  return (
    <>
      <PageHeader
        title="System Administrator Dashboard"
        description="Technical access, integration, security, database operations, audit activity, and system health."
        actions={
          <Button variant="secondary" onClick={() => router.refresh()}>
            Refresh Status
          </Button>
        }
      />

      <section
        className="portal-card hero-card system-admin-enter"
        aria-label="System administration overview"
      >
        <h2>Technical operations at a glance</h2>
        <p>
          The dashboard uses live Supabase data. Technical administration remains
          separate from Registrar enrollment decisions and Academic Coordinator
          academic decisions.
        </p>
        <div className="hero-meta">
          <span className="hero-chip">
            Application: {health?.application_status || "No health snapshot"}
          </span>
          <span className="hero-chip">
            Database: {health?.database_status || "No health snapshot"}
          </span>
          <span className="hero-chip">
            API: {health?.api_status || "No health snapshot"}
          </span>
        </div>
      </section>

      <div className="stats-grid" style={{ margin: "16px 0" }}>
        <Metric label="Active Users" value={activeUsers} hint="Enabled application accounts" />
        <Metric label="Inactive Users" value={inactiveUsers} hint="Access disabled" />
        <Metric label="System Administrators" value={activeAdministrators} hint="Active administrator accounts" />
        <Metric label="Failed API Requests" value={failedRequests} hint="Recorded integration failures" />
        <Metric label="Successful Synchronizations" value={successfulSynchronizations} hint="Recorded successful sync events" />
        <Metric label="Unread Technical Alerts" value={unreadTechnicalAlerts} hint="Your notification queue" />
        <Metric label="Open System Errors" value={openErrors} hint="Require technical review" />
        <Metric label="Latest Backup Record" value={latestBackup?.status || "No record"} hint={latestBackup?.startedAtLabel || "No backup record"} />
      </div>

      <div className="content-grid">
        <Panel
          title="System Health"
          subtitle={health ? `Captured ${health.capturedAtLabel}` : "No health snapshot has been recorded yet."}
          className="span-6"
          actions={<LinkButton href="/system-administrator/audit-monitoring">Open Monitoring</LinkButton>}
        >
          <div className="detail-list">
            <div className="detail-row">
              <span>Application</span>
              <strong><StatusBadge value={health?.application_status || "Unknown"} label={health?.application_status || "Unknown"} /></strong>
            </div>
            <div className="detail-row">
              <span>Database</span>
              <strong><StatusBadge value={health?.database_status || "Unknown"} label={health?.database_status || "Unknown"} /></strong>
            </div>
            <div className="detail-row">
              <span>Admission API</span>
              <strong><StatusBadge value={health?.api_status || "Unknown"} label={health?.api_status || "Unknown"} /></strong>
            </div>
            <div className="detail-row">
              <span>Authentication</span>
              <strong><StatusBadge value={health?.authentication_status || "Unknown"} label={health?.authentication_status || "Unknown"} /></strong>
            </div>
          </div>
        </Panel>

        <Panel
          title="Backup Registry"
          subtitle="Database backup records stored by the Enrollment System."
          className="span-6"
          actions={<LinkButton href="/system-administrator/system-administration">Open Backup & Recovery</LinkButton>}
        >
          {latestBackup ? (
            <div className="detail-list">
              <div className="detail-row"><span>Reference</span><strong>{latestBackup.backup_reference}</strong></div>
              <div className="detail-row"><span>Status</span><strong><StatusBadge value={latestBackup.status} label={latestBackup.status} /></strong></div>
              <div className="detail-row"><span>Size</span><strong>{latestBackup.sizeLabel}</strong></div>
              <div className="detail-row"><span>Integrity</span><strong>{latestBackup.integrity_status || "Not recorded"}</strong></div>
            </div>
          ) : (
            <div className="notice">No backup record is currently stored in the application database.</div>
          )}
        </Panel>

        <Panel
          title="Recent Administrative Activity"
          subtitle="Latest persisted audit events."
          className="span-7"
        >
          <div className="list-stack">
            {recentActivity.length ? recentActivity.map((item) => (
              <div className="list-item" key={item.id}>
                <strong>{item.action}</strong>
                <p>{item.occurredAtLabel} · {item.module} · {item.actor_label || "System"}</p>
              </div>
            )) : <div className="notice">No audit activity has been recorded.</div>}
          </div>
        </Panel>

        <Panel title="Quick Actions" subtitle="Open the owning technical module." className="span-5">
          <div className="action-row">
            <Button onClick={() => router.push("/system-administrator/users-access")}>
              Users & Access
            </Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-integration")}>
              System Integration
            </Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-administration")}>
              System Administration
            </Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/audit-monitoring")}>
              Audit & Monitoring
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
