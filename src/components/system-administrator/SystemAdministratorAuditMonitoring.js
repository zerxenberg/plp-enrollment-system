
"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Button,
  DataTable,
  FilterControl,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import {
  Details,
  Feedback,
  Metric,
  Tabs,
} from "@/components/registrar/RegistrarShared";
import {
  runSystemHealthCheck,
  setSystemErrorReviewState,
} from "@/features/system-administration/system-admin-actions";

const TABS = [
  { value: "Audit Logs", label: "Audit Logs" },
  { value: "Security Activity", label: "Security Activity" },
  { value: "Administrator Activity", label: "Administrator Activity" },
  { value: "System Errors", label: "System Errors" },
  { value: "System Health", label: "System Health" },
];

function distinctOptions(values, allLabel) {
  return [
    { value: "ALL", label: allLabel },
    ...[...new Set(values.filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((value) => ({ value, label: value })),
  ];
}

export default function SystemAdministratorAuditMonitoring({
  auditData,
}) {
  const {
    auditEvents,
    securityActivity,
    administratorActivity,
    systemErrors,
    healthSnapshots,
  } = auditData;

  const [activeTab, setActiveTab] = useState("Audit Logs");
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [resultFilter, setResultFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [errorStatusFilter, setErrorStatusFilter] = useState("ALL");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedType, setSelectedType] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackWarning, setFeedbackWarning] = useState(false);
  const [isPending, startTransition] = useTransition();

  const latestHealth = healthSnapshots[0] || null;

  const filteredAudit = useMemo(
    () =>
      auditEvents.filter((item) => {
        const searchable = `${item.id} ${item.actor_label || ""} ${item.actorRole || ""} ${item.module || ""} ${item.action || ""} ${item.entity_key || ""} ${item.result || ""}`.toLowerCase();
        return (
          searchable.includes(search.toLowerCase()) &&
          (moduleFilter === "ALL" || item.module === moduleFilter) &&
          (resultFilter === "ALL" || item.result === resultFilter) &&
          (roleFilter === "ALL" || item.actorRole === roleFilter)
        );
      }),
    [
      auditEvents,
      moduleFilter,
      resultFilter,
      roleFilter,
      search,
    ],
  );

  const filteredSecurity = useMemo(
    () =>
      securityActivity.filter((item) => {
        const searchable = `${item.id} ${item.actor_label || ""} ${item.actorRole || ""} ${item.action || ""} ${item.result || ""} ${item.reason || ""}`.toLowerCase();
        return (
          searchable.includes(search.toLowerCase()) &&
          (resultFilter === "ALL" || item.result === resultFilter) &&
          (roleFilter === "ALL" || item.actorRole === roleFilter)
        );
      }),
    [resultFilter, roleFilter, search, securityActivity],
  );

  const filteredAdministrator = useMemo(
    () =>
      administratorActivity.filter((item) => {
        const searchable = `${item.id} ${item.actor_label || ""} ${item.module || ""} ${item.action || ""} ${item.entity_key || ""}`.toLowerCase();
        return (
          searchable.includes(search.toLowerCase()) &&
          (moduleFilter === "ALL" || item.module === moduleFilter)
        );
      }),
    [administratorActivity, moduleFilter, search],
  );

  const filteredErrors = useMemo(
    () =>
      systemErrors.filter((item) => {
        const searchable = `${item.error_reference} ${item.error_type} ${item.module} ${item.severity} ${item.message} ${item.related_record || ""}`.toLowerCase();
        return (
          searchable.includes(search.toLowerCase()) &&
          (moduleFilter === "ALL" || item.module === moduleFilter) &&
          (errorStatusFilter === "ALL" ||
            item.status === errorStatusFilter)
        );
      }),
    [errorStatusFilter, moduleFilter, search, systemErrors],
  );

  function clearFilters() {
    setSearch("");
    setModuleFilter("ALL");
    setResultFilter("ALL");
    setRoleFilter("ALL");
    setErrorStatusFilter("ALL");
  }

  function openDetails(type, row) {
    setSelectedType(type);
    setSelectedRecord(row);
  }

  function updateErrorReview(errorRecord, reviewed) {
    startTransition(async () => {
      const result = await setSystemErrorReviewState({
        errorId: errorRecord.id,
        reviewed,
      });
      setFeedback(result.message);
      setFeedbackWarning(!result.ok);
      if (result.ok) {
        setSelectedRecord(null);
      }
    });
  }

  function runHealthCheck() {
    startTransition(async () => {
      const result = await runSystemHealthCheck();
      setFeedback(result.message);
      setFeedbackWarning(!result.ok);
    });
  }

  return (
    <>
      <PageHeader
        title="Audit & Monitoring"
        description="Live database audit records, security events, administrator changes, technical errors, and recorded health checks."
      />

      <Tabs
        items={TABS}
        selected={activeTab}
        onSelect={(next) => {
          setActiveTab(next);
          clearFilters();
          setSelectedRecord(null);
          setFeedback("");
        }}
        label="Audit and monitoring sections"
        title="Technical Monitoring"
        subtitle="Audit history is read only. System error review state and health snapshots are the only editable monitoring operations."
      >
        <Feedback message={feedback} warning={feedbackWarning} />

        {activeTab === "Audit Logs" ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search audit logs"
                placeholder="Search actor, module, action, record, or result"
              />
              <FilterControl
                label="Module"
                value={moduleFilter}
                onChange={setModuleFilter}
                options={distinctOptions(
                  auditEvents.map((item) => item.module),
                  "All Modules",
                )}
              />
              <FilterControl
                label="Role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={distinctOptions(
                  auditEvents.map((item) => item.actorRole),
                  "All Roles",
                )}
              />
              <FilterControl
                label="Result"
                value={resultFilter}
                onChange={setResultFilter}
                options={distinctOptions(
                  auditEvents.map((item) => item.result),
                  "All Results",
                )}
              />
              {(search ||
                moduleFilter !== "ALL" ||
                roleFilter !== "ALL" ||
                resultFilter !== "ALL") ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear Filters
                </Button>
              ) : null}
            </div>

            <DataTable
              rowKey="id"
              rows={filteredAudit}
              onRowClick={(row) => openDetails("Audit Log", row)}
              getRowAriaLabel={(row) => `View audit event ${row.id}`}
              emptyMessage="No audit events match the selected filters."
              columns={[
                { key: "occurredAtLabel", label: "Date & Time" },
                { key: "actor_label", label: "Source" },
                { key: "actorRole", label: "Role" },
                { key: "module", label: "Module" },
                { key: "action", label: "Action" },
                {
                  key: "result",
                  label: "Result",
                  render: (row) => (
                    <StatusBadge
                      value={
                        row.result === "Successful"
                          ? "COMPLETED"
                          : row.result === "Failed"
                            ? "FAILED"
                            : row.result
                      }
                      label={row.result}
                    />
                  ),
                },
              ]}
            />

            <div className="notice" style={{ marginTop: 14 }}>
              Audit records have no ordinary Edit or Delete action. Their purpose
              is traceability and accountability.
            </div>
          </>
        ) : null}

        {activeTab === "Security Activity" ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search security activity"
                placeholder="Search actor, event, result, or reason"
              />
              <FilterControl
                label="Role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={distinctOptions(
                  securityActivity.map((item) => item.actorRole),
                  "All Roles",
                )}
              />
              <FilterControl
                label="Result"
                value={resultFilter}
                onChange={setResultFilter}
                options={distinctOptions(
                  securityActivity.map((item) => item.result),
                  "All Results",
                )}
              />
              {(search ||
                roleFilter !== "ALL" ||
                resultFilter !== "ALL") ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear Filters
                </Button>
              ) : null}
            </div>

            <DataTable
              rowKey="id"
              rows={filteredSecurity}
              onRowClick={(row) =>
                openDetails("Security Activity", row)
              }
              getRowAriaLabel={(row) =>
                `View security event ${row.id}`
              }
              emptyMessage="No security activity matches the selected filters."
              columns={[
                { key: "occurredAtLabel", label: "Date & Time" },
                { key: "actor_label", label: "User or Source" },
                { key: "actorRole", label: "Role" },
                { key: "action", label: "Event" },
                {
                  key: "result",
                  label: "Result",
                  render: (row) => (
                    <StatusBadge
                      value={
                        row.result === "Successful"
                          ? "COMPLETED"
                          : row.result === "Failed"
                            ? "FAILED"
                            : row.result
                      }
                      label={row.result}
                    />
                  ),
                },
              ]}
            />
          </>
        ) : null}

        {activeTab === "Administrator Activity" ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search administrator activity"
                placeholder="Search administrator, module, action, or record"
              />
              <FilterControl
                label="Module"
                value={moduleFilter}
                onChange={setModuleFilter}
                options={distinctOptions(
                  administratorActivity.map((item) => item.module),
                  "All Modules",
                )}
              />
              {(search || moduleFilter !== "ALL") ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear Filters
                </Button>
              ) : null}
            </div>

            <DataTable
              rowKey="id"
              rows={filteredAdministrator}
              onRowClick={(row) =>
                openDetails("Administrator Activity", row)
              }
              getRowAriaLabel={(row) =>
                `View administrator activity ${row.id}`
              }
              emptyMessage="No administrator activity matches the selected filters."
              columns={[
                { key: "occurredAtLabel", label: "Date & Time" },
                { key: "actor_label", label: "Administrator" },
                { key: "module", label: "Module" },
                { key: "action", label: "Action" },
                { key: "entity_key", label: "Related Record" },
              ]}
            />
          </>
        ) : null}

        {activeTab === "System Errors" ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search system errors"
                placeholder="Search reference, type, module, message, or related record"
              />
              <FilterControl
                label="Module"
                value={moduleFilter}
                onChange={setModuleFilter}
                options={distinctOptions(
                  systemErrors.map((item) => item.module),
                  "All Modules",
                )}
              />
              <FilterControl
                label="Status"
                value={errorStatusFilter}
                onChange={setErrorStatusFilter}
                options={distinctOptions(
                  systemErrors.map((item) => item.status),
                  "All Statuses",
                )}
              />
              {(search ||
                moduleFilter !== "ALL" ||
                errorStatusFilter !== "ALL") ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear Filters
                </Button>
              ) : null}
            </div>

            <DataTable
              rowKey="id"
              rows={filteredErrors}
              onRowClick={(row) => openDetails("System Error", row)}
              getRowAriaLabel={(row) =>
                `View system error ${row.error_reference}`
              }
              emptyMessage="No system errors match the selected filters."
              columns={[
                { key: "error_reference", label: "Error Reference" },
                { key: "error_type", label: "Error Type" },
                { key: "module", label: "Module" },
                { key: "severity", label: "Severity" },
                { key: "occurredAtLabel", label: "Occurred" },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => (
                    <StatusBadge value={row.status} label={row.status} />
                  ),
                },
              ]}
            />
          </>
        ) : null}

        {activeTab === "System Health" ? (
          <>
            <div className="action-row" style={{ marginBottom: 14 }}>
              <Button disabled={isPending} onClick={runHealthCheck}>
                {isPending ? "Running..." : "Run Health Checks"}
              </Button>
            </div>

            {latestHealth ? (
              <>
                <div className="stats-grid" style={{ marginBottom: 14 }}>
                  <Metric
                    label="Application"
                    value={latestHealth.application_status}
                    hint={latestHealth.capturedAtLabel}
                  />
                  <Metric
                    label="Database"
                    value={latestHealth.database_status}
                    hint="Live database probe"
                  />
                  <Metric
                    label="Admission API"
                    value={latestHealth.api_status}
                    hint="Configured endpoint probe"
                  />
                  <Metric
                    label="Authentication"
                    value={latestHealth.authentication_status}
                    hint="Current authenticated administrator"
                  />
                  <Metric
                    label="Backup Registry"
                    value={latestHealth.backup_status}
                    hint="Latest recorded backup status"
                  />
                  <Metric
                    label="Open Errors"
                    value={latestHealth.recent_error_count ?? 0}
                    hint="At snapshot time"
                  />
                </div>

                <DataTable
                  rowKey="id"
                  rows={healthSnapshots}
                  onRowClick={(row) =>
                    openDetails("Health Snapshot", row)
                  }
                  getRowAriaLabel={(row) =>
                    `View system health snapshot ${row.id}`
                  }
                  columns={[
                    { key: "capturedAtLabel", label: "Captured" },
                    { key: "application_status", label: "Application" },
                    { key: "database_status", label: "Database" },
                    { key: "api_status", label: "API" },
                    { key: "authentication_status", label: "Auth" },
                    { key: "recent_error_count", label: "Open Errors" },
                  ]}
                />
              </>
            ) : (
              <div className="notice">
                No health snapshot exists yet. Run Health Checks to create the
                first live snapshot.
              </div>
            )}
          </>
        ) : null}
      </Tabs>

      <Modal
        open={Boolean(selectedRecord)}
        title={selectedRecord ? `${selectedType} Details` : "Details"}
        onClose={() => setSelectedRecord(null)}
        className="system-admin-detail-modal"
        footer={
          selectedRecord ? (
            <>
              <Button
                variant="ghost"
                disabled={isPending}
                onClick={() => setSelectedRecord(null)}
              >
                Close
              </Button>
              {selectedType === "System Error" ? (
                <Button
                  disabled={isPending}
                  onClick={() =>
                    updateErrorReview(
                      selectedRecord,
                      selectedRecord.status !== "Reviewed",
                    )
                  }
                >
                  {isPending
                    ? "Saving..."
                    : selectedRecord.status === "Reviewed"
                      ? "Reopen Error"
                      : "Mark Reviewed"}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selectedRecord &&
        ["Audit Log", "Security Activity", "Administrator Activity"].includes(
          selectedType,
        ) ? (
          <Details
            items={[
              ["Event ID", selectedRecord.id],
              ["Date and Time", selectedRecord.occurredAtLabel],
              ["Actor", selectedRecord.actor_label || "System"],
              ["Actor Role", selectedRecord.actorRole],
              ["Module", selectedRecord.module],
              ["Action", selectedRecord.action],
              ["Entity Type", selectedRecord.entity_type || "Not recorded"],
              ["Entity Key", selectedRecord.entity_key || "Not recorded"],
              ["Result", selectedRecord.result],
              ["Reason", selectedRecord.reason || "Not recorded"],
              ["IP Address", selectedRecord.ip_address || "Not recorded"],
              [
                "Previous Value",
                selectedRecord.previous_value || "Not recorded",
              ],
              ["New Value", selectedRecord.new_value || "Not recorded"],
            ]}
          />
        ) : null}

        {selectedRecord && selectedType === "System Error" ? (
          <>
            <Details
              items={[
                ["Error Reference", selectedRecord.error_reference],
                ["Error Type", selectedRecord.error_type],
                ["Module", selectedRecord.module],
                ["Severity", selectedRecord.severity],
                ["Status", selectedRecord.status],
                ["Occurred", selectedRecord.occurredAtLabel],
                [
                  "Reviewed",
                  selectedRecord.reviewedAtLabel || "Not reviewed",
                ],
                [
                  "Related Record",
                  selectedRecord.related_record || "Not recorded",
                ],
                ["Message", selectedRecord.message],
              ]}
            />
            <div className="notice" style={{ marginTop: 14 }}>
              Marking an error reviewed changes only its review state. The
              historical error row remains preserved.
            </div>
          </>
        ) : null}

        {selectedRecord && selectedType === "Health Snapshot" ? (
          <Details
            items={[
              ["Snapshot ID", selectedRecord.id],
              ["Captured", selectedRecord.capturedAtLabel],
              ["Application", selectedRecord.application_status],
              ["Database", selectedRecord.database_status],
              ["API", selectedRecord.api_status],
              ["Authentication", selectedRecord.authentication_status],
              ["Backup", selectedRecord.backup_status],
              [
                "Recent Error Count",
                selectedRecord.recent_error_count ?? 0,
              ],
            ]}
          />
        ) : null}
      </Modal>
    </>
  );
}
