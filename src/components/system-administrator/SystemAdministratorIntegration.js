
"use client";

import { useState } from "react";
import { Button, Card, DataTable, InternalTabs, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

const TABS = ["Integration Overview", "API Status", "API Requests", "Synchronization", "Failed Requests", "Imported Records", "Integration Settings"];

const REQUESTS = [
  { requestId: "API-REQ-1042", requestType: "Accepted Applicant Import", source: "Admission System", endpoint: "/api/admissions/accepted", timestamp: "Oct 7, 2026 · 5:42 PM", responseCode: "200", status: "Successful", processingTime: "184 ms" },
  { requestId: "API-REQ-1041", requestType: "Accepted Applicant Import", source: "Admission System", endpoint: "/api/admissions/accepted", timestamp: "Oct 7, 2026 · 4:18 PM", responseCode: "422", status: "Failed", processingTime: "96 ms" },
];

const SYNCHRONIZATIONS = [
  { reference: "SYNC-2026-0342", applicantReference: "APP-2026-0149", direction: "Admission → Enrollment", currentStatus: "Successful", lastAttempt: "Oct 7 · 5:42 PM", result: "Created Student Record" },
  { reference: "SYNC-2026-0341", applicantReference: "APP-2026-0148", direction: "Admission → Enrollment", currentStatus: "Failed", lastAttempt: "Oct 7 · 4:18 PM", result: "Missing Approved Program" },
  { reference: "SYNC-2026-0340", applicantReference: "APP-2026-0144", direction: "Admission → Enrollment", currentStatus: "Successful", lastAttempt: "Oct 7 · 3:40 PM", result: "Updated Existing Record" },
  { reference: "SYNC-2026-0339", applicantReference: "APP-2026-0144", direction: "Admission → Enrollment", currentStatus: "Successful", lastAttempt: "Oct 7 · 3:32 PM", result: "Duplicate Detected · Existing Record Reused" },
];

const FAILED = [
  { requestId: "API-REQ-1041", applicantReference: "APP-2026-0148", errorType: "Validation Error", errorMessage: "Approved program is required.", attemptCount: 2, lastAttempt: "Oct 7 · 4:18 PM", timestamp: "Oct 7, 2026 · 4:18 PM" },
];

const IMPORTED = [
  { applicantReference: "APP-2026-0149", receivedDate: "Oct 7, 2026 · 5:42 PM", approvedProgram: "BS Information Technology", admissionStatus: "COMPLETED", apiRequestReference: "API-REQ-1042", synchronizationStatus: "Successful" },
  { applicantReference: "APP-2026-0144", receivedDate: "Oct 7, 2026 · 3:40 PM", approvedProgram: "BS Computer Science", admissionStatus: "COMPLETED", apiRequestReference: "API-REQ-1039", synchronizationStatus: "Updated Existing Record" },
];

export default function SystemAdministratorIntegration() {
  const [activeTab, setActiveTab] = useState("Integration Overview");
  const [message, setMessage] = useState("");

  return (
    <>
      <PageHeader
        title="System Integration"
        description="Monitor the REST API connection, synchronization, imported records, failures, and protected integration settings."
        actions={<Button variant="secondary" onClick={() => setMessage("Integration status refreshed.")}>Refresh Status</Button>}
      />

      <InternalTabs items={TABS.map((value) => ({ value, label: value }))} selected={activeTab} onSelect={setActiveTab} label="System integration sections">

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      {activeTab === "Integration Overview" ? (
        <div className="content-grid">
          <Card className="metric-card span-3"><span className="metric-label">Admission System Status</span><strong className="metric-value">Connected</strong><span className="metric-meta">Authenticated connection</span></Card>
          <Card className="metric-card span-3"><span className="metric-label">Successful Transfers</span><strong className="metric-value">42</strong><span className="metric-meta">Current enrollment period</span></Card>
          <Card className="metric-card span-3"><span className="metric-label">Failed Transfers</span><strong className="metric-value">2</strong><span className="metric-meta">Require review</span></Card>
          <Card className="metric-card span-3"><span className="metric-label">Pending Transfers</span><strong className="metric-value">1</strong><span className="metric-meta">Awaiting retry</span></Card>
          <Card className="section-card span-12">
            <div className="detail-list">
              <div className="detail-row"><span>API Status</span><strong><StatusBadge value="ACTIVE" label="Connected" /></strong></div>
              <div className="detail-row"><span>Last Successful Request</span><strong>Oct 7, 2026 · 5:42 PM</strong></div>
              <div className="detail-row"><span>Last Failed Request</span><strong>Oct 7, 2026 · 4:18 PM</strong></div>
              <div className="detail-row"><span>Average Response Time</span><strong>143 ms</strong></div>
            </div>
            <div className="action-row" style={{ marginTop: 12 }}>
              <Button onClick={() => setActiveTab("API Status")}>Open API Status</Button>
              <Button variant="secondary" onClick={() => setActiveTab("Failed Requests")}>View Failed Requests</Button>
              <Button variant="secondary" onClick={() => setMessage("Mock API connection test succeeded.")}>Test Connection</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "API Status" ? (
        <Card className="section-card">
          <div className="info-grid">
            <div className="info-item"><span>API Connection Status</span><strong><StatusBadge value="ACTIVE" label="Connected" /></strong></div>
            <div className="info-item"><span>Endpoint</span><strong>https://admission.plp.local/api/accepted-applicants</strong></div>
            <div className="info-item"><span>Authentication Status</span><strong><StatusBadge value="ACTIVE" label="Authenticated" /></strong></div>
            <div className="info-item"><span>Last Response</span><strong>Accepted applicant synchronized</strong></div>
            <div className="info-item"><span>Response Code</span><strong>200</strong></div>
            <div className="info-item"><span>Last Successful Connection</span><strong>Oct 7, 2026 · 5:42 PM</strong></div>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button onClick={() => setMessage("Mock API connection test succeeded.")}>Test Connection</Button>
            <Button variant="secondary" onClick={() => setMessage("API status refreshed.")}>Refresh</Button>
            <Button variant="secondary" onClick={() => setActiveTab("Integration Settings")}>View Configuration</Button>
            <Button variant="secondary" onClick={() => setActiveTab("API Requests")}>View Recent Requests</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "API Requests" ? (
        <Card className="section-card">
          <DataTable
            rowKey="requestId"
            rows={REQUESTS}
            columns={[
              { key: "requestId", label: "Request ID" },
              { key: "requestType", label: "Request Type" },
              { key: "source", label: "Source" },
              { key: "endpoint", label: "Endpoint" },
              { key: "timestamp", label: "Timestamp" },
              { key: "responseCode", label: "Response Code" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status === "Successful" ? "COMPLETED" : "FAILED"} label={row.status} /> },
              { key: "processingTime", label: "Processing Time" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Request details opened in mock mode.")}>View Request Details</Button>
            <Button variant="secondary" onClick={() => setMessage("Response details opened in mock mode.")}>View Response</Button>
            <Button variant="secondary" onClick={() => setMessage("Technical log exported in mock mode.")}>Export Technical Log</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Synchronization" ? (
        <Card className="section-card">
          <div className="notice" style={{ marginBottom: 12 }}>Repeated accepted applicant references reuse or update the existing linked student record.</div>
          <DataTable
            rowKey="reference"
            rows={SYNCHRONIZATIONS}
            columns={[
              { key: "reference", label: "Synchronization Reference" },
              { key: "applicantReference", label: "Applicant Reference" },
              { key: "direction", label: "Direction" },
              { key: "currentStatus", label: "Current Status" },
              { key: "lastAttempt", label: "Last Attempt" },
              { key: "result", label: "Result" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Synchronization details opened.")}>View Details</Button>
            <Button variant="secondary" onClick={() => setMessage("Synchronization list refreshed.")}>Refresh</Button>
            <Button variant="secondary" onClick={() => setActiveTab("API Requests")}>View Related Request</Button>
            <Button variant="secondary" onClick={() => setMessage("Failure reason opened.")}>View Failure Reason</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Failed Requests" ? (
        <Card className="section-card">
          <div className="notice warning" style={{ marginBottom: 12 }}>Retry synchronization only after the underlying technical or data issue has been corrected.</div>
          <DataTable
            rowKey="requestId"
            rows={FAILED}
            columns={[
              { key: "requestId", label: "Request ID" },
              { key: "applicantReference", label: "Applicant Reference" },
              { key: "errorType", label: "Error Type" },
              { key: "errorMessage", label: "Error Message" },
              { key: "attemptCount", label: "Attempt Count" },
              { key: "lastAttempt", label: "Last Attempt" },
              { key: "timestamp", label: "Timestamp" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Error details opened.")}>View Error Details</Button>
            <Button variant="secondary" onClick={() => setActiveTab("API Requests")}>View Request</Button>
            <Button variant="secondary" onClick={() => setMessage("Response opened.")}>View Response</Button>
            <Button onClick={() => setMessage("Mock retry queued. Validation and duplicate checks still apply.")}>Retry Synchronization</Button>
            <Button variant="secondary" onClick={() => setMessage("Attempt history opened.")}>View Attempt History</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Imported Records" ? (
        <Card className="section-card">
          <div className="notice" style={{ marginBottom: 12 }}>Technical verification only. The System Administrator cannot edit the official student enrollment record here.</div>
          <DataTable
            rowKey="applicantReference"
            rows={IMPORTED}
            columns={[
              { key: "applicantReference", label: "Applicant Reference" },
              { key: "receivedDate", label: "Received Date" },
              { key: "approvedProgram", label: "Approved Program" },
              { key: "admissionStatus", label: "Admission Status" },
              { key: "apiRequestReference", label: "API Request Reference" },
              { key: "synchronizationStatus", label: "Synchronization Status" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Imported payload summary opened.")}>View Imported Payload Summary</Button>
            <Button variant="secondary" onClick={() => setActiveTab("API Requests")}>View Related API Request</Button>
            <Button variant="secondary" onClick={() => setMessage("Synchronization result opened.")}>View Synchronization Result</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Integration Settings" ? (
        <Card className="section-card">
          <div className="form-grid">
            <label className="field"><span>Admission System Endpoint</span><input defaultValue="https://admission.plp.local/api/accepted-applicants" /></label>
            <label className="field"><span>API Authentication Configuration</span><input value="••••••••••••••••" readOnly /></label>
            <label className="field"><span>Connection Timeout</span><input defaultValue="15 seconds" /></label>
            <label className="field"><span>Integration Status</span><select defaultValue="Enabled"><option>Enabled</option><option>Disabled</option></select></label>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMessage("Configuration editing enabled in mock mode.")}>Edit Configuration</Button>
            <Button variant="secondary" onClick={() => setMessage("Mock API connection test succeeded.")}>Test Connection</Button>
            <Button onClick={() => setMessage("Integration settings saved in mock mode.")}>Save</Button>
            <Button variant="secondary" onClick={() => setMessage("Changes cancelled.")}>Cancel</Button>
          </div>
        </Card>
      ) : null}
      </InternalTabs>
    </>
  );
}
