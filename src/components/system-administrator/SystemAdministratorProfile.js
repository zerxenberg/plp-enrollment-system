
"use client";

import { useMemo, useState } from "react";
import { Button, Modal, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getDemoSession } from "@/lib/auth/demo-auth";
import { Feedback, Info, Panel } from "@/components/registrar/RegistrarShared";

export default function SystemAdministratorProfile() {
  const { systemAdministrators } = useDemoData();
  const [editOpen, setEditOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [preferences, setPreferences] = useState({
    technicalAlerts: true,
    securityAlerts: true,
    backupAlerts: true,
    integrationAlerts: true,
  });

  const administrator = useMemo(() => {
    const identifier = String(getDemoSession()?.identifier || "").toLowerCase();

    return (
      systemAdministrators.find((item) =>
        [item.username, item.employeeId, item.email]
          .map((value) => String(value || "").toLowerCase())
          .includes(identifier)
      ) || systemAdministrators[0]
    );
  }, [systemAdministrators]);

  function openEdit() {
    setEmail(administrator.email);
    setEditOpen(true);
  }

  return (
    <>
      <PageHeader
        title="System Administrator Profile"
        description="Account information and technical notification preferences."
      />

      <Panel title="Account Information" subtitle="Role, permissions, and account status remain protected technical identity fields.">
        <div className="info-grid">
          <Info label="Administrator Name" value={administrator.fullName} />
          <Info label="Administrator ID" value={administrator.employeeId} />
          <Info label="Role" value={administrator.assignedRole} />
          <Info label="Department" value={administrator.department} />
          <Info label="Position" value={administrator.position} />
          <Info label="Email" value={administrator.email} />
          <div className="info-item"><span>Account Status</span><strong><StatusBadge value={administrator.accountStatus === "Active" ? "ACTIVE" : "INACTIVE"} label={administrator.accountStatus} /></strong></div>
          <Info label="Last Login" value={administrator.lastLogin} />
        </div>

        <div className="action-row" style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={openEdit}>Edit Allowed Personal Information</Button>
          <Button variant="secondary" onClick={() => setMessage("Password changes will be connected through Supabase Authentication during backend integration.")}>Change Password</Button>
        </div>
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel title="Technical Notification Preferences" subtitle="Frontend demo preferences only until persistent user settings are connected.">
          <div className="list-stack">
            {[
              ["technicalAlerts", "General technical alerts"],
              ["securityAlerts", "Security and access alerts"],
              ["backupAlerts", "Backup and recovery alerts"],
              ["integrationAlerts", "API and synchronization alerts"],
            ].map(([key, label]) => (
              <label className="list-item" key={key}>
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="action-row" style={{ marginTop: 14 }}>
            <Button onClick={() => setMessage("Technical notification preferences saved in the current frontend session.")}>Save Preferences</Button>
            <Button variant="ghost" onClick={() => {
              setPreferences({
                technicalAlerts: true,
                securityAlerts: true,
                backupAlerts: true,
                integrationAlerts: true,
              });
              setMessage("Preference changes cancelled.");
            }}>
              Cancel
            </Button>
          </div>
          <Feedback message={message} />
        </Panel>
      </div>

      <Modal
        open={editOpen}
        title="Edit Allowed Personal Information"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setEditOpen(false);
              setMessage(`Email change to ${email || administrator.email} prepared in mock mode. Persistent profile updates will move to Supabase later.`);
            }}>
              Save
            </Button>
          </>
        }
      >
        <label className="field full">
          Registered Staff Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="notice" style={{ marginTop: 12 }}>
          Administrator ID, role, account status, and permissions are not personal profile fields and cannot be edited here.
        </div>
      </Modal>
    </>
  );
}
