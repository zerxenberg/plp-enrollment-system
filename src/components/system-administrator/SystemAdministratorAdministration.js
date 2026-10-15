
"use client";

import { useState } from "react";
import {
  Button,
  DataTable,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Feedback, Info, Tabs } from "@/components/registrar/RegistrarShared";

const TABS = [
  { value: "System Settings", label: "System Settings" },
  { value: "Security Settings", label: "Security Settings" },
  { value: "Database Maintenance", label: "Database Maintenance" },
  { value: "Backup & Recovery", label: "Backup & Recovery" },
];

const BACKUPS = [
  { reference: "BKP-20261007-01", date: "Oct 7, 2026", time: "8:30 AM", size: "48.7 MB", status: "Successful", createdBy: "Adrian Reyes", type: "Manual", checksum: "Verified" },
  { reference: "BKP-20261006-01", date: "Oct 6, 2026", time: "8:30 AM", size: "48.1 MB", status: "Successful", createdBy: "Scheduled Job", type: "Scheduled", checksum: "Verified" },
  { reference: "BKP-20261005-01", date: "Oct 5, 2026", time: "8:30 AM", size: "47.8 MB", status: "Successful", createdBy: "Scheduled Job", type: "Scheduled", checksum: "Verified" },
];

const INITIAL_SYSTEM_SETTINGS = {
  applicationName: "PLP Enrollment System",
  timezone: "Asia/Manila",
  technicalNotifications: "Enabled",
  maintenanceMode: "Off",
  loggingLevel: "Standard",
};

const INITIAL_SECURITY_SETTINGS = {
  sessionTimeout: "30 minutes",
  loginAttemptLimit: "5",
  passwordPolicy: "Standard",
  accountLockout: "Enabled",
};

