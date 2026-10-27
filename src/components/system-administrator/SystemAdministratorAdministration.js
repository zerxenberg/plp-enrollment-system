
"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui/PortalUI";
import {
  Details,
  Feedback,
  Info,
  Metric,
  Tabs,
} from "@/components/registrar/RegistrarShared";
import {
  runApprovedDatabaseMaintenance,
  updateSecuritySettings,
  updateSystemSettings,
} from "@/features/system-administration/system-admin-actions";

const TABS = [
  { value: "System Settings", label: "System Settings" },
  { value: "Security Settings", label: "Security Settings" },
  { value: "Database Maintenance", label: "Database Maintenance" },
  { value: "Backup & Recovery", label: "Backup & Recovery" },
];

function booleanLabel(value) {
  return value ? "Enabled" : "Disabled";
}

export default function SystemAdministratorAdministration({
  administrationData,
}) {
  const {
    systemSettings,
    securitySettings,
    maintenanceEvents,
    backups,
    databaseMetrics,
  } = administrationData;

  const [activeTab, setActiveTab] = useState("System Settings");
  const [feedback, setFeedback] = useState("");
  const [feedbackWarning, setFeedbackWarning] = useState(false);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [selectedMaintenance, setSelectedMaintenance] = useState(null);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [isPending, startTransition] = useTransition();

  const [systemForm, setSystemForm] = useState({
    applicationName: systemSettings?.application_name || "",
    timezoneName: systemSettings?.timezone_name || "Asia/Manila",
    technicalNotificationsEnabled:
      systemSettings?.technical_notifications_enabled ?? true,
    maintenanceMode: systemSettings?.maintenance_mode ?? false,
    loggingLevel: systemSettings?.logging_level || "Standard",
  });

  const [securityForm, setSecurityForm] = useState({
    sessionTimeoutMinutes: securitySettings?.session_timeout_minutes || 30,
    loginAttemptLimit: securitySettings?.login_attempt_limit || 5,
    passwordPolicy: securitySettings?.password_policy || "Standard",
    accountLockoutEnabled:
      securitySettings?.account_lockout_enabled ?? true,
  });

  function showResult(result) {
    setFeedback(result.message);
    setFeedbackWarning(!result.ok);
  }

  function saveSystemSettings() {
    startTransition(async () => {
      const result = await updateSystemSettings(systemForm);
      showResult(result);
      if (result.ok) {
        setSystemModalOpen(false);
      }
    });
  }

  function saveSecuritySettings() {
    startTransition(async () => {
      const result = await updateSecuritySettings(securityForm);
      showResult(result);
      if (result.ok) {
        setSecurityModalOpen(false);
      }
    });
  }

  function runMaintenance() {
    startTransition(async () => {
      const result = await runApprovedDatabaseMaintenance();
      showResult(result);
      if (result.ok) {
        setMaintenanceModalOpen(false);
      }
    });
  }

  return (
    <>
      <PageHeader
        title="System Administration"
        description="Technical configuration, database maintenance, security controls, and the Supabase backup registry."
      />

      <Tabs
        items={TABS}
        selected={activeTab}
        onSelect={(next) => {
          setActiveTab(next);
          setFeedback("");
          setSelectedMaintenance(null);
          setSelectedBackup(null);
        }}
        label="System administration sections"
        title="Technical Administration"
        subtitle="Live configuration values and maintenance records are read from Supabase. Changes are written through protected server actions."
      >
        <Feedback message={feedback} warning={feedbackWarning} />

        {activeTab === "System Settings" ? (
          <>
            {systemSettings ? (
              <div className="info-grid">
                <Info
                  label="Application Name"
                  value={systemSettings.application_name}
                />
                <Info
                  label="Default Timezone"
                  value={systemSettings.timezone_name}
                />
                <Info
                  label="Technical Notifications"
                  value={booleanLabel(
                    systemSettings.technical_notifications_enabled,
                  )}
                />
                <Info
                  label="Maintenance Mode"
                  value={systemSettings.maintenance_mode ? "On" : "Off"}
                />
                <Info
                  label="Logging Level"
                  value={systemSettings.logging_level}
                />
                <Info
                  label="Last Updated"
                  value={
                    systemSettings.updated_at
                      ? new Date(systemSettings.updated_at).toLocaleString()
                      : "Not recorded"
                  }
                />
              </div>
            ) : (
              <div className="notice warning">
                The singleton system settings row is missing from the database.
              </div>
            )}

            <div className="action-row" style={{ marginTop: 14 }}>
              <Button
                disabled={!systemSettings}
                onClick={() => {
                  setSystemForm({
                    applicationName: systemSettings?.application_name || "",
                    timezoneName:
                      systemSettings?.timezone_name || "Asia/Manila",
                    technicalNotificationsEnabled:
                      systemSettings?.technical_notifications_enabled ?? true,
                    maintenanceMode:
                      systemSettings?.maintenance_mode ?? false,
                    loggingLevel:
                      systemSettings?.logging_level || "Standard",
                  });
                  setSystemModalOpen(true);
                }}
              >
                Edit System Settings
              </Button>
            </div>
          </>
        ) : null}

        {activeTab === "Security Settings" ? (
          <>
            {securitySettings ? (
              <div className="info-grid">
                <Info
                  label="Session Timeout"
                  value={`${securitySettings.session_timeout_minutes} minutes`}
                />
                <Info
                  label="Login Attempt Limit"
                  value={securitySettings.login_attempt_limit}
                />
                <Info
                  label="Password Policy"
                  value={securitySettings.password_policy}
                />
                <Info
                  label="Account Lockout"
                  value={booleanLabel(
                    securitySettings.account_lockout_enabled,
                  )}
                />
                <div className="info-item">
                  <span>Supabase Authentication</span>
                  <strong>
                    <StatusBadge value="ACTIVE" label="Connected" />
                  </strong>
                </div>
                <Info
                  label="Last Updated"
                  value={
                    securitySettings.updated_at
                      ? new Date(securitySettings.updated_at).toLocaleString()
                      : "Not recorded"
                  }
                />
              </div>
            ) : (
              <div className="notice warning">
                The singleton security settings row is missing from the database.
              </div>
            )}

            <div className="notice" style={{ marginTop: 14 }}>
              Passwords, password hashes, Supabase secret keys, API secrets, and
              database credentials are never returned to this interface.
            </div>

            <div className="action-row" style={{ marginTop: 14 }}>
              <Button
                disabled={!securitySettings}
                onClick={() => {
                  setSecurityForm({
                    sessionTimeoutMinutes:
                      securitySettings?.session_timeout_minutes || 30,
                    loginAttemptLimit:
                      securitySettings?.login_attempt_limit || 5,
                    passwordPolicy:
                      securitySettings?.password_policy || "Standard",
                    accountLockoutEnabled:
                      securitySettings?.account_lockout_enabled ?? true,
                  });
                  setSecurityModalOpen(true);
                }}
              >
                Edit Security Settings
              </Button>
            </div>
          </>
        ) : null}

        {activeTab === "Database Maintenance" ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <Metric
                label="Database Size"
                value={databaseMetrics.databaseSizeLabel || "Not available"}
                hint="Current PostgreSQL database"
              />
              <Metric
                label="Public Tables"
                value={databaseMetrics.public_table_count ?? 0}
                hint="Application schema tables"
              />
              <Metric
                label="Estimated Records"
                value={databaseMetrics.estimated_record_count ?? 0}
                hint="PostgreSQL statistics estimate"
              />
              <Metric
                label="Last Maintenance"
                value={databaseMetrics.lastMaintenanceLabel || "Not recorded"}
                hint="Approved maintenance event"
              />
            </div>

            <div className="action-row" style={{ marginBottom: 14 }}>
              <Button onClick={() => setMaintenanceModalOpen(true)}>
                Run Approved Maintenance
              </Button>
            </div>

            <DataTable
              rowKey="id"
              rows={maintenanceEvents}
              onRowClick={setSelectedMaintenance}
              getRowAriaLabel={(row) =>
                `View database maintenance event ${row.id}`
              }
              emptyMessage="No database maintenance events have been recorded."
              columns={[
                { key: "operation", label: "Operation" },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => (
                    <StatusBadge
                      value={
                        row.status === "Completed"
                          ? "COMPLETED"
                          : row.status === "Failed"
                            ? "FAILED"
                            : row.status
                      }
                      label={row.status}
                    />
                  ),
                },
                { key: "startedAtLabel", label: "Started" },
                { key: "completedAtLabel", label: "Completed" },
              ]}
            />

            <div className="notice" style={{ marginTop: 14 }}>
              This portal exposes only the approved maintenance function defined
              in the database. It does not expose arbitrary SQL execution, table
              editing, database deletion, or schema destruction.
            </div>
          </>
        ) : null}

        {activeTab === "Backup & Recovery" ? (
          <>
            <div className="notice" style={{ marginBottom: 14 }}>
              Export selected Enrollment application records to an NDJSON file for secure offline
              archiving or analysis. This is not a complete PostgreSQL database backup,
              Supabase Auth export, or point in time recovery file. Treat downloads as
              confidential student data and store them securely.
            </div>
            <div className="action-row" style={{ marginBottom: 14 }}>
              <a className="btn btn-primary" href="/api/system-administrator/application-export">
                Download Application Data Backup
              </a>
            </div>

            <DataTable
              rowKey="id"
              rows={backups}
              onRowClick={setSelectedBackup}
              getRowAriaLabel={(row) =>
                `View backup record ${row.backup_reference}`
              }
              emptyMessage="No backup registry records are stored in the database."
              columns={[
                { key: "backup_reference", label: "Backup Reference" },
                { key: "backup_type", label: "Type" },
                { key: "startedAtLabel", label: "Started" },
                { key: "sizeLabel", label: "Size" },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => (
                    <StatusBadge
                      value={
                        row.status === "Successful"
                          ? "COMPLETED"
                          : row.status
                      }
                      label={row.status}
                    />
                  ),
                },
                { key: "integrity_status", label: "Integrity" },
              ]}
            />
          </>
        ) : null}
      </Tabs>

      <Modal
        open={systemModalOpen}
        title="Edit System Settings"
        onClose={() => setSystemModalOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => setSystemModalOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isPending} onClick={saveSystemSettings}>
              {isPending ? "Saving..." : "Save Settings"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>Application Name</span>
            <input
              value={systemForm.applicationName}
              onChange={(event) =>
                setSystemForm({
                  ...systemForm,
                  applicationName: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>Default Timezone</span>
            <input
              value={systemForm.timezoneName}
              onChange={(event) =>
                setSystemForm({
                  ...systemForm,
                  timezoneName: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>Technical Notifications</span>
            <select
              value={
                systemForm.technicalNotificationsEnabled
                  ? "Enabled"
                  : "Disabled"
              }
              onChange={(event) =>
                setSystemForm({
                  ...systemForm,
                  technicalNotificationsEnabled:
                    event.target.value === "Enabled",
                })
              }
            >
              <option>Enabled</option>
              <option>Disabled</option>
            </select>
          </label>
          <label className="field">
            <span>Maintenance Mode</span>
            <select
              value={systemForm.maintenanceMode ? "On" : "Off"}
              onChange={(event) =>
                setSystemForm({
                  ...systemForm,
                  maintenanceMode: event.target.value === "On",
                })
              }
            >
              <option>Off</option>
              <option>On</option>
            </select>
          </label>
          <label className="field">
            <span>Logging Level</span>
            <select
              value={systemForm.loggingLevel}
              onChange={(event) =>
                setSystemForm({
                  ...systemForm,
                  loggingLevel: event.target.value,
                })
              }
            >
              <option>Minimal</option>
              <option>Standard</option>
              <option>Detailed</option>
            </select>
          </label>
        </div>
      </Modal>

      <Modal
        open={securityModalOpen}
        title="Edit Security Settings"
        onClose={() => setSecurityModalOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => setSecurityModalOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isPending} onClick={saveSecuritySettings}>
              {isPending ? "Saving..." : "Save Security Settings"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>Session Timeout in Minutes</span>
            <input
              type="number"
              min="1"
              value={securityForm.sessionTimeoutMinutes}
              onChange={(event) =>
                setSecurityForm({
                  ...securityForm,
                  sessionTimeoutMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="field">
            <span>Login Attempt Limit</span>
            <input
              type="number"
              min="1"
              value={securityForm.loginAttemptLimit}
              onChange={(event) =>
                setSecurityForm({
                  ...securityForm,
                  loginAttemptLimit: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="field">
            <span>Password Policy</span>
            <select
              value={securityForm.passwordPolicy}
              onChange={(event) =>
                setSecurityForm({
                  ...securityForm,
                  passwordPolicy: event.target.value,
                })
              }
            >
              <option>Standard</option>
              <option>Strict</option>
            </select>
          </label>
          <label className="field">
            <span>Account Lockout</span>
            <select
              value={
                securityForm.accountLockoutEnabled ? "Enabled" : "Disabled"
              }
              onChange={(event) =>
                setSecurityForm({
                  ...securityForm,
                  accountLockoutEnabled: event.target.value === "Enabled",
                })
              }
            >
              <option>Enabled</option>
              <option>Disabled</option>
            </select>
          </label>
        </div>
      </Modal>

      <Modal
        open={maintenanceModalOpen}
        title="Run Approved Database Maintenance"
        onClose={() => setMaintenanceModalOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => setMaintenanceModalOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isPending} onClick={runMaintenance}>
              {isPending ? "Running..." : "Run Maintenance"}
            </Button>
          </>
        }
      >
        <div className="notice warning">
          This executes the approved database maintenance function in PostgreSQL.
          The operation records its start, completion result, responsible
          administrator, and audit event.
        </div>
        <Details
          items={[
            ["Scope", "Approved application tables"],
            ["Operation", "PostgreSQL ANALYZE"],
            ["Raw SQL Console", "Not exposed"],
            ["Audit Recording", "Required"],
          ]}
        />
      </Modal>

      <Modal
        open={Boolean(selectedMaintenance)}
        title="Database Maintenance Details"
        onClose={() => setSelectedMaintenance(null)}
        className="system-admin-detail-modal"
        footer={
          <Button onClick={() => setSelectedMaintenance(null)}>Close</Button>
        }
      >
        {selectedMaintenance ? (
          <Details
            items={[
              ["Event ID", selectedMaintenance.id],
              ["Operation", selectedMaintenance.operation],
              ["Status", selectedMaintenance.status],
              ["Details", selectedMaintenance.details],
              ["Performed By", selectedMaintenance.performed_by],
              ["Started", selectedMaintenance.startedAtLabel],
              ["Completed", selectedMaintenance.completedAtLabel],
            ]}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedBackup)}
        title="Backup Registry Details"
        onClose={() => setSelectedBackup(null)}
        className="system-admin-detail-modal"
        footer={<Button onClick={() => setSelectedBackup(null)}>Close</Button>}
      >
        {selectedBackup ? (
          <>
            <Details
              items={[
                ["Backup Reference", selectedBackup.backup_reference],
                ["Backup Type", selectedBackup.backup_type],
                ["Storage Path", selectedBackup.storage_path || "Not recorded"],
                ["Backup Size", selectedBackup.sizeLabel],
                ["Status", selectedBackup.status],
                ["Integrity Status", selectedBackup.integrity_status],
                ["Created By", selectedBackup.created_by || "Not recorded"],
                ["Started", selectedBackup.startedAtLabel],
                ["Completed", selectedBackup.completedAtLabel],
              ]}
            />
            <div className="notice" style={{ marginTop: 14 }}>
              This is a database registry record. Physical backup download and
              restore are not simulated by this application.
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
