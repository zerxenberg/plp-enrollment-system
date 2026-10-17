
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
import {
  queueSynchronizationRetry,
  testIntegrationConnection,
  updateIntegrationConfiguration,
} from "@/features/system-administration/system-admin-actions";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "status", label: "API Status" },
  { value: "requests", label: "API Requests" },
  { value: "synchronization", label: "Synchronization" },
  { value: "failed", label: "Failed Requests" },
  { value: "imports", label: "Imported Records" },
  { value: "settings", label: "Settings" },
];

export default function SystemAdministratorIntegration({ integrationData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { configurations, requests, synchronizations, handoffs } = integrationData;

  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selectedType, setSelectedType] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState(false);

  const primaryConfiguration = configurations[0] || null;
  const [settingsForm, setSettingsForm] = useState({
    id: primaryConfiguration?.id || "",
    endpointUrl: primaryConfiguration?.endpoint_url || "",
    authenticationMethod: primaryConfiguration?.authentication_method || "",
    timeoutSeconds: primaryConfiguration?.timeout_seconds || 15,
    isEnabled: Boolean(primaryConfiguration?.is_enabled),
  });

  const failedRequests = requests.filter((item) =>
    /fail|error/i.test(item.status || ""),
  );
  const successfulSyncs = synchronizations.filter((item) =>
    /success/i.test(item.status || ""),
  );
  const pendingSyncs = synchronizations.filter((item) =>
    /pending|queue|process/i.test(item.status || ""),
  );

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result?.message || (result?.ok ? "Action completed." : "Action failed."));
      setWarning(!result?.ok);
      if (result?.ok) router.refresh();
    });
  }

  function openDetails(type, row) {
    setSelectedType(type);
    setSelectedRecord(row);
  }

  const sourceRows = useMemo(() => {
    if (tab === "requests") return requests;
    if (tab === "synchronization") return synchronizations;
    if (tab === "failed") return failedRequests;
    if (tab === "imports") return handoffs;
    return [];
  }, [tab, requests, synchronizations, failedRequests, handoffs]);

  const statusOptions = [
    { value: "ALL", label: "All Statuses" },
    ...[...new Set(
      sourceRows
        .map((row) => row.status || row.synchronization_status || row.admission_status)
        .filter(Boolean),
    )].map((value) => ({ value, label: value })),
  ];

  const visibleRows = sourceRows.filter((row) => {
    if (!JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) return false;
    if (status === "ALL") return true;
    return [row.status, row.synchronization_status, row.admission_status].includes(status);
  });

  return (
    <>
      <PageHeader
        title="System Integration"
        description="Live Supabase integration configuration, API request history, synchronization attempts, failures, and imported Admission handoffs."
        actions={
          <Button variant="secondary" onClick={() => router.refresh()}>
            Refresh
          </Button>
        }
      />

      <Tabs
        items={TABS}
        selected={tab}
        onSelect={(next) => {
          setTab(next);
          setSearch("");
          setStatus("ALL");
          setMessage("");
          setSelectedRecord(null);
        }}
        label="System integration sections"
        title="Integration Workspace"
        subtitle="Select a row to inspect the complete stored request, synchronization, or imported handoff record."
      >
        <Feedback message={message} warning={warning} />

        {tab === "overview" ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <Metric
                label="Integration Status"
                value={primaryConfiguration?.is_enabled ? "Enabled" : "Disabled"}
                hint={primaryConfiguration?.name || "No configuration"}
              />
              <Metric
                label="Recorded Requests"
                value={requests.length}
                hint="Latest query window"
              />
              <Metric
                label="Failed Requests"
                value={failedRequests.length}
                hint="Recorded failures"
              />
              <Metric
                label="Successful Synchronizations"
                value={successfulSyncs.length}
                hint="Recorded successful attempts"
              />
              <Metric
                label="Pending Synchronizations"
                value={pendingSyncs.length}
                hint="Queued or pending attempts"
              />
              <Metric
                label="Imported Applicant Records"
                value={handoffs.length}
                hint="Admission handoff records"
              />
            </div>

            {primaryConfiguration ? (
              <div className="info-grid">
                <Info label="Configuration" value={primaryConfiguration.name} />
                <Info label="Endpoint" value={primaryConfiguration.endpoint_url || "Not configured"} />
                <Info label="Authentication Method" value={primaryConfiguration.authentication_method || "Not configured"} />
                <Info label="Timeout" value={primaryConfiguration.timeout_seconds ? `${primaryConfiguration.timeout_seconds} seconds` : "Not configured"} />
                <div className="info-item">
                  <span>Enabled</span>
                  <strong>
                    <StatusBadge
                      value={primaryConfiguration.is_enabled ? "ACTIVE" : "INACTIVE"}
                      label={primaryConfiguration.is_enabled ? "Enabled" : "Disabled"}
                    />
                  </strong>
                </div>
                <Info label="Last Configuration Update" value={primaryConfiguration.updatedAtLabel} />
              </div>
            ) : (
              <div className="notice warning">No integration configuration exists in the database.</div>
            )}
          </>
        ) : null}

        {tab === "status" ? (
          <>
            {primaryConfiguration ? (
              <>
                <div className="info-grid">
                  <div className="info-item">
                    <span>Integration Status</span>
                    <strong>
                      <StatusBadge
                        value={primaryConfiguration.is_enabled ? "ACTIVE" : "INACTIVE"}
                        label={primaryConfiguration.is_enabled ? "Enabled" : "Disabled"}
                      />
                    </strong>
                  </div>
                  <Info label="Endpoint" value={primaryConfiguration.endpoint_url || "Not configured"} />
                  <Info label="Authentication Method" value={primaryConfiguration.authentication_method || "Not configured"} />
                  <Info label="Connection Timeout" value={`${primaryConfiguration.timeout_seconds || 0} seconds`} />
                  <Info label="Last Updated" value={primaryConfiguration.updatedAtLabel} />
                </div>
                <div className="action-row" style={{ marginTop: 14 }}>
                  <Button
                    disabled={isPending}
                    onClick={() => run(() => testIntegrationConnection({
                      configurationId: primaryConfiguration.id,
                    }))}
                  >
                    Test Connection
                  </Button>
                </div>
              </>
            ) : (
              <div className="notice warning">Create an integration configuration before testing the endpoint.</div>
            )}
          </>
        ) : null}

        {["requests", "synchronization", "failed", "imports"].includes(tab) ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search records"
                placeholder="Search reference, applicant, type, endpoint, result, or status"
              />
              <FilterControl
                label="Status"
                value={status}
                onChange={setStatus}
                options={statusOptions}
              />
              {(search || status !== "ALL") ? (
                <Button variant="ghost" onClick={() => { setSearch(""); setStatus("ALL"); }}>
                  Clear Filters
                </Button>
              ) : null}
            </div>

            {tab === "requests" ? (
              <DataTable
                rows={visibleRows}
                rowKey="id"
                onRowClick={(row) => openDetails("request", row)}
                getRowAriaLabel={(row) => `View request ${row.request_reference || row.id}`}
                emptyMessage="No integration requests match the selected filters."
                columns={[
                  { key: "request_reference", label: "Request" },
                  { key: "request_type", label: "Type" },
                  { key: "source_system", label: "Source" },
                  { key: "requestedAtLabel", label: "Requested" },
                  { key: "response_code", label: "Response" },
                  { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} label={row.status} /> },
                ]}
              />
            ) : null}

            {tab === "synchronization" ? (
              <DataTable
                rows={visibleRows}
                rowKey="id"
                onRowClick={(row) => openDetails("sync", row)}
                getRowAriaLabel={(row) => `View synchronization ${row.sync_reference || row.id}`}
                emptyMessage="No synchronization records match the selected filters."
                columns={[
                  { key: "sync_reference", label: "Synchronization" },
                  { key: "applicant_reference", label: "Applicant" },
                  { key: "direction", label: "Direction" },
                  { key: "attempt_number", label: "Attempt" },
                  { key: "attemptedAtLabel", label: "Attempted" },
                  { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} label={row.status} /> },
                ]}
              />
            ) : null}

            {tab === "failed" ? (
              <DataTable
                rows={visibleRows}
                rowKey="id"
                onRowClick={(row) => openDetails("request", row)}
                getRowAriaLabel={(row) => `View failed request ${row.request_reference || row.id}`}
                emptyMessage="No failed integration requests are currently recorded."
                columns={[
                  { key: "request_reference", label: "Request" },
                  { key: "request_type", label: "Type" },
                  { key: "external_reference", label: "External Reference" },
                  { key: "requestedAtLabel", label: "Requested" },
                  { key: "response_code", label: "Response" },
                  { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} label={row.status} /> },
                ]}
              />
            ) : null}

            {tab === "imports" ? (
              <DataTable
                rows={visibleRows}
                rowKey="id"
                onRowClick={(row) => openDetails("handoff", row)}
                getRowAriaLabel={(row) => `View imported applicant ${row.applicant_reference}`}
                emptyMessage="No imported Admission handoff records match the selected filters."
                columns={[
                  { key: "applicant_reference", label: "Applicant" },
                  { key: "approved_program_code", label: "Approved Program" },
                  { key: "admission_status", label: "Admission", render: (row) => <StatusBadge value={row.admission_status} label={row.admission_status} /> },
                  { key: "synchronization_status", label: "Synchronization", render: (row) => <StatusBadge value={row.synchronization_status} label={row.synchronization_status} /> },
                  { key: "receivedAtLabel", label: "Received" },
                  { key: "source_name", label: "Source" },
                ]}
              />
            ) : null}
          </>
        ) : null}

        {tab === "settings" ? (
          <>
            {primaryConfiguration ? (
              <>
                <div className="info-grid">
                  <Info label="Code" value={primaryConfiguration.code} />
                  <Info label="Name" value={primaryConfiguration.name} />
                  <Info label="Endpoint URL" value={primaryConfiguration.endpoint_url || "Not configured"} />
                  <Info label="Authentication Method" value={primaryConfiguration.authentication_method || "Not configured"} />
                  <Info label="Timeout" value={`${primaryConfiguration.timeout_seconds || 0} seconds`} />
                  <div className="info-item"><span>Status</span><strong><StatusBadge value={primaryConfiguration.is_enabled ? "ACTIVE" : "INACTIVE"} label={primaryConfiguration.is_enabled ? "Enabled" : "Disabled"} /></strong></div>
                </div>
                <div className="action-row" style={{ marginTop: 14 }}>
                  <Button
                    onClick={() => {
                      setSettingsForm({
                        id: primaryConfiguration.id,
                        endpointUrl: primaryConfiguration.endpoint_url || "",
                        authenticationMethod: primaryConfiguration.authentication_method || "",
                        timeoutSeconds: primaryConfiguration.timeout_seconds || 15,
                        isEnabled: Boolean(primaryConfiguration.is_enabled),
                      });
                      setSettingsOpen(true);
                    }}
                  >
                    Edit Configuration
                  </Button>
                </div>
              </>
            ) : (
              <div className="notice warning">
                No configuration row exists. The current schema supports configuration updates, but this page does not invent a second integration definition automatically.
              </div>
            )}
          </>
        ) : null}
      </Tabs>

      <Modal
        open={Boolean(selectedRecord)}
        title={
          selectedType === "request"
            ? "API Request Details"
            : selectedType === "sync"
              ? "Synchronization Details"
              : "Imported Applicant Technical View"
        }
        onClose={() => setSelectedRecord(null)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedRecord(null)}>Close</Button>
            {selectedType === "sync" && /fail|error/i.test(selectedRecord?.status || "") ? (
              <Button
                disabled={isPending}
                onClick={() => run(async () => {
                  const result = await queueSynchronizationRetry({ syncId: selectedRecord.id });
                  if (result?.ok) setSelectedRecord(null);
                  return result;
                })}
              >
                Queue Retry
              </Button>
            ) : null}
            {selectedType === "request" && /fail|error/i.test(selectedRecord?.status || "") ? (() => {
              const relatedSync = synchronizations.find(
                (item) => item.integration_request_id === selectedRecord.id &&
                  /fail|error/i.test(item.status || ""),
              );

              return relatedSync ? (
                <Button
                  disabled={isPending}
                  onClick={() => run(async () => {
                    const result = await queueSynchronizationRetry({ syncId: relatedSync.id });
                    if (result?.ok) setSelectedRecord(null);
                    return result;
                  })}
                >
                  Queue Retry
                </Button>
              ) : null;
            })() : null}
          </>
        }
      >
        {selectedRecord && selectedType === "request" ? (
          <>
            <Details items={[
              ["Request Reference", selectedRecord.request_reference],
              ["Request Type", selectedRecord.request_type],
              ["Source System", selectedRecord.source_system],
              ["Endpoint", selectedRecord.endpoint_path],
              ["External Reference", selectedRecord.external_reference],
              ["Requested At", selectedRecord.requestedAtLabel],
              ["Response Code", selectedRecord.response_code],
              ["Status", selectedRecord.status],
              ["Processing Time", selectedRecord.processingTimeLabel],
              ["Request Summary", selectedRecord.request_summary],
              ["Response Summary", selectedRecord.response_summary],
            ]} />
            <div className="notice" style={{ marginTop: 14 }}>
              API credentials and secret values are never displayed in request details.
            </div>
          </>
        ) : null}

        {selectedRecord && selectedType === "sync" ? (
          <Details items={[
            ["Synchronization Reference", selectedRecord.sync_reference],
            ["Applicant Reference", selectedRecord.applicant_reference],
            ["Direction", selectedRecord.direction],
            ["Status", selectedRecord.status],
            ["Result", selectedRecord.result],
            ["Attempt Number", selectedRecord.attempt_number],
            ["Attempted At", selectedRecord.attemptedAtLabel],
            ["Related Request ID", selectedRecord.integration_request_id],
          ]} />
        ) : null}

        {selectedRecord && selectedType === "handoff" ? (
          <>
            <Details items={[
              ["Applicant Reference", selectedRecord.applicant_reference],
              ["Approved Program", selectedRecord.approved_program_code],
              ["Admission Status", selectedRecord.admission_status],
              ["Admission Date", selectedRecord.admissionDateLabel],
              ["Admission Type", selectedRecord.admission_type],
              ["Synchronization Status", selectedRecord.synchronization_status],
              ["Received At", selectedRecord.receivedAtLabel],
              ["Source", selectedRecord.source_name],
              ["Integration Request ID", selectedRecord.integration_request_id],
            ]} />
            <div className="notice" style={{ marginTop: 14 }}>
              This is a technical import view only. Official student enrollment records are not editable from System Integration.
            </div>
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
            <Button
              disabled={isPending}
              onClick={() => run(async () => {
                const result = await updateIntegrationConfiguration(settingsForm);
                if (result?.ok) setSettingsOpen(false);
                return result;
              })}
            >
              Save Configuration
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field full">
            Endpoint URL
            <input
              value={settingsForm.endpointUrl}
              onChange={(event) => setSettingsForm({ ...settingsForm, endpointUrl: event.target.value })}
            />
          </label>
          <label className="field">
            Authentication Method
            <input
              value={settingsForm.authenticationMethod}
              onChange={(event) => setSettingsForm({ ...settingsForm, authenticationMethod: event.target.value })}
            />
          </label>
          <label className="field">
            Connection Timeout
            <input
              type="number"
              min="1"
              value={settingsForm.timeoutSeconds}
              onChange={(event) => setSettingsForm({ ...settingsForm, timeoutSeconds: Number(event.target.value) })}
            />
          </label>
          <label className="field full">
            Integration Status
            <select
              value={settingsForm.isEnabled ? "Enabled" : "Disabled"}
              onChange={(event) => setSettingsForm({ ...settingsForm, isEnabled: event.target.value === "Enabled" })}
            >
              <option>Enabled</option>
              <option>Disabled</option>
            </select>
          </label>
        </div>
        <div className="notice" style={{ marginTop: 14 }}>
          Store authentication secrets outside exposed application tables. This form edits only the configuration fields defined by the database schema.
        </div>
      </Modal>
    </>
  );
}
