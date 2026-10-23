"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Modal, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { Info, Panel } from "./RegistrarShared";
import RegistrarActionResultModal from "./RegistrarActionResultModal";
import { registrarDebug } from "@/features/registrar/registrar-client-utils";
import {
  changeRegistrarPassword,
  updateRegistrarPreferences,
} from "@/features/registrar/registrar-actions";

function prefValue(preferences, key) {
  const value = preferences?.[key];
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "enabled" in value) return Boolean(value.enabled);
  return true;
}

export default function RegistrarProfile({ profileData }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState({ newPassword: "", confirmPassword: "" });
  const [preferences, setPreferences] = useState({
    enrollment_alerts: prefValue(profileData.preferences, "enrollment_alerts"),
    grade_import_alerts: prefValue(profileData.preferences, "grade_import_alerts"),
    announcement_alerts: prefValue(profileData.preferences, "announcement_alerts"),
    correction_alerts: prefValue(profileData.preferences, "correction_alerts"),
  });

  useEffect(() => {
    if (!profileData.capabilities?.editIdentity) {
      registrarDebug("info", "Profile", "Identity and staff-assignment fields are managed outside the Registrar profile editor.");
    }
  }, [profileData.capabilities]);

  function run(action, onSuccess) {
    startTransition(async () => {
      const response = await action();
      setResult(response);
      if (response.ok) onSuccess?.();
    });
  }

  return (
    <>
      <PageHeader
        title="Registrar Profile"
        description="Registrar account information, password management, and notification preferences."
      />

      <Panel
        title="Registrar Information"
        subtitle="Review your Registrar account and staff information."
      >
        <div className="info-grid">
          <Info label="Registrar Name" value={profileData.user.full_name || "Not available"} />
          <Info label="University / Employee ID" value={profileData.staff?.employee_id || profileData.user.source_account_key || "Not available"} />
          <Info label="Registered Email" value={profileData.user.email || "Not available"} />
          <Info label="Assigned Role" value="Registrar" />
          <div className="info-item">
            <span>Account Status</span>
            <strong><StatusBadge value={profileData.user.account_status === "Active" ? "ACTIVE" : "INACTIVE"} label={profileData.user.account_status} /></strong>
          </div>
          <Info label="Login Enabled" value={profileData.user.login_enabled ? "Yes" : "No"} />
          <Info label="Office / Department" value={profileData.organization?.name || profileData.staff?.office_name || "Not available"} />
          <Info label="Position" value={profileData.staff?.position_title || "Not available"} />
          <Info label="Last Login" value={profileData.user.lastLoginLabel} />
          <Info label="Account Created" value={profileData.user.createdAtLabel} />
        </div>

        <div className="action-row" style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={() => setPasswordOpen(true)}>Change Own Password</Button>
        </div>

        <div className="notice" style={{ marginTop: 14 }}>
          Name, email, employee ID, role, account status, and organizational assignment are managed by the System Administrator.
        </div>
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel title="Notification Preferences" subtitle="Choose which Registrar notifications you want to receive.">
          <div className="list-stack">
            {[
              ["enrollment_alerts", "Enrollment processing alerts"],
              ["grade_import_alerts", "Official grade import alerts"],
              ["announcement_alerts", "Enrollment announcement activity"],
              ["correction_alerts", "Correction and validation alerts"],
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
            <Button disabled={isPending} onClick={() => run(() => updateRegistrarPreferences(preferences))}>
              {isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </Panel>
      </div>

      <Modal
        open={passwordOpen}
        title="Change Own Password"
        onClose={() => setPasswordOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button
              disabled={isPending || password.newPassword.length < 12 || password.newPassword !== password.confirmPassword}
              onClick={() =>
                run(
                  () => changeRegistrarPassword(password),
                  () => {
                    setPasswordOpen(false);
                    setPassword({ newPassword: "", confirmPassword: "" });
                  },
                )
              }
            >
              {isPending ? "Saving..." : "Change Password"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field full">
            <span>New Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password.newPassword}
              onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
            />
          </label>
          <label className="field full">
            <span>Confirm New Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password.confirmPassword}
              onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })}
            />
          </label>
        </div>
        <div className="notice" style={{ marginTop: 14 }}>
          Choose a strong password that you do not use for another account.
        </div>
      </Modal>

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
