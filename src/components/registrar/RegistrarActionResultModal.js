"use client";

import { Button, Modal, StatusBadge } from "@/components/ui/PortalUI";

export default function RegistrarActionResultModal({ result, onClose }) {
  if (!result) return null;
  const issues = result?.data?.blocking_issues || result?.data?.blockingIssues || [];
  const batchResults = result?.data?.results || [];

  return (
    <Modal
      open={Boolean(result)}
      title={result.ok ? "Action Completed" : "Action Not Completed"}
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      className="registrar-result-modal"
    >
      <div className={`notice ${result.ok ? "" : "warning"}`.trim()}>
        <strong>{result.message}</strong>
      </div>

      {issues.length ? (
        <div className="list-stack" style={{ marginTop: 14 }}>
          {issues.map((issue, index) => (
            <div className="list-item" key={`${issue.code || "issue"}-${index}`}>
              <div className="list-item-header">
                <strong>{issue.code || "Validation issue"}</strong>
                <StatusBadge value="REQUIRES_CORRECTION" label="Blocking" />
              </div>
              <p>{issue.message || "No additional detail was returned."}</p>
            </div>
          ))}
        </div>
      ) : null}

      {batchResults.length ? (
        <div className="list-stack" style={{ marginTop: 14 }}>
          {batchResults.map((item) => (
            <div className="list-item" key={item.studentId}>
              <div className="list-item-header">
                <strong>{item.studentId}</strong>
                <StatusBadge value={item.ok ? "COMPLETED" : "FAILED"} label={item.ok ? "Confirmed" : "Unconfirmed"} />
              </div>
              <p>{item.status || item.message || "No additional detail returned."}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
