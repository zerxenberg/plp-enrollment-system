
"use client";

import { useState } from "react";
import { Button, Card, DataTable, InternalTabs, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

const TABS = ["System Settings", "Security Settings", "Database Maintenance", "Backup & Recovery"];

const BACKUPS = [
  { reference: "BKP-20261007-01", date: "Oct 7, 2026", time: "8:30 AM", size: "48.7 MB", status: "Successful", createdBy: "Adrian Reyes" },
  { reference: "BKP-20261006-01", date: "Oct 6, 2026", time: "8:30 AM", size: "48.1 MB", status: "Successful", createdBy: "Scheduled Job" },
  { reference: "BKP-20261005-01", date: "Oct 5, 2026", time: "8:30 AM", size: "47.8 MB", status: "Successful", createdBy: "Scheduled Job" },
];

export default function SystemAdministratorAdministration() {
  const [activeTab, setActiveTab] = useState("System Settings");
  const [message, setMessage] = useState("");

  return (
    <>
      <PageHeader
        title="System Administration"
        description="Technical application settings, security controls, database maintenance, backup, and recovery."
      />

      <InternalTabs items={TABS.map((value) => ({ value, label: value }))} selected={activeTab} onSelect={setActiveTab} label="System administration sections">

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      {activeTab === "System Settings" ? (
        <Card className="section-card">
          <div className="form-grid">
            <label className="field"><span>Application Name</span><input defaultValue="PLP Enrollment System" /></label>
            <label className="field"><span>Default System Timezone</span><input defaultValue="Asia/Manila" /></label>
            <label className="field"><span>Technical Notification Settings</span><select defaultValue="Enabled"><option>Enabled</option><option>Disabled</option></select></label>
            <label className="field"><span>Maintenance Mode</span><select defaultValue="Off"><option>Off</option><option>On</option></select></label>
            <label className="field"><span>Logging Level</span><select defaultValue="Standard"><option>Standard</option><option>Detailed</option><option>Minimal</option></select></label>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("System Settings editing enabled in mock mode.")}>Edit</Button>
            <Button onClick={() => setMessage("System Settings saved in mock mode.")}>Save Settings</Button>
            <Button variant="secondary" onClick={() => setMessage("Changes cancelled.")}>Cancel</Button>
            <Button variant="secondary" onClick={() => setMessage("Project default settings restored in mock mode.")}>Restore Default Project Setting</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Security Settings" ? (
        <Card className="section-card">
          <div className="notice" style={{ marginBottom: 12 }}>Password hashes, plain text passwords, API secrets, and database passwords are not displayed in this interface.</div>
          <div className="info-grid">
            <div className="info-item"><span>Authentication Method</span><strong>Account Credentials + Role Based Access</strong></div>
            <div className="info-item"><span>Password Hashing Status</span><strong><StatusBadge value="ACTIVE" label="Configured for backend" /></strong></div>
            <div className="info-item"><span>API Authentication Status</span><strong><StatusBadge value="ACTIVE" label="Enabled" /></strong></div>
            <div className="info-item"><span>Administrative Session Controls</span><strong>Enabled</strong></div>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field"><span>Session Timeout</span><input defaultValue="30 minutes" /></label>
            <label className="field"><span>Login Attempt Limit</span><input defaultValue="5" /></label>
            <label className="field"><span>Password Policy Settings</span><select defaultValue="Standard"><option>Standard</option><option>Strict</option></select></label>
            <label className="field"><span>Account Lockout Settings</span><select defaultValue="Enabled"><option>Enabled</option><option>Disabled</option></select></label>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Security Settings editing enabled in mock mode.")}>Edit</Button>
            <Button onClick={() => setMessage("Security Settings saved in mock mode.")}>Save</Button>
            <Button variant="secondary" onClick={() => setMessage("Changes cancelled.")}>Cancel</Button>
            <Button variant="secondary" onClick={() => setMessage("Open Audit & Monitoring to review Security Activity.")}>Review Security Activity</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Database Maintenance" ? (
        <Card className="section-card">
          <div className="notice" style={{ marginBottom: 12 }}>Only safe project level maintenance actions are exposed. There is no raw SQL console or unrestricted table editing.</div>
          <div className="info-grid">
            <div className="info-item"><span>Database Connection Status</span><strong><StatusBadge value="ACTIVE" label="Connected" /></strong></div>
            <div className="info-item"><span>Database Size</span><strong>84.2 MB</strong></div>
            <div className="info-item"><span>Number of Tables</span><strong>18</strong></div>
            <div className="info-item"><span>Record Count Summary</span><strong>12,486 records</strong></div>
            <div className="info-item"><span>Last Maintenance Activity</span><strong>Oct 6, 2026 · 9:10 PM</strong></div>
            <div className="info-item"><span>Data Integrity Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button onClick={() => setMessage("Database connection check succeeded.")}>Check Database Connection</Button>
            <Button variant="secondary" onClick={() => setMessage("Table status opened in mock mode.")}>View Table Status</Button>
            <Button variant="secondary" onClick={() => setMessage("Approved maintenance completed in mock mode.")}>Run Approved Maintenance</Button>
            <Button variant="secondary" onClick={() => setMessage("Data integrity status opened.")}>View Data Integrity Status</Button>
            <Button variant="secondary" onClick={() => setMessage("Database statistics refreshed.")}>Refresh Statistics</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Backup & Recovery" ? (
        <Card className="section-card">
          <DataTable
            rowKey="reference"
            rows={BACKUPS}
            columns={[
              { key: "reference", label: "Backup Reference" },
              { key: "date", label: "Date" },
              { key: "time", label: "Time" },
              { key: "size", label: "Backup Size" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value="COMPLETED" label={row.status} /> },
              { key: "createdBy", label: "Created By" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button onClick={() => setMessage("Mock backup created and recorded.")}>Backup Now</Button>
            <Button variant="secondary" onClick={() => setMessage("Backup history is displayed above.")}>View Backup History</Button>
            <Button variant="secondary" onClick={() => setMessage("Download remains a mock action until backend storage is connected.")}>Download Backup</Button>
            <Button variant="danger" onClick={() => setMessage("Restore confirmation simulated. No database changes were made.")}>Restore Backup</Button>
          </div>
        </Card>
      ) : null}
      </InternalTabs>
    </>
  );
}