export default function SystemAdministratorAdministration() {
  const [activeTab, setActiveTab] = useState("System Settings");
  const [message, setMessage] = useState("");
  const [systemSettings, setSystemSettings] = useState(INITIAL_SYSTEM_SETTINGS);
  const [securitySettings, setSecuritySettings] = useState(INITIAL_SECURITY_SETTINGS);
  const [draftSystem, setDraftSystem] = useState(INITIAL_SYSTEM_SETTINGS);
  const [draftSecurity, setDraftSecurity] = useState(INITIAL_SECURITY_SETTINGS);
  const [editSystemOpen, setEditSystemOpen] = useState(false);
  const [editSecurityOpen, setEditSecurityOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="System Administration"
        description="Technical application settings, security controls, database maintenance, backup, and recovery."
      />

      <Tabs
        items={TABS}
        selected={activeTab}
        onSelect={(next) => { setActiveTab(next); setMessage(""); }}
        label="System administration sections"
        title="Technical Administration"
        subtitle="Configuration is summarized first. Editing and potentially destructive operations open focused confirmation modals."
      >
        <Feedback message={message} warning={message.toLowerCase().includes("restore")} />

        {activeTab === "System Settings" ? (
          <>
            <div className="info-grid">
              <Info label="Application Name" value={systemSettings.applicationName} />
              <Info label="Default System Timezone" value={systemSettings.timezone} />
              <Info label="Technical Notifications" value={systemSettings.technicalNotifications} />
              <Info label="Maintenance Mode" value={systemSettings.maintenanceMode} />
              <Info label="Logging Level" value={systemSettings.loggingLevel} />
            </div>
            <div className="action-row" style={{ marginTop: 14 }}>
              <Button onClick={() => { setDraftSystem(systemSettings); setEditSystemOpen(true); }}>Edit System Settings</Button>
            </div>
          </>
        ) : null}

        {activeTab === "Security Settings" ? (
          <>
            <div className="info-grid">
              <Info label="Authentication Method" value="Account Credentials + Role Based Access" />
              <div className="info-item"><span>Password Hashing Status</span><strong><StatusBadge value="ACTIVE" label="Configured for backend" /></strong></div>
              <div className="info-item"><span>API Authentication Status</span><strong><StatusBadge value="ACTIVE" label="Enabled" /></strong></div>
              <Info label="Administrative Session Controls" value="Enabled" />
              <Info label="Session Timeout" value={securitySettings.sessionTimeout} />
              <Info label="Login Attempt Limit" value={securitySettings.loginAttemptLimit} />
              <Info label="Password Policy" value={securitySettings.passwordPolicy} />
              <Info label="Account Lockout" value={securitySettings.accountLockout} />
            </div>
            <div className="notice" style={{ marginTop: 14 }}>
              Password hashes, plain text passwords, API secrets, and database passwords are never shown in the administrative interface.
            </div>
            <div className="action-row" style={{ marginTop: 14 }}>
              <Button onClick={() => { setDraftSecurity(securitySettings); setEditSecurityOpen(true); }}>Edit Security Settings</Button>
            </div>
          </>
        ) : null}

        {activeTab === "Database Maintenance" ? (
          <>
            <div className="info-grid">
              <div className="info-item"><span>Database Connection</span><strong><StatusBadge value="ACTIVE" label="Connected" /></strong></div>
              <Info label="Database Size" value="84.2 MB" />
              <Info label="Number of Tables" value="18" />
              <Info label="Record Count Summary" value="12,486 records" />
              <Info label="Last Maintenance Activity" value="Oct 6, 2026 · 9:10 PM" />
              <div className="info-item"><span>Data Integrity</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
            </div>
            <div className="notice" style={{ marginTop: 14 }}>
              The portal exposes only approved maintenance workflows. There is no raw SQL console or unrestricted table editor.
            </div>
            <div className="action-row" style={{ marginTop: 14 }}>
              <Button onClick={() => setMaintenanceOpen(true)}>Run Approved Maintenance</Button>
              <Button variant="secondary" onClick={() => setMessage("Database status and statistics refreshed in the current frontend session.")}>Refresh Database Status</Button>
            </div>
          </>
        ) : null}

        {activeTab === "Backup & Recovery" ? (
          <>
            <div className="action-row" style={{ marginBottom: 14 }}>
              <Button onClick={() => setMessage("Backup creation queued in mock mode. The final implementation will call the database backup service.")}>Backup Now</Button>
            </div>
            <DataTable
              rowKey="reference"
              rows={BACKUPS}
              onRowClick={setSelectedBackup}
              getRowAriaLabel={(row) => `View backup ${row.reference}`}
              columns={[
                { key: "reference", label: "Backup Reference" },
                { key: "date", label: "Date" },
                { key: "size", label: "Size" },
                { key: "status", label: "Status", render: (row) => <StatusBadge value="COMPLETED" label={row.status} /> },
                { key: "createdBy", label: "Created By" },
              ]}
            />
          </>
        ) : null}
      </Tabs>

      <Modal
        open={editSystemOpen}
        title="Edit System Settings"
        onClose={() => setEditSystemOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditSystemOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setSystemSettings(draftSystem);
              setEditSystemOpen(false);
              setMessage("System settings saved in the current frontend session.");
            }}>
              Save Settings
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field"><span>Application Name</span><input value={draftSystem.applicationName} onChange={(event) => setDraftSystem({ ...draftSystem, applicationName: event.target.value })} /></label>
          <label className="field"><span>Default System Timezone</span><input value={draftSystem.timezone} onChange={(event) => setDraftSystem({ ...draftSystem, timezone: event.target.value })} /></label>
          <label className="field"><span>Technical Notification Settings</span><select value={draftSystem.technicalNotifications} onChange={(event) => setDraftSystem({ ...draftSystem, technicalNotifications: event.target.value })}><option>Enabled</option><option>Disabled</option></select></label>
          <label className="field"><span>Maintenance Mode</span><select value={draftSystem.maintenanceMode} onChange={(event) => setDraftSystem({ ...draftSystem, maintenanceMode: event.target.value })}><option>Off</option><option>On</option></select></label>
          <label className="field"><span>Logging Level</span><select value={draftSystem.loggingLevel} onChange={(event) => setDraftSystem({ ...draftSystem, loggingLevel: event.target.value })}><option>Standard</option><option>Detailed</option><option>Minimal</option></select></label>
        </div>
      </Modal>

      <Modal
        open={editSecurityOpen}
        title="Edit Security Settings"
        onClose={() => setEditSecurityOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditSecurityOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setSecuritySettings(draftSecurity);
              setEditSecurityOpen(false);
              setMessage("Security settings saved in the current frontend session.");
            }}>
              Save Security Settings
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field"><span>Session Timeout</span><input value={draftSecurity.sessionTimeout} onChange={(event) => setDraftSecurity({ ...draftSecurity, sessionTimeout: event.target.value })} /></label>
          <label className="field"><span>Login Attempt Limit</span><input type="number" min="1" value={draftSecurity.loginAttemptLimit} onChange={(event) => setDraftSecurity({ ...draftSecurity, loginAttemptLimit: event.target.value })} /></label>
          <label className="field"><span>Password Policy</span><select value={draftSecurity.passwordPolicy} onChange={(event) => setDraftSecurity({ ...draftSecurity, passwordPolicy: event.target.value })}><option>Standard</option><option>Strict</option></select></label>
          <label className="field"><span>Account Lockout</span><select value={draftSecurity.accountLockout} onChange={(event) => setDraftSecurity({ ...draftSecurity, accountLockout: event.target.value })}><option>Enabled</option><option>Disabled</option></select></label>
        </div>
      </Modal>

      <Modal
        open={maintenanceOpen}
        title="Run Approved Database Maintenance"
        onClose={() => setMaintenanceOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMaintenanceOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setMaintenanceOpen(false);
              setMessage("Approved database maintenance completed in mock mode.");
            }}>
              Run Maintenance
            </Button>
          </>
        }
      >
        <div className="notice warning">
          This confirmation prevents accidental maintenance execution. The future Supabase implementation should call only approved maintenance functions and preserve an audit record.
        </div>
        <Details items={[
          ["Operation", "Approved project maintenance"],
          ["Current Database Status", "Connected"],
          ["Data Integrity", "Healthy"],
          ["Audit Requirement", "Record administrator, timestamp, operation, and result"],
        ]} />
      </Modal>

      <Modal
        open={Boolean(selectedBackup) && !restoreOpen}
        title={selectedBackup ? `Backup ${selectedBackup.reference}` : "Backup Details"}
        onClose={() => setSelectedBackup(null)}
        className="system-admin-detail-modal"
        footer={
          selectedBackup ? (
            <>
              <Button variant="ghost" onClick={() => setSelectedBackup(null)}>Close</Button>
              <Button variant="secondary" onClick={() => setMessage(`Download prepared for ${selectedBackup.reference} in mock mode.`)}>Download Backup</Button>
              <Button variant="danger" onClick={() => setRestoreOpen(true)}>Restore Backup</Button>
            </>
          ) : null
        }
      >
        {selectedBackup ? (
          <Details items={[
            ["Backup Reference", selectedBackup.reference],
            ["Date", selectedBackup.date],
            ["Time", selectedBackup.time],
            ["Backup Size", selectedBackup.size],
            ["Status", selectedBackup.status],
            ["Backup Type", selectedBackup.type],
            ["Created By", selectedBackup.createdBy],
            ["Integrity Check", selectedBackup.checksum],
          ]} />
        ) : null}
      </Modal>

      <Modal
        open={restoreOpen && Boolean(selectedBackup)}
        title="Confirm Backup Restore"
        onClose={() => setRestoreOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestoreOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => {
              setRestoreOpen(false);
              setSelectedBackup(null);
              setMessage("Restore confirmation completed in mock mode. No database data was changed.");
            }}>
              Confirm Restore
            </Button>
          </>
        }
      >
        {selectedBackup ? (
          <>
            <Details items={[
              ["Selected Backup", selectedBackup.reference],
              ["Backup Date", `${selectedBackup.date} · ${selectedBackup.time}`],
              ["Backup Size", selectedBackup.size],
            ]} />
            <div className="notice warning" style={{ marginTop: 14 }}>
              Restoring a backup is a high impact operation. The production implementation must record the administrator, timestamp, backup reference, and restore result.
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
