
"use client";

import { useMemo, useState } from "react";
import {
  Button,
  DataTable,
  FilterControl,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Feedback, Info, Metric, Tabs } from "@/components/registrar/RegistrarShared";

const TABS = [
  { value: "Integration Overview", label: "Overview" },
  { value: "API Status", label: "API Status" },
  { value: "API Requests", label: "API Requests" },
  { value: "Synchronization", label: "Synchronization" },
  { value: "Failed Requests", label: "Failed Requests" },
  { value: "Imported Records", label: "Imported Records" },
  { value: "Integration Settings", label: "Settings" },
];

const REQUESTS = [
  { requestId: "API-REQ-1042", requestType: "Accepted Applicant Import", source: "Admission System", endpoint: "/api/admissions/accepted", timestamp: "Oct 7, 2026 · 5:42 PM", responseCode: "200", status: "Successful", processingTime: "184 ms", requestSummary: "Accepted applicant APP-2026-0149", responseSummary: "Student record created after duplicate check." },
  { requestId: "API-REQ-1041", requestType: "Accepted Applicant Import", source: "Admission System", endpoint: "/api/admissions/accepted", timestamp: "Oct 7, 2026 · 4:18 PM", responseCode: "422", status: "Failed", processingTime: "96 ms", requestSummary: "Accepted applicant APP-2026-0148", responseSummary: "Validation failed because approved program was missing." },
];

const SYNCHRONIZATIONS = [
  { reference: "SYNC-2026-0342", applicantReference: "APP-2026-0149", direction: "Admission → Enrollment", currentStatus: "Successful", lastAttempt: "Oct 7 · 5:42 PM", result: "Created Student Record", relatedRequest: "API-REQ-1042" },
  { reference: "SYNC-2026-0341", applicantReference: "APP-2026-0148", direction: "Admission → Enrollment", currentStatus: "Failed", lastAttempt: "Oct 7 · 4:18 PM", result: "Missing Approved Program", relatedRequest: "API-REQ-1041" },
  { reference: "SYNC-2026-0340", applicantReference: "APP-2026-0144", direction: "Admission → Enrollment", currentStatus: "Successful", lastAttempt: "Oct 7 · 3:40 PM", result: "Updated Existing Record", relatedRequest: "API-REQ-1039" },
  { reference: "SYNC-2026-0339", applicantReference: "APP-2026-0144", direction: "Admission → Enrollment", currentStatus: "Successful", lastAttempt: "Oct 7 · 3:32 PM", result: "Duplicate Detected · Existing Record Reused", relatedRequest: "API-REQ-1038" },
];

const FAILED = [
  { requestId: "API-REQ-1041", applicantReference: "APP-2026-0148", errorType: "Validation Error", errorMessage: "Approved program is required.", attemptCount: 2, lastAttempt: "Oct 7 · 4:18 PM", timestamp: "Oct 7, 2026 · 4:18 PM", responseCode: "422" },
];

const IMPORTED = [
  { applicantReference: "APP-2026-0149", receivedDate: "Oct 7, 2026 · 5:42 PM", approvedProgram: "BS Information Technology", admissionStatus: "COMPLETED", apiRequestReference: "API-REQ-1042", synchronizationStatus: "Successful", payloadSummary: "Applicant identity, approved program, admission completion status, and source reference received." },
  { applicantReference: "APP-2026-0144", receivedDate: "Oct 7, 2026 · 3:40 PM", approvedProgram: "BS Computer Science", admissionStatus: "COMPLETED", apiRequestReference: "API-REQ-1039", synchronizationStatus: "Updated Existing Record", payloadSummary: "Existing student linkage reused after duplicate applicant reference check." },
];

const INITIAL_SETTINGS = {
  endpoint: "https://admission.plp.local/api/accepted-applicants",
  authentication: "Configured · secret hidden",
  timeout: "15 seconds",
  integrationStatus: "Enabled",
};

