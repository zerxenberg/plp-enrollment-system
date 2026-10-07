"use client";

import { useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, PageHeader } from "@/components/ui/PortalUI";
import { Panel, Info, Feedback } from "./RegistrarShared";

export default function RegistrarProfile() {
  const {registrar} = useDemoData();
  const account = registrar.registrar;
  const [enrollmentUpdates,setEnrollmentUpdates] = useState(true);
  const [corrections,setCorrections] = useState(true);
  const [message,setMessage] = useState("");

  return (
    <>
      <PageHeader title="Registrar Profile" description="View Registrar account details and demonstration notification preferences." />
      <Panel title="Account Information" subtitle="Profile and account security are governed by the assigned Registrar permissions.">
        <div className="info-grid"><Info label="Registrar Name" value={account.fullName} /><Info label="Registrar Account ID" value={account.accountId} /><Info label="Office" value={account.office} /><Info label="Email" value={account.email} /><Info label="Assigned Role" value={account.role} /><Info label="Account Status" value={account.accountStatus} /></div>
        <p className="notice" style={{marginTop:14}}>Changing account credentials or personal details requires the authentication and authorized profile service. This page displays demo account information.</p>
      </Panel>
      <div style={{marginTop:16}}><Panel title="Notification Preferences" subtitle="These preferences are local to this page demo session.">
        <div className="list-stack">
          <label className="list-item"><input type="checkbox" checked={enrollmentUpdates} onChange={(event)=>setEnrollmentUpdates(event.target.checked)} /> Enrollment status and validation updates</label>
          <label className="list-item"><input type="checkbox" checked={corrections} onChange={(event)=>setCorrections(event.target.checked)} /> Correction requests and responses</label>
        </div>
        <div className="action-row" style={{marginTop:14}}><Button type="button" onClick={()=>setMessage("Demo preferences retained until you leave this page.")}>Save Demo Preferences</Button></div>
        <Feedback message={message} />
      </Panel></div>
    </>
  );
}
