
"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui/PortalUI";
import {
  Feedback,
  Info,
  Panel,
} from "@/components/registrar/RegistrarShared";
import {
  changeSystemAdministratorPassword,
  updateSystemAdministratorPreferences,
  updateSystemAdministratorProfile,
} from "@/features/system-administration/system-admin-actions";

function preferenceValue(preferences, key, fallback = true) {
  const value = preferences?.[key];
  return typeof value === "boolean" ? value : fallback;
}

export default function SystemAdministratorProfile({ profileData }) {
  const { user, staff, organization, preferences } = profileData;

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackWarning, setFeedbackWarning] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [profileForm, setProfileForm] = useState({
    fullName: user.full_name || "",
    email: user.email || "",
    employeeId: staff?.employee_id || "",
    positionTitle: staff?.position_title || "",
    officeName: staff?.office_name || "",
  });

  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const [preferenceForm, setPreferenceForm] = useState({
    technicalAlerts: preferenceValue(
      preferences,
      "technical_alerts",
      true,
    ),
    securityAlerts: preferenceValue(
      preferences,
      "security_alerts",
      true,
    ),
    backupAlerts: preferenceValue(
      preferences,
      "backup_alerts",
      true,
    ),
    integrationAlerts: preferenceValue(
      preferences,
      "integration_alerts",
      true,
    ),
  });

  function showResult(result) {
    setFeedback(result.message);
    setFeedbackWarning(!result.ok);
  }

  function saveProfile() {
    startTransition(async () => {
      const result = await updateSystemAdministratorProfile(profileForm);
      showResult(result);
      if (result.ok) {
        setProfileOpen(false);
      }
    });
  }

  function savePassword() {
    startTransition(async () => {
      const result = await changeSystemAdministratorPassword(passwordForm);
      showResult(result);
      if (result.ok) {
        setPasswordOpen(false);
        setPasswordForm({
          newPassword: "",
          confirmPassword: "",
        });
      }
    });
  }

  function savePreferences() {
    startTransition(async () => {
      const result =
        await updateSystemAdministratorPreferences(preferenceForm);
      showResult(result);
    });
  }

  return (
    <>
      <PageHeader
        title="System Administrator Profile"
        description="Live administrator account information and technical notification preferences."
      />

      <Panel
        title="Account Information"
        subtitle="Identity and staff profile data are read from Supabase."
      >
        <Feedback message={feedback} warning={feedbackWarning} />

        <div className="info-grid">
          <Info label="Administrator Name" value={user.full_name} />
          <Info
            label="Administrator ID"
            value={staff?.employee_id || "Not recorded"}
          />
          <Info label="Role" value="System Administrator" />
          <Info
            label="Department"
            value={organization?.name || "Not recorded"}
          />
          <Info
            label="Position"
            value={staff?.position_title || "Not recorded"}
          />
          <Info label="Email" value={user.email} />
          <div className="info-item">
            <span>Account Status</span>
            <strong>
              <StatusBadge
                value={
                  user.account_status === "Active"
                    ? "ACTIVE"
                    : "INACTIVE"
                }
                label={user.account_status}
              />
            </strong>
          </div>
          <Info
            label="Login Enabled"
            value={user.login_enabled ? "Yes" : "No"}
          />
          <Info
            label="Last Login"
            value={user.lastLoginLabel}
          />
          <Info
            label="Account Created"
            value={user.createdAtLabel}
          />
        </div>

        <div className="action-row" style={{ marginTop: 14 }}>
          <Button
            variant="secondary"
            onClick={() => {
              setProfileForm({
                fullName: user.full_name || "",
                email: user.email || "",
                employeeId: staff?.employee_id || "",
                positionTitle: staff?.position_title || "",
                officeName: staff?.office_name || "",
              });
              setProfileOpen(true);
            }}
          >
            Edit Allowed Personal Information
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPasswordOpen(true)}
          >
            Change Password
          </Button>
        </div>
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel
          title="Technical Notification Preferences"
          subtitle="These preferences are persisted in the user_preferences table."
        >
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
                  checked={preferenceForm[key]}
                  onChange={(event) =>
                    setPreferenceForm({
                      ...preferenceForm,
                      [key]: event.target.checked,
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <div className="action-row" style={{ marginTop: 14 }}>
            <Button disabled={isPending} onClick={savePreferences}>
              {isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </Panel>
      </div>

      <Modal
        open={profileOpen}
        title="Edit Allowed Personal Information"
        onClose={() => setProfileOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => setProfileOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isPending} onClick={saveProfile}>
              {isPending ? "Saving..." : "Save Profile"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>Full Name</span>
            <input
              value={profileForm.fullName}
              onChange={(event) =>
                setProfileForm({
                  ...profileForm,
                  fullName: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>Registered Staff Email</span>
            <input
              type="email"
              value={profileForm.email}
              onChange={(event) =>
                setProfileForm({
                  ...profileForm,
                  email: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>Employee ID</span>
            <input
              value={profileForm.employeeId}
              onChange={(event) =>
                setProfileForm({
                  ...profileForm,
                  employeeId: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>Position</span>
            <input
              value={profileForm.positionTitle}
              onChange={(event) =>
                setProfileForm({
                  ...profileForm,
                  positionTitle: event.target.value,
                })
              }
            />
          </label>
          <label className="field full">
            <span>Office</span>
            <input
              value={profileForm.officeName}
              onChange={(event) =>
                setProfileForm({
                  ...profileForm,
                  officeName: event.target.value,
                })
              }
            />
          </label>
        </div>

        <div className="notice" style={{ marginTop: 14 }}>
          Role, account status, permissions, and organizational unit are access
          administration fields and are not editable as personal profile data.
        </div>
      </Modal>

      <Modal
        open={passwordOpen}
        title="Change Password"
        onClose={() => setPasswordOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => setPasswordOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={isPending} onClick={savePassword}>
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
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  newPassword: event.target.value,
                })
              }
            />
          </label>
          <label className="field full">
            <span>Confirm New Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm({
                  ...passwordForm,
                  confirmPassword: event.target.value,
                })
              }
            />
          </label>
        </div>

        <div className="notice" style={{ marginTop: 14 }}>
          The new password is sent directly to Supabase Auth and is never stored
          in an application table.
        </div>
      </Modal>
    </>
  );
}
