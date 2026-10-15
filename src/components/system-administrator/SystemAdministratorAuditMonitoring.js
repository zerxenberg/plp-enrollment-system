
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
  { value: "Audit Logs", label: "Audit Logs" },
  { value: "Security Activity", label: "Security Activity" },
  { value: "Administrator Activity", label: "Administrator Activity" },
  { value: "System Errors", label: "System Errors" },
  { value: "System Health", label: "System Health" },
];

const AUDIT_LOGS = [
  { id: "AUD-00091", dateTime: "Oct 7, 2026 · 5:42 PM", source: "Integration Service", role: "System", module: "System Integration", action: "Applicant synchronization", relatedRecord: "APP-2026-0149", result: "Successful", ipAddress: "10.0.0.15" },
  { id: "AUD-00090", dateTime: "Oct 7, 2026 · 5:10 PM", source: "Adrian Reyes", role: "System Administrator", module: "System Integration", action: "API setting changed", relatedRecord: "CFG-API-01", result: "Successful", ipAddress: "10.0.0.27" },
  { id: "AUD-00089", dateTime: "Oct 7, 2026 · 4:18 PM", source: "Integration Service", role: "System", module: "System Integration", action: "Applicant synchronization", relatedRecord: "APP-2026-0148", result: "Failed", ipAddress: "10.0.0.15" },
];

const SECURITY = [
  { id: "SEC-001", event: "Successful Login", user: "Adrian Reyes", role: "System Administrator", dateTime: "Oct 7, 2026 · 5:52 PM", status: "Successful", ipAddress: "10.0.0.27", relatedAccount: "PLP-SA-001" },
  { id: "SEC-002", event: "Failed Login", user: "Unknown account", role: "Unknown", dateTime: "Oct 7, 2026 · 5:21 PM", status: "Failed", ipAddress: "10.0.0.44", relatedAccount: "Not resolved" },
  { id: "SEC-003", event: "Role Change", user: "Karen Mendoza", role: "System Administrator", dateTime: "Oct 6, 2026 · 3:14 PM", status: "Successful", ipAddress: "10.0.0.29", relatedAccount: "USR-REG-001" },
];

const ADMIN_ACTIVITY = [
  { id: "ADM-001", administrator: "Adrian Reyes", action: "API setting changed", module: "System Integration", previousConfiguration: "Timeout: 10s", newConfiguration: "Timeout: 15s", dateTime: "Oct 7, 2026 · 5:10 PM" },
  { id: "ADM-002", administrator: "Adrian Reyes", action: "Backup created", module: "System Administration", previousConfiguration: "No new backup", newConfiguration: "BKP-20261007-01", dateTime: "Oct 7, 2026 · 8:30 AM" },
];

const ERRORS = [
  { reference: "ERR-2026-0081", errorType: "Synchronization Error", module: "System Integration", message: "Approved program is required.", timestamp: "Oct 7, 2026 · 4:18 PM", status: "Open", relatedRecord: "APP-2026-0148", severity: "Medium" },
  { reference: "ERR-2026-0080", errorType: "Authentication Warning", module: "Users & Access", message: "Repeated failed login attempts detected.", timestamp: "Oct 7, 2026 · 3:03 PM", status: "Reviewed", relatedRecord: "SEC-002", severity: "Low" },
];

