"use client";

import { useEffect, useMemo, useState } from "react";
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
import { registrarDebug, titleStatus } from "@/features/registrar/registrar-client-utils";

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
  const termMap = new Map((reportsData.terms || []).map((item) => [item.id, item.label || item.short_label || item.id]));

  useEffect(() => {
    if (!reportsData.gradeHistoryAvailable) {
      registrarDebug("info", "Reports", "Grade import history is not available to the current Registrar report reader.");
    }
  }, [reportsData.gradeHistoryAvailable]);

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
        : reportsData.officialEnrollments.map((item) => item.status);

  return (
    <>
      <PageHeader
        title="Reports & Monitoring"
        description="Registrar enrollment reports, student summaries, and activity history."
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
              <Metric label="Visible Students" value={reportsData.students.length} hint="Current student records" />
              <Metric label="Official Enrollments" value={reportsData.officialEnrollments.length} hint="Official enrollment records" />
              <Metric label="Demonstration Enrollments" value={reportsData.projectEnrollments.length} hint="Demonstration enrollment records" />
            </div>

            <Panel
              title="Registrar Reports"
              subtitle="Use the available filters to review current Registrar records."
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
                  ]}
                />
                <SearchControl value={search} onChange={setSearch} label="Search report" placeholder="Search current report" />
                {(
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
                )}
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
                    { key: "term_id", label: "Academic Term", render: (row) => termMap.get(row.term_id) || row.term_id },
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
                    { key: "current_term_id", label: "Academic Term", render: (row) => termMap.get(row.current_term_id) || row.current_term_id },
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
                    { key: "current_term_id", label: "Academic Term", render: (row) => termMap.get(row.current_term_id) || row.current_term_id },
                    { key: "home_block", label: "Block" },
                    { key: "student_status", label: "Status", render: (row) => <StatusBadge value={row.student_status} /> },
                                      ]}
                />
              ) : null}



              <div className="notice" style={{ marginTop: 14 }}>
                Grade Import History is currently unavailable from this report.
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "activity" ? (
          <Panel
            title="Registrar Activity History"
            subtitle="Read-only history of Registrar enrollment and record-processing activity."
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
              ["Reason", selectedActivity.reason || "Not available"],
            ]}
          />
        ) : null}
      </Modal>
    </>
  );
}
