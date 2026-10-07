
"use client";

import { useMemo, useState } from "react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getDemoSession } from "@/lib/auth/demo-auth";

export default function SystemAdministratorProfile() {
  const { systemAdministrators } = useDemoData();
  const [message, setMessage] = useState("");

  const administrator = useMemo(() => {
    const session = getDemoSession();
    const identifier = String(session?.identifier || "").toLowerCase();

    return (
      systemAdministrators.find((item) =>
        [item.username, item.employeeId, item.email]
          .map((value) => String(value || "").toLowerCase())
          .includes(identifier)
      ) || systemAdministrators[0]
    );
  }, [systemAdministrators]);

  return (
    <>
      <PageHeader
        title="System Administrator Profile"
        description="View the administrator account and allowed personal information."
      />

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      <Card className="section-card">
        <div className="info-grid">
          <div className="info-item"><span>Administrator Name</span><strong>{administrator.fullName}</strong></div>
          <div className="info-item"><span>Administrator ID</span><strong>{administrator.employeeId}</strong></div>
          <div className="info-item"><span>Role</span><strong>System Administrator</strong></div>
          <div className="info-item"><span>Account Status</span><strong><StatusBadge value={administrator.accountStatus === "Active" ? "ACTIVE" : "INACTIVE"} label={administrator.accountStatus} /></strong></div>
          <div className="info-item"><span>Last Login</span><strong>{administrator.lastLogin}</strong></div>
          <div className="info-item"><span>Email</span><strong>{administrator.email}</strong></div>
          <div className="info-item"><span>Department</span><strong>{administrator.department}</strong></div>
          <div className="info-item"><span>Position</span><strong>{administrator.position}</strong></div>
        </div>

        <div className="action-row" style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={() => setMessage("Edit Allowed Personal Information selected in mock mode.")}>Edit Allowed Personal Information</Button>
          <Button variant="secondary" onClick={() => setMessage("Change Password selected. Supabase Authentication will handle this later.")}>Change Password</Button>
          <Button variant="secondary" onClick={() => setMessage("Personal Preferences selected in mock mode.")}>Personal Preferences</Button>
        </div>
      </Card>
    </>
  );
}