export default function SystemAdministratorAuditMonitoring() {
  const [activeTab, setActiveTab] = useState("Audit Logs");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState("");
  const [message, setMessage] = useState("");

  const rows = useMemo(() => {
    if (activeTab === "Audit Logs") return AUDIT_LOGS;
    if (activeTab === "Security Activity") return SECURITY;
    if (activeTab === "Administrator Activity") return ADMIN_ACTIVITY;
    if (activeTab === "System Errors") return ERRORS;
    return [];
  }, [activeTab]);

  const filterValues = useMemo(() => {
    if (activeTab === "Audit Logs") return rows.map((row) => row.module);
    if (activeTab === "Security Activity") return rows.map((row) => row.status);
    if (activeTab === "Administrator Activity") return rows.map((row) => row.module);
    if (activeTab === "System Errors") return rows.map((row) => row.status);
    return [];
  }, [activeTab, rows]);

  const filteredRows = rows.filter((row) => {
    if (!JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "ALL") return true;
    if (activeTab === "Audit Logs" || activeTab === "Administrator Activity") return row.module === filter;
    return row.status === filter;
  });

  const filterLabel =
    activeTab === "Audit Logs" || activeTab === "Administrator Activity"
      ? "Module"
      : "Status";

  function openDetails(type, row) {
    setSelectedType(type);
    setSelected(row);
  }

  function changeTab(next) {
    setActiveTab(next);
    setSearch("");
    setFilter("ALL");
    setSelected(null);
    setMessage("");
  }

  return (
    <>
      <PageHeader
        title="Audit & Monitoring"
        description="Read only technical activity, security events, administrator actions, system errors, and operational health."
      />

      <Tabs
        items={TABS}
        selected={activeTab}
        onSelect={changeTab}
        label="Audit and monitoring sections"
        title="Technical Monitoring"
        subtitle="Rows stay concise. Select a row to inspect the complete event in a modal."
      >
        <Feedback message={message} />

        {activeTab !== "System Health" ? (
          <>
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label={`Search ${activeTab}`} placeholder={`Search ${activeTab.toLowerCase()}`} />
              <FilterControl
                label={filterLabel}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "ALL", label: `All ${filterLabel}s` },
                  ...[...new Set(filterValues)].map((value) => ({ value, label: value })),
                ]}
              />
              {(search || filter !== "ALL") ? <Button variant="ghost" onClick={() => { setSearch(""); setFilter("ALL"); }}>Clear Filters</Button> : null}
            </div>

            {activeTab === "Audit Logs" ? (
              <>
                <div className="notice" style={{ marginBottom: 12 }}>
                  Audit records are read only. Ordinary interfaces intentionally provide no Edit or Delete operation.
                </div>
                <DataTable
                  rowKey="id"
                  rows={filteredRows}
                  onRowClick={(row) => openDetails("Audit Log", row)}
                  getRowAriaLabel={(row) => `View audit log ${row.id}`}
                  columns={[
                    { key: "dateTime", label: "Date & Time" },
                    { key: "source", label: "Source" },
                    { key: "module", label: "Module" },
                    { key: "action", label: "Action" },
                    { key: "result", label: "Result", render: (row) => <StatusBadge value={row.result === "Successful" ? "COMPLETED" : "FAILED"} label={row.result} /> },
                  ]}
                />
              </>
            ) : null}

            {activeTab === "Security Activity" ? (
              <DataTable
                rowKey="id"
                rows={filteredRows}
                onRowClick={(row) => openDetails("Security Event", row)}
                getRowAriaLabel={(row) => `View security event ${row.id}`}
                columns={[
                  { key: "event", label: "Event" },
                  { key: "user", label: "User" },
                  { key: "role", label: "Role" },
                  { key: "dateTime", label: "Date & Time" },
                  { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status === "Successful" ? "COMPLETED" : "FAILED"} label={row.status} /> },
                ]}
              />
            ) : null}

            {activeTab === "Administrator Activity" ? (
              <DataTable
                rowKey="id"
                rows={filteredRows}
                onRowClick={(row) => openDetails("Administrator Activity", row)}
                getRowAriaLabel={(row) => `View administrator activity ${row.id}`}
                columns={[
                  { key: "administrator", label: "Administrator" },
                  { key: "action", label: "Action" },
                  { key: "module", label: "Module" },
                  { key: "dateTime", label: "Date & Time" },
                ]}
              />
            ) : null}

            {activeTab === "System Errors" ? (
              <DataTable
                rowKey="reference"
                rows={filteredRows}
                onRowClick={(row) => openDetails("System Error", row)}
                getRowAriaLabel={(row) => `View system error ${row.reference}`}
                columns={[
                  { key: "reference", label: "Error Reference" },
                  { key: "errorType", label: "Error Type" },
                  { key: "module", label: "Module" },
                  { key: "severity", label: "Severity" },
                  { key: "timestamp", label: "Timestamp" },
                  { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} label={row.status} /> },
                ]}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <Metric label="Application" value="Healthy" hint="Frontend operating normally" />
              <Metric label="Database" value="Healthy" hint="Connection available" />
              <Metric label="Admission API" value="Healthy" hint="Authenticated connection" />
              <Metric label="Authentication" value="Healthy" hint="Protected sessions available" />
              <Metric label="Last Backup" value="Successful" hint="Oct 7, 2026" />
              <Metric label="Recent Errors" value="1" hint="Open technical error" />
            </div>
            <div className="info-grid">
              <div className="info-item"><span>Application Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
              <div className="info-item"><span>Database Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
              <div className="info-item"><span>API Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
              <div className="info-item"><span>Authentication Status</span><strong><StatusBadge value="ACTIVE" label="Healthy" /></strong></div>
            </div>
            <div className="action-row" style={{ marginTop: 14 }}>
              <Button onClick={() => setMessage("System health checks completed in mock mode.")}>Run Health Checks</Button>
            </div>
          </>
        )}
      </Tabs>

      <Modal
        open={Boolean(selected)}
        title={selected ? `${selectedType} Details` : "Technical Event Details"}
        onClose={() => setSelected(null)}
        className="system-admin-detail-modal"
        footer={<Button onClick={() => setSelected(null)}>Close</Button>}
      >
        {selected && selectedType === "Audit Log" ? (
          <Details items={[
            ["Audit ID", selected.id],
            ["Date and Time", selected.dateTime],
            ["User or System Source", selected.source],
            ["Role", selected.role],
            ["Module", selected.module],
            ["Action", selected.action],
            ["Related Record", selected.relatedRecord],
            ["Result", selected.result],
            ["IP Address", selected.ipAddress],
          ]} />
        ) : null}

        {selected && selectedType === "Security Event" ? (
          <Details items={[
            ["Security Event", selected.id],
            ["Event Type", selected.event],
            ["User", selected.user],
            ["Role", selected.role],
            ["Date and Time", selected.dateTime],
            ["Status", selected.status],
            ["IP Address", selected.ipAddress],
            ["Related Account", selected.relatedAccount],
          ]} />
        ) : null}

        {selected && selectedType === "Administrator Activity" ? (
          <Details items={[
            ["Activity ID", selected.id],
            ["Administrator", selected.administrator],
            ["Action", selected.action],
            ["Module", selected.module],
            ["Previous Configuration", selected.previousConfiguration],
            ["New Configuration", selected.newConfiguration],
            ["Date and Time", selected.dateTime],
          ]} />
        ) : null}

        {selected && selectedType === "System Error" ? (
          <>
            <Details items={[
              ["Error Reference", selected.reference],
              ["Error Type", selected.errorType],
              ["Module", selected.module],
              ["Severity", selected.severity],
              ["Timestamp", selected.timestamp],
              ["Status", selected.status],
              ["Related Record", selected.relatedRecord],
              ["Message", selected.message],
            ]} />
            <div className="notice" style={{ marginTop: 14 }}>
              Error history remains preserved for troubleshooting. Reviewing an error must not delete the historical record.
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
