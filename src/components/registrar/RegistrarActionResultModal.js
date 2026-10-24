"use client";

import { useEffect } from "react";
import { Button, Modal, StatusBadge } from "@/components/ui/PortalUI";
import {
  registrarResultDebug,
  registrarSafeMessage,
} from "@/features/registrar/registrar-client-utils";

export default function RegistrarActionResultModal({ result, onClose }) {
  const issues = result?.data?.blocking_issues || result?.data?.blockingIssues || [];
  const batchResults = result?.data?.results || [];

  useEffect(() => {
    if (result) registrarResultDebug(result);
  }, [result]);

  if (!result) return null;

  return (
    <Modal
      open={Boolean(result)}
      title={result.ok ? "Action Completed" : "Action Not Completed"}
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      className="registrar-result-modal"
    >
      <div className={`notice ${result.ok ? "" : "warning"}`.trim()}>
        <strong>{registrarSafeMessage(result.message, result.ok)}</strong>
      </div>

      {issues.length ? (
        <div className="list-stack" style={{ marginTop: 14 }}>
          {issues.map((issue, index) => (
            <div className="list-item" key={`issue-${index}`}>
              <div className="list-item-header">
                <strong>Enrollment requirement</strong>
                <StatusBadge value="REQUIRES_CORRECTION" label="Needs Attention" />
              </div>
              <p>{registrarSafeMessage(issue.message || "This enrollment requirement needs attention.")}</p>
            </div>
          ))}
        </div>
      ) : null}

      {batchResults.length ? (
        <div className="list-stack" style={{ marginTop: 14 }}>
          {batchResults.map((item, index) => (
            <div className="list-item" key={item.studentId || index}>
              <div className="list-item-header">
                <strong>Student confirmation</strong>
                <StatusBadge value={item.ok ? "COMPLETED" : "FAILED"} label={item.ok ? "Confirmed" : "Unconfirmed"} />
              </div>
              <p>{item.ok ? "Enrollment confirmed." : "This student could not be confirmed. Review the enrollment record and try again."}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
