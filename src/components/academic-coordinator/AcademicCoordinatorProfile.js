
"use client";

import { useMemo, useState } from "react";
import { Button, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getDemoSession } from "@/lib/auth/demo-auth";
import { Feedback, Info, Panel } from "@/components/registrar/RegistrarShared";

export default function AcademicCoordinatorProfile() {
  const { academicCoordinators } = useDemoData();
  const [academicAlerts, setAcademicAlerts] = useState(true);
  const [capacityWarnings, setCapacityWarnings] = useState(true);
  const [reviewRequests, setReviewRequests] = useState(true);
  const [message, setMessage] = useState("");

  const account = useMemo(() => {
    const identifier = String(getDemoSession()?.identifier || "").toLowerCase();

    return (
      academicCoordinators.find((item) =>
        [item.username, item.employeeId, item.email]
          .map((value) => String(value || "").toLowerCase())
          .includes(identifier)
      ) || academicCoordinators[0]
    );
  }, [academicCoordinators]);

  return (
    <>
      <PageHeader
        title="Academic Coordinator Profile"
        description="View the Academic Coordinator account and demonstration notification preferences."
      />

      <Panel title="Account Information" subtitle="Profile access remains limited to allowed personal information and account preferences.">
        <div className="info-grid">
          <Info label="Academic Coordinator Name" value={account.fullName} />
          <Info label="Account ID" value={account.employeeId} />
          <Info label="Role" value={account.assignedRole} />
          <Info label="Department" value={account.department} />
          <Info label="Position" value={account.position} />
          <Info label="Email" value={account.email} />
          <div className="info-item"><span>Account Status</span><strong><StatusBadge value={account.accountStatus === "Active" ? "ACTIVE" : "INACTIVE"} label={account.accountStatus} /></strong></div>
          <Info label="Last Login" value={account.lastLogin} />
        </div>

        <div className="action-row" style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={() => setMessage("Edit Allowed Personal Information selected in mock mode.")}>Edit Allowed Personal Information</Button>
          <Button variant="secondary" onClick={() => setMessage("Password changes will be connected through the authentication service.")}>Change Password</Button>
        </div>
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel title="Notification Preferences" subtitle="These preferences are local to this frontend demo session.">
          <div className="list-stack">
            <label className="list-item"><input type="checkbox" checked={academicAlerts} onChange={(event) => setAcademicAlerts(event.target.checked)} /> Academic alerts and curriculum notices</label>
            <label className="list-item"><input type="checkbox" checked={capacityWarnings} onChange={(event) => setCapacityWarnings(event.target.checked)} /> Capacity and schedule warnings</label>
            <label className="list-item"><input type="checkbox" checked={reviewRequests} onChange={(event) => setReviewRequests(event.target.checked)} /> Academic review requests</label>
          </div>
          <div className="action-row" style={{ marginTop: 14 }}>
            <Button onClick={() => setMessage("Demo notification preferences saved for this page session.")}>Save</Button>
            <Button variant="ghost" onClick={() => { setAcademicAlerts(true); setCapacityWarnings(true); setReviewRequests(true); setMessage("Preference changes cancelled."); }}>Cancel</Button>
          </div>
          <Feedback message={message} />
        </Panel>
      </div>
    </>
  );
}