export default function SystemAdministratorIntegration() {
  const [activeTab, setActiveTab] = useState("Integration Overview");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedType, setSelectedType] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [draftSettings, setDraftSettings] = useState(INITIAL_SETTINGS);

  const rows = useMemo(() => {
    if (activeTab === "API Requests") return REQUESTS;
    if (activeTab === "Synchronization") return SYNCHRONIZATIONS;
    if (activeTab === "Failed Requests") return FAILED;
    if (activeTab === "Imported Records") return IMPORTED;
    return [];
  }, [activeTab]);

  const filteredRows = rows.filter((row) => {
    if (!JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) return false;
    if (status === "ALL") return true;
    const recordStatus = row.status || row.currentStatus || row.synchronizationStatus || row.errorType;
    return recordStatus === status;
  });

  const statusOptions = [
    { value: "ALL", label: "All Statuses" },
    ...[...new Set(rows.map((row) => row.status || row.currentStatus || row.synchronizationStatus || row.errorType).filter(Boolean))]
      .map((value) => ({ value, label: value })),
  ];

  function openDetails(type, row) {
    setSelectedType(type);
    setSelectedRecord(row);
  }

  function changeTab(next) {
    setActiveTab(next);
    setSearch("");
    setStatus("ALL");
    setMessage("");
    setSelectedRecord(null);
  }

  return (
    <>
      <PageHeader
        title="System Integration"
        description="REST API health, requests, synchronization, imports, failures, and protected integration configuration."
        actions={<Button variant="secondary" onClick={() => setMessage("Integration status refreshed in the current frontend session.")}>Refresh Status</Button>}
      />

      <Tabs
        items={TABS}
        selected={activeTab}
        onSelect={changeTab}
        label="System integration sections"
        title="Integration Workspace"
        subtitle="Open a table row for complete technical details instead of expanding the table with repeated action buttons."
      >
        <Feedback message={message} warning={message.toLowerCase().includes("failed")} />

        {activeTab === "Integration Overview" ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <Metric label="Admission System" value="Connected" hint="Authenticated connection" />
              <Metric label="Successful Transfers" value="42" hint="Current enrollment period" />
              <Metric label="Failed Transfers" value="2" hint="Require technical review" />
              <Metric label="Pending Transfers" value="1" hint="Awaiting retry or correction" />
            </div>
            <div className="info-grid">
              <Info label="API Endpoint Status" value="Available" />
              <Info label="Last Successful Request" value="Oct 7, 2026 · 5:42 PM" />
              <Info label="Last Failed Request" value="Oct 7, 2026 · 4:18 PM" />
              <Info label="Average Response Time" value="143 ms" />
            </div>
            <div className="notice" style={{ marginTop: 14 }}>
              Navigation between request types is handled by the tabs above. Only actual operations remain as buttons.
            </div>
          </>
        ) : null}

        {activeTab === "API Status" ? (
          <>
            <div className="info-grid">
              <div className="info-item"><span>API Connection Status</span><strong><StatusBadge value="ACTIVE" label="Connected" /></strong></div>
              <Info label="Endpoint" value={settings.endpoint} />
              <div className="info-item"><span>Authentication Status</span><strong><StatusBadge value="ACTIVE" label="Authenticated" /></strong></div>
              <Info label="Last Response" value="Accepted applicant synchronized" />
              <Info label="Response Code" value="200" />
              <Info label="Last Successful Connection" value="Oct 7, 2026 · 5:42 PM" />
            </div>
            <div className="action-row" style={{ marginTop: 14 }}>
              <Button onClick={() => setMessage("Mock API connection test succeeded.")}>Test Connection</Button>
            </div>
          </>
        ) : null}

        {["API Requests", "Synchronization", "Failed Requests", "Imported Records"].includes(activeTab) ? (
          <>
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label={`Search ${activeTab}`} placeholder={`Search ${activeTab.toLowerCase()}`} />
              <FilterControl label="Status / Type" value={status} onChange={setStatus} options={statusOptions} />
              {(search || status !== "ALL") ? <Button variant="ghost" onClick={() => { setSearch(""); setStatus("ALL"); }}>Clear Filters</Button> : null}
            </div>

            {activeTab === "API Requests" ? (
              <DataTable
                rowKey="requestId"
                rows={filteredRows}
                onRowClick={(row) => openDetails("API Request", row)}
                getRowAriaLabel={(row) => `View API request ${row.requestId}`}
                columns={[
                  { key: "requestId", label: "Request ID" },
                  { key: "requestType", label: "Request Type" },
                  { key: "timestamp", label: "Timestamp" },
                  { key: "responseCode", label: "Response" },
                  { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status === "Successful" ? "COMPLETED" : "FAILED"} label={row.status} /> },
                  { key: "processingTime", label: "Processing Time" },
                ]}
              />
            ) : null}

            {activeTab === "Synchronization" ? (
              <>
                <div className="notice" style={{ marginBottom: 12 }}>
                  Repeated accepted applicant references must reuse or update the linked student record instead of silently creating duplicates.
                </div>
                <DataTable
                  rowKey="reference"
                  rows={filteredRows}
                  onRowClick={(row) => openDetails("Synchronization", row)}
                  getRowAriaLabel={(row) => `View synchronization ${row.reference}`}
                  columns={[
                    { key: "reference", label: "Synchronization" },
                    { key: "applicantReference", label: "Applicant" },
                    { key: "direction", label: "Direction" },
                    { key: "currentStatus", label: "Status", render: (row) => <StatusBadge value={row.currentStatus === "Successful" ? "COMPLETED" : "FAILED"} label={row.currentStatus} /> },
                    { key: "lastAttempt", label: "Last Attempt" },
                  ]}
                />
              </>
            ) : null}

            {activeTab === "Failed Requests" ? (
              <>
                <div className="notice warning" style={{ marginBottom: 12 }}>
                  Retry only after the underlying technical or data issue is corrected. The same validation and duplicate checks must still apply.
                </div>
                <DataTable
                  rowKey="requestId"
                  rows={filteredRows}
                  onRowClick={(row) => openDetails("Failed Request", row)}
                  getRowAriaLabel={(row) => `View failed request ${row.requestId}`}
                  columns={[
                    { key: "requestId", label: "Request ID" },
                    { key: "applicantReference", label: "Applicant" },
                    { key: "errorType", label: "Error Type" },
                    { key: "attemptCount", label: "Attempts" },
                    { key: "lastAttempt", label: "Last Attempt" },
                  ]}
                />
              </>
            ) : null}

            {activeTab === "Imported Records" ? (
              <>
                <div className="notice" style={{ marginBottom: 12 }}>
                  Technical verification only. Official student enrollment records remain under Registrar ownership.
                </div>
                <DataTable
                  rowKey="applicantReference"
                  rows={filteredRows}
                  onRowClick={(row) => openDetails("Imported Record", row)}
                  getRowAriaLabel={(row) => `View imported applicant ${row.applicantReference}`}
                  columns={[
                    { key: "applicantReference", label: "Applicant" },
                    { key: "receivedDate", label: "Received" },
                    { key: "approvedProgram", label: "Approved Program" },
                    { key: "admissionStatus", label: "Admission", render: (row) => <StatusBadge value={row.admissionStatus} /> },
                    { key: "synchronizationStatus", label: "Synchronization", render: (row) => <StatusBadge value={row.synchronizationStatus === "Successful" || row.synchronizationStatus === "Updated Existing Record" ? "COMPLETED" : row.synchronizationStatus} label={row.synchronizationStatus} /> },
                  ]}
                />
              </>
            ) : null}
          </>
        ) : null}

        {activeTab === "Integration Settings" ? (
          <>
            <div className="info-grid">
              <Info label="Admission System Endpoint" value={settings.endpoint} />
              <Info label="API Authentication" value={settings.authentication} />
              <Info label="Connection Timeout" value={settings.timeout} />
              <div className="info-item"><span>Integration Status</span><strong><StatusBadge value={settings.integrationStatus === "Enabled" ? "ACTIVE" : "INACTIVE"} label={settings.integrationStatus} /></strong></div>
            </div>
            <div className="action-row" style={{ marginTop: 14 }}>
              <Button onClick={() => { setDraftSettings(settings); setSettingsOpen(true); }}>Edit Configuration</Button>
              <Button variant="secondary" onClick={() => setMessage("Mock API connection test succeeded with the current configuration.")}>Test Connection</Button>
            </div>
            <div className="notice" style={{ marginTop: 14 }}>
              Authentication secrets remain masked. This UI is structured so the current mock settings can later be replaced by a Supabase backed configuration source without changing the page layout.
            </div>
          </>
        ) : null}
      </Tabs>

      <Modal
        open={Boolean(selectedRecord)}
        title={selectedRecord ? `${selectedType} Details` : "Integration Details"}
        onClose={() => setSelectedRecord(null)}
        className="system-admin-detail-modal"
        footer={
          selectedRecord ? (
            <>
              <Button variant="ghost" onClick={() => setSelectedRecord(null)}>Close</Button>
              {selectedType === "Failed Request" ? (
                <Button onClick={() => {
                  setMessage(`Retry queued for ${selectedRecord.requestId} in mock mode. Validation and duplicate checks remain required.`);
                  setSelectedRecord(null);
                }}>
                  Retry Synchronization
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selectedRecord && selectedType === "API Request" ? (
          <>
            <Details items={[
              ["Request ID", selectedRecord.requestId],
              ["Request Type", selectedRecord.requestType],
              ["Source", selectedRecord.source],
              ["Endpoint", selectedRecord.endpoint],
              ["Timestamp", selectedRecord.timestamp],
              ["Response Code", selectedRecord.responseCode],
              ["Status", selectedRecord.status],
              ["Processing Time", selectedRecord.processingTime],
              ["Request Summary", selectedRecord.requestSummary],
              ["Response Summary", selectedRecord.responseSummary],
            ]} />
            <div className="notice" style={{ marginTop: 14 }}>Credentials, tokens, and API secrets are intentionally excluded from request details.</div>
          </>
        ) : null}

        {selectedRecord && selectedType === "Synchronization" ? (
          <Details items={[
            ["Synchronization Reference", selectedRecord.reference],
            ["Applicant Reference", selectedRecord.applicantReference],
            ["Direction", selectedRecord.direction],
            ["Current Status", selectedRecord.currentStatus],
            ["Last Attempt", selectedRecord.lastAttempt],
            ["Result", selectedRecord.result],
            ["Related API Request", selectedRecord.relatedRequest],
          ]} />
        ) : null}

        {selectedRecord && selectedType === "Failed Request" ? (
          <Details items={[
            ["Request ID", selectedRecord.requestId],
            ["Applicant Reference", selectedRecord.applicantReference],
            ["Error Type", selectedRecord.errorType],
            ["Error Message", selectedRecord.errorMessage],
            ["Attempt Count", selectedRecord.attemptCount],
            ["Response Code", selectedRecord.responseCode],
            ["Last Attempt", selectedRecord.lastAttempt],
            ["Timestamp", selectedRecord.timestamp],
          ]} />
        ) : null}

        {selectedRecord && selectedType === "Imported Record" ? (
          <>
            <Details items={[
              ["Applicant Reference", selectedRecord.applicantReference],
              ["Received Date", selectedRecord.receivedDate],
              ["Approved Program", selectedRecord.approvedProgram],
              ["Admission Status", selectedRecord.admissionStatus],
              ["API Request Reference", selectedRecord.apiRequestReference],
              ["Synchronization Status", selectedRecord.synchronizationStatus],
              ["Imported Payload Summary", selectedRecord.payloadSummary],
            ]} />
            <div className="notice" style={{ marginTop: 14 }}>This technical view does not allow editing the official student enrollment record.</div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={settingsOpen}
        title="Edit Integration Configuration"
        onClose={() => setSettingsOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setSettings(draftSettings);
              setSettingsOpen(false);
              setMessage("Integration configuration saved in the current frontend session.");
            }}>
              Save Configuration
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field full"><span>Admission System Endpoint</span><input value={draftSettings.endpoint} onChange={(event) => setDraftSettings({ ...draftSettings, endpoint: event.target.value })} /></label>
          <label className="field"><span>API Authentication</span><input value="••••••••••••••••" readOnly /></label>
          <label className="field"><span>Connection Timeout</span><input value={draftSettings.timeout} onChange={(event) => setDraftSettings({ ...draftSettings, timeout: event.target.value })} /></label>
          <label className="field"><span>Integration Status</span><select value={draftSettings.integrationStatus} onChange={(event) => setDraftSettings({ ...draftSettings, integrationStatus: event.target.value })}><option>Enabled</option><option>Disabled</option></select></label>
        </div>
      </Modal>
    </>
  );
}
