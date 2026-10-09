
"use client";

import { useState } from "react";
import { Button, Card, DataTable, InternalTabs, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

const TABS = ["Audit Logs", "Security Activity", "Administrator Activity", "System Errors", "System Health"];

const AUDIT_LOGS = [
  { id: "AUD-00091", dateTime: "Oct 7, 2026 · 5:42 PM", source: "Integration Service", role: "System", module: "System Integration", action: "Applicant synchronization", relatedRecord: "APP-2026-0149", result: "Successful", ipAddress: "10.0.0.15" },
  { id: "AUD-00090", dateTime: "Oct 7, 2026 · 5:10 PM", source: "Adrian Reyes", role: "System Administrator", module: "System Integration", action: "API setting changed", relatedRecord: "CFG-API-01", result: "Successful", ipAddress: "10.0.0.27" },
  { id: "AUD-00089", dateTime: "Oct 7, 2026 · 4:18 PM", source: "Integration Service", role: "System", module: "System Integration", action: "Applicant synchronization", relatedRecord: "APP-2026-0148", result: "Failed", ipAddress: "10.0.0.15" },
];

const SECURITY = [
  { id: "SEC-001", event: "Successful Login", user: "Adrian Reyes", dateTime: "Oct 7, 2026 · 5:52 PM", status: "Successful" },
  { id: "SEC-002", event: "Failed Login", user: "Unknown account", dateTime: "Oct 7, 2026 · 5:21 PM", status: "Failed" },
  { id: "SEC-003", event: "Role Change", user: "Karen Mendoza", dateTime: "Oct 6, 2026 · 3:14 PM", status: "Successful" },
];

const ADMIN_ACTIVITY = [
  { id: "ADM-001", administrator: "Adrian Reyes", action: "API setting changed", module: "System Integration", previousConfiguration: "Timeout: 10s", newConfiguration: "Timeout: 15s", dateTime: "Oct 7, 2026 · 5:10 PM" },
  { id: "ADM-002", administrator: "Adrian Reyes", action: "Backup created", module: "System Administration", previousConfiguration: "No new backup", newConfiguration: "BKP-20261007-01", dateTime: "Oct 7, 2026 · 8:30 AM" },
];

const ERRORS = [
  { reference: "ERR-2026-0081", errorType: "Synchronization Error", module: "System Integration", message: "Approved program is required.", timestamp: "Oct 7, 2026 · 4:18 PM", status: "Open" },
  { reference: "ERR-2026-0080", errorType: "Authentication Warning", module: "Users & Access", message: "Repeated failed login attempts detected.", timestamp: "Oct 7, 2026 · 3:03 PM", status: "Reviewed" },
];

export default function SystemAdministratorAuditMonitoring() {
  const [activeTab, setActiveTab] = useState("Audit Logs");
  const [message, setMessage] = useState("");

  return (
    <>
      <PageHeader
        title="Audit & Monitoring"
        description="Read only technical activity, security events, administrator actions, system errors, and health monitoring."
      />

      <InternalTabs items={TABS.map((value) => ({ value, label: value }))} selected={activeTab} onSelect={setActiveTab} label="Audit and monitoring sections">

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      {activeTab === "Audit Logs" ? (
        <Card className="section-card">
          <div className="notice" style={{ marginBottom: 12 }}>Audit records are read only through the ordinary interface. There are no normal Edit or Delete actions.</div>
          <DataTable
            rowKey="id"
            rows={AUDIT_LOGS}
            columns={[
              { key: "dateTime", label: "Date and Time" },
              { key: "source", label: "User or System Source" },
              { key: "role", label: "Role" },
              { key: "module", label: "Module" },
              { key: "action", label: "Action" },
              { key: "relatedRecord", label: "Related Record" },
              { key: "result", label: "Result" },
              { key: "ipAddress", label: "IP Address" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Audit details opened.")}>View Details</Button>
            <Button variant="secondary" onClick={() => setMessage("Audit logs sorted in mock mode.")}>Sort</Button>
            <Button variant="secondary" onClick={() => setMessage("Audit logs exported in mock mode.")}>Export Logs</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Security Activity" ? (
        <Card className="section-card">
          <DataTable
            rowKey="id"
            rows={SECURITY}
            columns={[
              { key: "event", label: "Event Type" },
              { key: "user", label: "User" },
              { key: "dateTime", label: "Date and Time" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status === "Successful" ? "COMPLETED" : "FAILED"} label={row.status} /> },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Security event details opened.")}>View Details</Button>
            <Button variant="secondary" onClick={() => setMessage("Related user account opened.")}>Open User Account</Button>
            <Button variant="secondary" onClick={() => setMessage("Security activity exported in mock mode.")}>Export</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Administrator Activity" ? (
        <Card className="section-card">
          <DataTable
            rowKey="id"
            rows={ADMIN_ACTIVITY}
            columns={[
              { key: "administrator", label: "Administrator" },
              { key: "action", label: "Action" },
              { key: "module", label: "Module" },
              { key: "previousConfiguration", label: "Previous Configuration" },
              { key: "newConfiguration", label: "New Configuration" },
              { key: "dateTime", label: "Date and Time" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Administrator activity details opened.")}>View Details</Button>
            <Button variant="secondary" onClick={() => setMessage("Search action ready in mock mode.")}>Search</Button>
            <Button variant="secondary" onClick={() => setMessage("Filter action ready in mock mode.")}>Filter</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "System Errors" ? (
        <Card className="section-card">
          <div className="notice" style={{ marginBottom: 12 }}>Historical errors remain available for troubleshooting and accountability.</div>
          <DataTable
            rowKey="reference"
            rows={ERRORS}
            columns={[
              { key: "reference", label: "Error Reference" },
              { key: "errorType", label: "Error Type" },
              { key: "module", label: "Module" },
              { key: "message", label: "Message" },
              { key: "timestamp", label: "Timestamp" },
              { key: "status", label: "Status" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Error details opened.")}>View Details</Button>
            <Button variant="secondary" onClick={() => setMessage("Error marked reviewed in mock mode.")}>Mark Reviewed</Button>
            <Button variant="secondary" onClick={() => setMessage("Related module opened in mock mode.")}>Open Related Module</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "System Health" ? (
        <Card className="section-card">
          <div className="info-grid">
            <div className="info-item"><span>Application Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
            <div className="info-item"><span>Database Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
            <div className="info-item"><span>API Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
            <div className="info-item"><span>Authentication Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
            <div className="info-item"><span>Backup Status</span><strong><StatusBadge value="COMPLETED" label="Successful" /></strong></div>
            <div className="info-item"><span>Recent Error Count</span><strong><StatusBadge value="FOR_VALIDATION" label="1" /></strong></div>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button onClick={() => setMessage("System health refreshed.")}>Refresh Status</Button>
            <Button variant="secondary" onClick={() => setMessage("API connection test succeeded.")}>Test API Connection</Button>
            <Button variant="secondary" onClick={() => setMessage("Database connection check succeeded.")}>Check Database Connection</Button>
            <Button variant="secondary" onClick={() => setActiveTab("Audit Logs")}>Open Related Logs</Button>
          </div>
        </Card>
      ) : null}
      </InternalTabs>
    </>
  );
}
