"use client";

import { useMemo, useState } from "react";
import {
  DataTable,
  FilterControl,
  InternalTabs,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Metric, Panel } from "./RegistrarShared";
import { titleStatus } from "@/features/registrar/registrar-client-utils";

const ALL = "ALL";

function options(values, allLabel) {
  return [
    { value: ALL, label: allLabel },
    ...[...new Set(values.filter(Boolean))].sort().map((value) => ({ value, label: value })),
  ];
}

export default function RegistrarReports({ reportsData }) {
  const [tab, setTab] = useState("reports");
  const [reportType, setReportType] = useState("enrollment");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [selectedActivity, setSelectedActivity] = useState(null);

  const reportRows = useMemo(() => {
    if (reportType === "students") {
      return reportsData.students.filter((row) =>
        `${row.student_number} ${row.full_name} ${row.program_code} ${row.home_block}`.toLowerCase().includes(search.toLowerCase()) &&
        (term === ALL || row.current_term_id === term) &&
        (status === ALL || row.student_status === status)
      );
    }

    if (reportType === "project") {
      return reportsData.projectEnrollments.filter((row) =>
        `${row.student_number} ${row.full_name} ${row.program_code} ${row.home_block}`.toLowerCase().includes(search.toLowerCase()) &&
        (term === ALL || row.current_term_id === term) &&
        (status === ALL || row.status === status)
      );
    }

    if (reportType === "quality") {
      return reportsData.dataQualityIssues.filter((row) =>
        `${row.issue_type} ${row.record_reference} ${row.notes}`.toLowerCase().includes(search.toLowerCase()) &&
        (status === ALL || row.status === status)
      );
    }

    return reportsData.officialEnrollments.filter((row) =>
      `${row.reference} ${row.studentNumber} ${row.studentName} ${row.program_code}`.toLowerCase().includes(search.toLowerCase()) &&
      (term === ALL || row.term_id === term) &&
      (status === ALL || row.status === status)
    );
  }, [reportsData, reportType, search, term, status]);

  const statusValues =
    reportType === "students"
      ? reportsData.students.map((item) => item.student_status)
      : reportType === "project"
        ? reportsData.projectEnrollments.map((item) => item.status)
        : reportType === "quality"
          ? reportsData.dataQualityIssues.map((item) => item.status)
          : reportsData.officialEnrollments.map((item) => item.status);

  return (
    <>
      <PageHeader
        title="Reports & Monitoring"
        description="Live Registrar operational reports and read only Registrar activity history."
      />

      <InternalTabs
        items={[
          { value: "reports", label: "Registrar Reports" },
          { value: "activity", label: "Registrar Activity History" },
        ]}
        selected={tab}
        onSelect={setTab}
        label="Registrar reports sections"
      >
        {tab === "reports" ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <Metric label="Visible Students" value={reportsData.students.length} hint="Institutional plus PROJECT_ONLY operational records" />
              <Metric label="Official Enrollments" value={reportsData.officialEnrollments.length} hint="public.enrollments" />
              <Metric label="Project Simulations" value={reportsData.projectEnrollments.length} hint="PROJECT_ONLY queue" />
              <Metric label="Data Quality Issues" value={reportsData.dataQualityIssues.length} hint="Visible current records" />
            </div>

            <Panel
              title="Registrar Reports"
              subtitle="Reports are built only from data the authenticated Registrar can currently read."
            >
              <div className="toolbar">
                <FilterControl
                  label="Report"
                  value={reportType}
                  onChange={(value) => {
                    setReportType(value);
                    setSearch("");
                    setTerm(ALL);
                    setStatus(ALL);
                  }}
                  options={[
                    { value: "enrollment", label: "Official Enrollment Report" },
                    { value: "project", label: "Project Demonstration Enrollment Report" },
                    { value: "students", label: "Student Population Report" },
                    { value: "quality", label: "Data Quality Report" },
                  ]}
                />
                <SearchControl value={search} onChange={setSearch} label="Search report" placeholder="Search current report" />
                {reportType !== "quality" ? (
                  <FilterControl
                    label="Term"
                    value={term}
                    onChange={setTerm}
                    options={options(
                      reportType === "students"
                        ? reportsData.students.map((item) => item.current_term_id)
                        : reportType === "project"
                          ? reportsData.projectEnrollments.map((item) => item.current_term_id)
                          : reportsData.officialEnrollments.map((item) => item.term_id),
                      "All Terms",
                    )}
                  />
                ) : null}
                <FilterControl label="Status" value={status} onChange={setStatus} options={options(statusValues, "All Statuses")} />
              </div>

              {reportType === "enrollment" ? (
                <DataTable
                  rowKey="id"
                  rows={reportRows}
                  columns={[
                    { key: "reference", label: "Enrollment Reference" },
                    { key: "studentNumber", label: "Student ID" },
                    { key: "studentName", label: "Student Name" },
                    { key: "program_code", label: "Program" },
                    { key: "term_id", label: "Term" },
                    { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
                    { key: "confirmation_reference", label: "Confirmation Reference", render: (row) => row.confirmation_reference || "Not available" },
                  ]}
                />
              ) : null}

              {reportType === "project" ? (
                <DataTable
                  rowKey="project_simulation_id"
                  rows={reportRows}
                  columns={[
                    { key: "student_number", label: "Student ID" },
                    { key: "full_name", label: "Student Name" },
                    { key: "program_code", label: "Program" },
                    { key: "home_block", label: "Block" },
                    { key: "current_term_id", label: "Term" },
                    { key: "status", label: "Simulation Status", render: (row) => <StatusBadge value={row.status === "CONFIRMED_SIMULATION" ? "CONFIRMED" : row.status} label={titleStatus(row.status)} /> },
                  ]}
                />
              ) : null}

              {reportType === "students" ? (
                <DataTable
                  rowKey="student_id"
                  rows={reportRows}
                  columns={[
                    { key: "student_number", label: "Student ID" },
                    { key: "full_name", label: "Full Name" },
                    { key: "program_code", label: "Program" },
                    { key: "current_term_id", label: "Term" },
                    { key: "home_block", label: "Block" },
                    { key: "student_status", label: "Status", render: (row) => <StatusBadge value={row.student_status} /> },
                    { key: "recordSource", label: "Source", render: (row) => row.project_only ? "PROJECT_ONLY" : "Institutional" },
                  ]}
                />
              ) : null}

              {reportType === "quality" ? (
                <DataTable
                  rowKey="id"
                  rows={reportRows}
                  emptyMessage="No visible data quality issue rows are available."
                  columns={[
                    { key: "issue_type", label: "Issue Type" },
                    { key: "record_reference", label: "Record" },
                    { key: "severity", label: "Severity" },
                    { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
                    { key: "notes", label: "Notes", render: (row) => row.notes || "Not available" },
                  ]}
                />
              ) : null}

              <div className="notice" style={{ marginTop: 14 }}>
                Grade Import History is not included because the current database intentionally denies direct Registrar reads of grade_import_batches, grade_import_rows, and academic_result_revisions and exposes no protected history reader.
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "activity" ? (
          <Panel
            title="Registrar Activity History"
            subtitle="Read only Registrar business history. This is not the System Administrator security audit console."
          >
            <DataTable
              rowKey="id"
              rows={reportsData.activity}
              onRowClick={setSelectedActivity}
              getRowAriaLabel={(row) => `View activity ${row.action}`}
              emptyMessage="No Registrar activity history is visible."
              columns={[
                { key: "occurredAtLabel", label: "Date & Time" },
                { key: "module", label: "Module" },
                { key: "record_reference", label: "Record" },
                { key: "action", label: "Action" },
                { key: "entity_type", label: "Entity Type" },
                { key: "reason", label: "Reason", render: (row) => row.reason || "Not available" },
              ]}
            />
          </Panel>
        ) : null}
      </InternalTabs>

      <Modal
        open={Boolean(selectedActivity)}
        title="Registrar Activity Details"
        onClose={() => setSelectedActivity(null)}
        footer={<button className="portal-button" type="button" onClick={() => setSelectedActivity(null)}>Close</button>}
      >
        {selectedActivity ? (
          <Details
            items={[
              ["Date and Time", selectedActivity.occurredAtLabel],
              ["Module", selectedActivity.module],
              ["Record Reference", selectedActivity.record_reference],
              ["Action", selectedActivity.action],
              ["Previous Value", selectedActivity.previous_value || "Not available"],
              ["New Value", selectedActivity.new_value || "Not available"],
              ["Entity Type", selectedActivity.entity_type || "Not available"],
              ["Reason", selectedActivity.reason || "Not available"],
            ]}
          />
        ) : null}
      </Modal>
    </>
  );
}
