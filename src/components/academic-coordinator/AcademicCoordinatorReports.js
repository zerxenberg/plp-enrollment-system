
"use client";

import { useState } from "react";
import {
  Button,
  DataTable,
  FilterControl,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Feedback, Metric, Panel, Tabs } from "@/components/registrar/RegistrarShared";
import AcademicFilterBar from "@/components/shared/AcademicFilterBar";
import { ALL_ACADEMIC_FILTERS, filterAcademicRecords, updateAcademicFilters } from "@/features/students/academic-student-filters";
import { getBlockOccupancy } from "@/features/block-planning/block-planning-service";

const VIEWS = [
  { value: "reports", label: "Academic Reports" },
  { value: "demand", label: "Enrollment Demand" },
  { value: "capacity", label: "Section Capacity" },
  { value: "schedule", label: "Schedule Monitoring" },
  { value: "history", label: "Academic Change History" },
];

const REPORTS = [
  "Program Summary",
  "Curriculum Structure Report",
  "Subject List Report",
  "Prerequisite Report",
  "Subject Offering Report",
  "Section Planning Report",
  "Class Schedule Report",
  "Capacity Report",
  "Academic Exception Report",
];

function exportCsv(rows, filename) {
  const headings = Object.keys(rows[0] || { message: "No records" });
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headings.join(","), ...rows.map((row) => headings.map((heading) => escape(row[heading])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AcademicCoordinatorReports() {
  const { catalog, registrar, student, academicCoordinatorData, blockPlanning } = useDemoData();
  const [view, setView] = useState("reports");
  const [report, setReport] = useState(REPORTS[0]);
  const [program, setProgram] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [section, setSection] = useState("ALL");
  const [academicFilters, setAcademicFilters] = useState(ALL_ACADEMIC_FILTERS);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");

  const activeTermId = blockPlanning?.terms?.find((item) => item.status === "CURRENT")?.id;
  const currentSections = (blockPlanning?.blockSections || []).filter((item) => item.termId === activeTermId);
  const allSections = blockPlanning?.blockSections || [];
  const planningClasses = blockPlanning?.subjectClasses || [];
  const planningMeetings = blockPlanning?.classMeetings || [];
  const planningRooms = blockPlanning?.rooms || [];
  const currentClasses = planningClasses.filter((item) => currentSections.some((section) => section.id === item.sectionId));
  const sectionRows = currentSections.map((section) => {
    const occupancy = getBlockOccupancy(blockPlanning, section.id);
    return {
      section: section.code, program: section.programCode,
      academicTerm: `${section.semester} ${section.academicYear}`,
      capacity: section.capacity, proposedCount: occupancy?.proposed || 0,
      confirmedCount: occupancy?.confirmed || 0, remainingSlots: occupancy?.available || 0,
      status: occupancy?.status === "FULL" ? "Full" : occupancy?.status === "NEAR_FULL" ? "Near Capacity" : "Available",
    };
  });
  const scheduleRows = planningClasses.flatMap((subjectClass) => {
    const block = allSections.find((item) => item.id === subjectClass.sectionId);
    if (!block) return [];
    const entries = planningMeetings.filter((item) => item.subjectClassId === subjectClass.id);
    return (entries.length ? entries : [null]).map((meeting) => ({
      id: meeting?.id || subjectClass.id, section: block.code,
      academicTerm: `${block.semester} ${block.academicYear}`,
      subject: subjectClass.subjectCode,
      day: meeting?.day || "Not scheduled", startTime: meeting?.start || "Not scheduled",
      endTime: meeting?.end || "Not scheduled",
      room: planningRooms.find((room) => room.id === meeting?.roomId)?.name || "Not assigned",
      conflictStatus: block.status === "PUBLISHED" ? "Validated proposal" : "Draft: pending validation",
    }));
  });

  const demandRows = (() => {
    const demand = new Map();

    registrar.enrollments.forEach((entry) => {
      entry.subjects.forEach((item) => {
        demand.set(item.code, (demand.get(item.code) || 0) + 1);
      });
    });

    return catalog.subjects.map((item) => {
      const relatedIds = new Set(currentClasses.filter((entry) => entry.subjectCode === item.code).map((entry) => entry.sectionId));
      const related = currentSections.filter((entry) => relatedIds.has(entry.id));
      const capacity = related.reduce((sum, row) => sum + row.capacity, 0);
      const confirmed = new Set(registrar.enrollments.filter((entry) => entry.status === "CONFIRMED" &&
        entry.subjects.some((subject) => subject.code === item.code && related.some((block) => subject.section === block.code)))
        .map((entry) => entry.studentNumber)).size;

      return {
        program: item.program || "BSIT",
        subject: item.code,
        studentsRequesting: demand.get(item.code) || 0,
        availableSections: related.length,
        totalCapacity: capacity,
        confirmedEnrollment: confirmed,
        remainingCapacity: Math.max(0, capacity - confirmed),
      };
    });
  })();

  const planningHistory = (blockPlanning?.history || []).map((item) => ({
    id: item.id, dateTime: item.at, coordinator: item.actor,
    module: "Sections & Schedules", record: item.record, action: item.action,
    previousValue: item.previousValue || "", newValue: item.newValue || "",
  }));

  const resolvedReviews = registrar.enrollments.filter((item) => item.academicReviewDecision);
  const filteredReviews = filterAcademicRecords(resolvedReviews, academicFilters, [], catalog.programs);
  const changeAcademicFilter = (key, value) => { setAcademicFilters((previous) => key ? updateAcademicFilters(previous, key, value) : value); setPreview(false); };

  const reportRows =
    report === "Program Summary"
      ? catalog.programs.map((item) => ({ code: item.code, name: item.name, department: item.department, status: item.status }))
      : report === "Curriculum Structure Report"
        ? academicCoordinatorData.curricula
        : report === "Subject List Report"
          ? catalog.subjects.map(({ code, name, units, yearLevel, semester, prerequisites }) => ({ code, name, units, yearLevel, semester, prerequisites: prerequisites.join(", ") || "None" }))
          : report === "Prerequisite Report"
            ? catalog.subjects.flatMap((item) => item.prerequisites.map((required) => ({ subject: item.code, requiredPrerequisite: required })))
            : report === "Subject Offering Report"
              ? academicCoordinatorData.offerings
              : report === "Section Planning Report"
                ? allSections.map((item) => ({ code: item.code, program: item.programCode,
                  yearLevel: item.yearLevel, academicTerm: `${item.semester} ${item.academicYear}`,
                  capacity: item.capacity, proposed: getBlockOccupancy(blockPlanning, item.id)?.proposed || 0,
                  status: item.status }))
                : report === "Class Schedule Report"
                  ? scheduleRows
                  : report === "Capacity Report"
                    ? sectionRows
                    : filteredReviews.map((item) => ({ caseReference: `ACR-${item.reference}`, studentReference: item.studentNumber, program: item.program, decision: item.academicReviewDecision, reason: item.academicReviewReason, coordinator: item.academicReviewCoordinator, decisionDate: item.academicReviewDate }));

  const filteredReportRows = reportRows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(search.toLowerCase()) &&
    (program === "ALL" || row.program === program || row.code === program) &&
    (subject === "ALL" || row.subject === subject || row.code === subject) &&
    (section === "ALL" || row.section === section || row.code === section)
  );

  const reportColumns = Object.keys(filteredReportRows[0] || reportRows[0] || {}).map((key) => ({
    key,
    label: key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()),
  }));

  const options = (values) => [{ value: "ALL", label: "All" }, ...new Set(values)].map((item) => typeof item === "string" ? { value: item, label: item } : item);

  return (
    <>
      <PageHeader
        title="Reports & Monitoring"
        description="Academic reports and monitoring for curriculum, subjects, sections, schedules, exceptions, demand, and capacity."
      />

      <Tabs selected={view} onSelect={(next) => { setView(next); setMessage(""); }} items={VIEWS} label="Academic reporting sections" title="Academic Reporting" subtitle="This module does not duplicate Registrar official enrollment reporting or System Administrator technical audit logs.">

        {view === "reports" ? (
          <>
            <div className="toolbar">
              <FilterControl label="Report Type" value={report} onChange={(next) => { setReport(next); setProgram("ALL"); setSubject("ALL"); setSection("ALL"); setAcademicFilters(ALL_ACADEMIC_FILTERS); setPreview(false); }} options={REPORTS.map((item) => ({ value: item, label: item }))} />
              {report !== "Academic Exception Report" ? <FilterControl label="Program" value={program} onChange={(next) => { setProgram(next); setPreview(false); }} options={options(catalog.programs.map((item) => item.code))} /> : null}
              {report !== "Academic Exception Report" ? <FilterControl label="Subject" value={subject} onChange={(next) => { setSubject(next); setPreview(false); }} options={options(catalog.subjects.map((item) => item.code))} /> : null}
              {report !== "Academic Exception Report" ? <FilterControl label="Section" value={section} onChange={(next) => { setSection(next); setPreview(false); }} options={options(allSections.map((item) => item.code))} /> : null}
              <Button onClick={() => { setPreview(true); setMessage(`${report} generated from ${filteredReportRows.length} demo records.`); }}>Generate & Preview</Button>
              <Button variant="secondary" onClick={() => exportCsv(filteredReportRows, `${report.toLowerCase().replaceAll(" ", "-")}.csv`)}>Export Spreadsheet</Button>
              <Button variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button>
            </div>
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label="Search report" placeholder="Search report results" />
            </div>
            {report === "Academic Exception Report" ? <AcademicFilterBar records={resolvedReviews} programs={catalog.programs} departments={catalog.departments} value={academicFilters} onChange={changeAcademicFilter} matchingCount={filteredReviews.length} label="Academic exception report student filters" /> : null}
            {preview ? <DataTable rowKey={(row) => Object.values(row).join(":")} rows={filteredReportRows} columns={reportColumns} emptyMessage="No records meet the report filters." /> : <div className="notice">Choose a report and click Generate & Preview.</div>}
          </>
        ) : null}

        {view === "demand" ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <Metric label="Programs" value={catalog.programs.length} />
              <Metric label="Subjects" value={catalog.subjects.length} />
              <Metric label="Available Blocks" value={sectionRows.filter((item) => item.remainingSlots > 0).length} />
              <Metric label="Proposed Block Capacity" value={currentSections.reduce((sum, item) => sum + item.capacity, 0)} />
            </div>
            <DataTable
              rowKey="subject"
              rows={demandRows}
              columns={[
                { key: "program", label: "Program" },
                { key: "subject", label: "Subject" },
                { key: "studentsRequesting", label: "Number of Students Requesting Subject" },
                { key: "availableSections", label: "Available Sections" },
                { key: "totalCapacity", label: "Total Capacity" },
                { key: "confirmedEnrollment", label: "Confirmed Enrollment Count" },
                { key: "remainingCapacity", label: "Remaining Capacity" },
              ]}
            />
          </>
        ) : null}

        {view === "capacity" ? (
          <DataTable
            rowKey="section"
            rows={sectionRows}
            columns={[
              { key: "section", label: "Section" },
                  { key: "program", label: "Program" },
                  { key: "capacity", label: "Capacity" },
                  { key: "proposedCount", label: "Proposed Assignments" },
                  { key: "confirmedCount", label: "Confirmed Assignments" },
              { key: "remainingSlots", label: "Remaining Slots" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status === "Full" ? "FULL" : row.status === "Near Capacity" ? "REQUIRES_REVIEW" : "OPEN"} label={row.status} /> },
            ]}
          />
        ) : null}

        {view === "schedule" ? (
          <>
            <div className="toolbar"><SearchControl value={search} onChange={setSearch} label="Search schedules" placeholder="Search section, subject, room, or day" /></div>
            <DataTable
              rowKey="id"
              rows={scheduleRows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))}
              columns={[
                { key: "section", label: "Section" },
                { key: "subject", label: "Subject" },
                { key: "day", label: "Day" },
                { key: "startTime", label: "Start Time" },
                { key: "endTime", label: "End Time" },
                { key: "room", label: "Room" },
                { key: "conflictStatus", label: "Conflict Status" },
              ]}
            />
          </>
        ) : null}

        {view === "history" ? (
          <>
            <div className="toolbar"><SearchControl value={search} onChange={setSearch} label="Search academic history" placeholder="Search record, module, action, or coordinator" /></div>
            <DataTable
              rowKey="id"
              rows={[...planningHistory, ...academicCoordinatorData.history].filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))}
              columns={[
                { key: "dateTime", label: "Date and Time" },
                { key: "coordinator", label: "Academic Coordinator" },
                { key: "module", label: "Module" },
                { key: "record", label: "Record" },
                { key: "action", label: "Academic Action" },
                { key: "previousValue", label: "Previous Value" },
                { key: "newValue", label: "New Value" },
              ]}
            />
          </>
        ) : null}

        <Feedback message={message} />
      </Tabs>
    </>
  );
}
