
"use client";

import { useRouter } from "next/navigation";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

const statusCards = [
  ["Active Users", "18", "Across all four roles"],
  ["Active Administrator Sessions", "3", "Protected staff sessions"],
  ["API Connection Status", "Connected", "Admission System reachable"],
  ["Successful Synchronizations", "42", "Current enrollment period"],
  ["Failed API Requests", "2", "Require technical review"],
  ["Last Successful Backup", "Oct 7", "8:30 AM"],
  ["Failed Login Attempts", "3", "Latest monitoring period"],
  ["Recent System Errors", "1", "Open technical error"],
];

export default function SystemAdministratorDashboard() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="System Administrator Dashboard"
        description="Technical access, integration, security, backup, audit, and system health overview."
        actions={<Button variant="secondary" onClick={() => window.location.reload()}>Refresh Status</Button>}
      />

      <Card className="hero-card">
        <h2>Technical operations at a glance</h2>
        <p>
          Monitor the Enrollment System without taking over Registrar enrollment decisions
          or Academic Coordinator academic decisions.
        </p>
        <div className="hero-meta">
          <span className="hero-chip">Application Healthy</span>
          <span className="hero-chip">Database Connected</span>
          <span className="hero-chip">API Connected</span>
        </div>
      </Card>

      <div className="stats-grid" style={{ marginTop: 16 }}>
        {statusCards.map(([label, value, meta]) => (
          <Card className="metric-card" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{value}</strong>
            <span className="metric-meta">{meta}</span>
          </Card>
        ))}
      </div>

      <div className="content-grid" style={{ marginTop: 16 }}>
        <Card className="section-card span-6">
          <div className="section-header">
            <div>
              <h2>Integration Summary</h2>
              <p>Admission System and synchronization condition.</p>
            </div>
          </div>
          <div className="detail-list">
            <div className="detail-row"><span>Admission System Connection</span><strong><StatusBadge value="ACTIVE" label="Connected" /></strong></div>
            <div className="detail-row"><span>API Endpoint Status</span><strong>Available</strong></div>
            <div className="detail-row"><span>Last Successful Request</span><strong>Oct 7, 2026 · 5:42 PM</strong></div>
            <div className="detail-row"><span>Last Failed Request</span><strong>Oct 7, 2026 · 4:18 PM</strong></div>
            <div className="detail-row"><span>Pending Synchronization</span><strong>1</strong></div>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-integration")}>Open System Integration</Button>
          </div>
        </Card>

        <Card className="section-card span-6">
          <div className="section-header">
            <div>
              <h2>Security Summary</h2>
              <p>Authentication and access related activity.</p>
            </div>
          </div>
          <div className="detail-list">
            <div className="detail-row"><span>Failed Logins</span><strong>3</strong></div>
            <div className="detail-row"><span>Inactive or Locked Accounts</span><strong>2</strong></div>
            <div className="detail-row"><span>Recent Permission Changes</span><strong>1</strong></div>
            <div className="detail-row"><span>Recent Security Events</span><strong>4</strong></div>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/audit-monitoring")}>Review Security Logs</Button>
          </div>
        </Card>

        <Card className="section-card span-6">
          <div className="section-header"><div><h2>Backup Summary</h2><p>Current recovery readiness.</p></div></div>
          <div className="detail-list">
            <div className="detail-row"><span>Last Backup Date</span><strong>Oct 7, 2026</strong></div>
            <div className="detail-row"><span>Last Backup Result</span><strong><StatusBadge value="COMPLETED" label="Successful" /></strong></div>
            <div className="detail-row"><span>Available Backups</span><strong>6</strong></div>
            <div className="detail-row"><span>Last Restore Activity</span><strong>Sep 15, 2026</strong></div>
          </div>
        </Card>

        <Card className="section-card span-6">
          <div className="section-header"><div><h2>Recent Administrative Activity</h2><p>Traceable technical changes.</p></div></div>
          <div className="list-stack">
            <div className="list-item"><strong>API configuration changed</strong><p>Adrian Reyes · 5:10 PM</p></div>
            <div className="list-item"><strong>Backup created</strong><p>Adrian Reyes · 8:30 AM</p></div>
            <div className="list-item"><strong>User role changed</strong><p>Karen Mendoza · Yesterday</p></div>
          </div>
        </Card>

        <Card className="section-card span-12">
          <div className="section-header"><div><h2>Quick Actions</h2><p>Open the existing parent module for each technical task.</p></div></div>
          <div className="action-row">
            <Button onClick={() => router.push("/system-administrator/users-access")}>Create User Account</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-integration")}>Review Failed API Requests</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-integration")}>Test API Connection</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/system-administration")}>Create Backup</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/audit-monitoring")}>Review Security Logs</Button>
            <Button variant="secondary" onClick={() => router.push("/system-administrator/audit-monitoring")}>View System Health</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
