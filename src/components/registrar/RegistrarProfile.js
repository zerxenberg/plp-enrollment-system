"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PortalUI";
import { Info, Panel } from "./RegistrarShared";
import { loadRegistrarProfile } from "@/features/notifications/registrar-notifications-actions";

export default function RegistrarProfile() {
  const [result, setResult] = useState({ kind: "loading" });
  useEffect(() => {
    let active = true;
    loadRegistrarProfile().then((data) => { if (active) setResult(data); })
      .catch(() => { if (active) setResult({ kind: "unavailable" }); });
    return () => { active = false; };
  }, []);
  return (
    <>
      <PageHeader title="Registrar Profile" description="View your authenticated Registrar account information." />
      {result.kind === "loading" ? <p className="notice" role="status">Loading account information…</p> : null}
      {result.kind === "unavailable" ? <p className="notice warning" role="alert">
        Your account information is temporarily unavailable.
      </p> : null}
      {result.kind === "ready" ? <Panel title="Account Information">
        <div className="info-grid">
          <Info label="Registrar Name" value={result.account.fullName} />
          <Info label="Account Reference" value={result.account.accountId} />
          <Info label="Registered Email" value={result.account.email} />
          <Info label="Assigned Role" value={result.account.role} />
          <Info label="Account Status" value={result.account.status} />
        </div>
        <p className="notice" style={{ marginTop: 14 }}>
          Identity details and account permissions are managed by the System Administrator.
        </p>
      </Panel> : null}
    </>
  );
}
