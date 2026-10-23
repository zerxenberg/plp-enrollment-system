"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  Button, DataTable, FilterControl, InternalTabs, Modal, PageHeader,
  SearchControl, StatusBadge, TableActionButton, TableActions, TablePagination,
} from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { useLiveAcademicCoordinator } from "@/features/academic/LiveAcademicCoordinatorProvider";
import { loadAuthorizedAcademicReviewCases } from "@/features/academic/academic-review-cases";
import { Details, Feedback, LinkButton, Metric } from "@/components/registrar/RegistrarShared";
import {
  ACADEMIC_REPORT_TYPES, buildAcademicReviewSummary, buildCapacityRows,
  buildProgramCurriculumRows, buildScheduleRows, buildSubjectPrerequisiteRows,
} from "@/features/reporting/academic-reports";

const TABS = [
  { value: "reports", label: "Academic Reports" },
  { value: "history", label: "Academic Change History" },
];
const ALL = { value: "ALL", label: "All" };
const FIELDS = {
  program: "Program", name: "Name", department: "College", specializations: "Specializations",
  curriculumVersions: "Curriculum Versions", status: "Status", major: "Specialization",
  curriculum: "Curriculum Version", effectiveYear: "Effective Academic Year", subjects: "Subjects",
  units: "Total Units", subject: "Subject Code", yearLevel: "Year Level",
  semester: "Semester", prerequisites: "Prerequisites", offering: "Offering Status",
  section: "Block Section", academicTerm: "Academic Term", capacity: "Capacity",
  proposed: "Proposed", confirmed: "Confirmed", available: "Available",
  capacityStatus: "Capacity Status", scheduleStatus: "Schedule Status",
  registrarRequests: "Registrar Requests", registrarConfirmed: "Registrar Confirmed", sections: "Blocks",
  day: "Day", startTime: "Start", endTime: "End", dayTime: "Day and Time", room: "Room",
  professor: "Professor", conflictStatus: "Conflict Status", conflictDetails: "Conflict Details",
  category: "Exception Category", pending: "Pending", approved: "Approved",
  rejected: "Rejected", applied: "Applied", returned: "Returned", total: "Total Cases",
  dateTime: "Date and Time", coordinator: "Academic Coordinator",
  module: "Module", record: "Record", action: "Academic Action",
  previousValue: "Before", newValue: "After",
  reason: "Reason", scope: "Decision Scope",
};
function displayDetail(value) {
  if (!value || typeof value !== "object") return value;
  return Object.entries(value).filter(([, item]) => item != null && item !== "")
    .map(([key, item]) => key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()) + ": " + item)
    .join(" · ") || "Not specified";
}
function displayHistoryDate(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? value || "Not available" :
    new Date(parsed).toLocaleString("en-PH", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
    });
}
const PAGE_SIZE = 25;
const DEFAULT_BREAKDOWN = (type) => type === ACADEMIC_REPORT_TYPES[2] ? "subject" : "program";
const COLUMNS = {
  program: ["program", "name", "department", "specializations", "curriculumVersions", "status"],
  curriculum: ["program", "major", "curriculum", "department", "effectiveYear", "subjects", "units", "status"],
  subjects: ["program", "curriculum", "subject", "name", "units", "yearLevel", "semester", "prerequisites", "offering", "status"],
  subjectDemand: ["program", "subject", "academicTerm", "sections", "registrarRequests", "registrarConfirmed", "capacity", "proposed", "confirmed", "available"],
  sectionCapacity: ["program", "section", "academicTerm", "yearLevel", "capacity", "proposed", "confirmed", "available", "capacityStatus", "scheduleStatus"],
  schedule: ["program", "section", "academicTerm", "subject", "dayTime", "room", "professor", "scheduleStatus", "conflictStatus", "conflictDetails"],
  review: ["program", "category", "pending", "approved", "rejected", "applied", "returned", "total"],
};
const MANAGEMENT_ROUTE = "/academic-coordinator/sections-schedules";
const dateValue = (value) => Number.isNaN(Date.parse(value || "")) ? 0 : Date.parse(value);
const listOptions = (values, allLabel) => [
  { value: "ALL", label: allLabel },
  ...[...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))
    .map((value) => ({ value, label: value })),
];

function getReportColumns(type, breakdown) {
  if (type === ACADEMIC_REPORT_TYPES[0]) return COLUMNS[breakdown === "curriculum" ? "curriculum" : "program"];
  if (type === ACADEMIC_REPORT_TYPES[1]) return COLUMNS.subjects;
  if (type === ACADEMIC_REPORT_TYPES[2]) return COLUMNS[breakdown === "section" ? "sectionCapacity" : "subjectDemand"];
  if (type === ACADEMIC_REPORT_TYPES[3]) return COLUMNS.schedule;
  return COLUMNS.review;
}

function getReportRows(type, breakdown, catalog, academicData, blockPlanning, registrar, reviewCases = registrar.enrollments) {
  if (type === ACADEMIC_REPORT_TYPES[0]) return buildProgramCurriculumRows(catalog, academicData, breakdown);
  if (type === ACADEMIC_REPORT_TYPES[1]) return buildSubjectPrerequisiteRows(catalog, academicData);
  if (type === ACADEMIC_REPORT_TYPES[2]) return buildCapacityRows(blockPlanning, registrar, breakdown);
  if (type === ACADEMIC_REPORT_TYPES[3]) return buildScheduleRows(blockPlanning);
  return buildAcademicReviewSummary(reviewCases);
}

function exportCsv(rows, fields, filename) {
  const escape = (value) => {
    const string = String(value ?? "");
    // Keep spreadsheet applications from interpreting student-supplied text as a formula.
    const safe = /^[\s]*[=+@\-]/.test(string) ? "'" + string : string;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv = [fields.map((field) => escape(FIELDS[field] || field)).join(","),
    ...rows.map((row) => fields.map((field) => escape(row[field])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

const historyRow = (row, index, planning = false) => ({
  ...row,
  id: (planning ? "planning:" : "setup:") + (row.id || index),
  dateTime: displayHistoryDate(planning ? row.at : row.dateTime),
  sortDate: row.at || row.dateTime || "",
  coordinator: planning ? row.actor || "Academic Coordinator (demo)" : row.coordinator || "Academic Coordinator",
  module: planning ? "Sections & Schedules" : row.module,
  action: row.action || "Academic record updated",
  previousValue: row.previousValue ?? "",
  newValue: row.newValue ?? "",
});

export default function AcademicCoordinatorReports() {
  const liveData = useLiveAcademicCoordinator();
  const isLive = Boolean(liveData);
  const isSyntheticDemo = Boolean(liveData?.isSyntheticDemo);
  const isOfficial = isLive && !isSyntheticDemo;
  const { catalog, registrar, academicCoordinatorData, blockPlanning } = useDemoData();
  const [tab, setTab] = useState("reports");
  const [reportType, setReportType] = useState(ACADEMIC_REPORT_TYPES[0]);
  const [breakdown, setBreakdown] = useState("program");
  const [program, setProgram] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [term, setTerm] = useState("ALL");
  const [search, setSearch] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [printAll, setPrintAll] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [officialReviews, setOfficialReviews] = useState({ rows: [], loading: true, error: "" });
  useEffect(() => {
    if (!isOfficial) return undefined;
    let cancelled = false;
    loadAuthorizedAcademicReviewCases(registrar.enrollments, blockPlanning.students)
      .then((rows) => {
        if (!cancelled) setOfficialReviews({ rows, loading: false, error: "" });
      })
      .catch(() => {
        if (!cancelled) setOfficialReviews({ rows: [], loading: false,
          error: "Unable to load authorized academic review totals. Refresh to retry." });
      });
    return () => { cancelled = true; };
  }, [isOfficial, registrar.enrollments, blockPlanning.students]);
  const reviewCases = isOfficial ? officialReviews.rows : registrar.enrollments;
  const [remoteHistory, setRemoteHistory] = useState({
    page: 0, search: "", rows: [], total: 0, byModule: {},
    loading: false, error: "",
  });
  const usesRemoteHistory = isLive && !isSyntheticDemo;
  const historyLoader = liveData?.loadAcademicHistoryPage;

  useEffect(() => {
    if (tab !== "history" || !usesRemoteHistory) return undefined;
    let cancelled = false;
    const load = async () => {
      setRemoteHistory((previous) => ({ ...previous, loading: true, error: "" }));
      try {
        const result = await historyLoader({ page: historyPage, search });
        if (!cancelled) setRemoteHistory({
          ...result, page: historyPage, search, loading: false, error: "",
        });
      } catch {
        if (!cancelled) setRemoteHistory({
          page: historyPage, search, rows: [], total: 0, byModule: {},
          loading: false, error: "Unable to load authorized academic history. Retry the search or page.",
        });
      }
    };
    // Search stays responsive without starting one database request per keypress.
    const handle = setTimeout(load, search.trim() ? 300 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [historyLoader, historyPage, search, tab, usesRemoteHistory]);

  const terms = blockPlanning?.terms || [];
  const needsTerm = [ACADEMIC_REPORT_TYPES[2], ACADEMIC_REPORT_TYPES[3]].includes(reportType);
  const needsSubject = [ACADEMIC_REPORT_TYPES[1], ACADEMIC_REPORT_TYPES[2], ACADEMIC_REPORT_TYPES[3]].includes(reportType);
  const fields = getReportColumns(reportType, breakdown);
  const reportRows = useMemo(() =>
    getReportRows(reportType, breakdown, catalog, academicCoordinatorData, blockPlanning, registrar, reviewCases),
  [reportType, breakdown, catalog, academicCoordinatorData, blockPlanning, registrar, reviewCases]);
  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return reportRows.filter((row) =>
      (program === "ALL" || row.program === program) &&
      (!needsSubject || subject === "ALL" || row.subject === subject) &&
      (!needsTerm || term === "ALL" || row.termId === term) &&
      (!keyword || JSON.stringify(row).toLowerCase().includes(keyword)));
  }, [reportRows, program, needsSubject, subject, needsTerm, term, search]);
  const availableSubjects = useMemo(() => reportRows.filter((row) =>
    (program === "ALL" || row.program === program) &&
    (!needsTerm || term === "ALL" || row.termId === term))
    .map((row) => row.subject), [reportRows, program, needsTerm, term]);
  const planningHistory = blockPlanning?.history;
  const setupHistory = academicCoordinatorData?.history;
  const history = useMemo(() =>
    [...(planningHistory || []).map((item, index) => historyRow(item, index, true)),
      ...(setupHistory || []).map((item, index) => historyRow(item, index))]
      .filter((item) => ["Academic Setup", "Sections & Schedules", "Academic Review"].includes(item.module))
      .sort((a, b) => dateValue(b.sortDate) - dateValue(a.sortDate)),
  [planningHistory, setupHistory]);
  const localFilteredHistory = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return !keyword ? history : history.filter((row) =>
      ["dateTime", "coordinator", "module", "record", "action", "previousValue", "newValue"]
        .some((field) => String(row[field] || "").toLowerCase().includes(keyword)));
  }, [history, search]);
  const remoteHistoryCurrent = remoteHistory.page === historyPage && remoteHistory.search === search;
  const filteredHistory = usesRemoteHistory
    ? (remoteHistoryCurrent ? remoteHistory.rows.map((row, index) => historyRow(row, index)) : [])
    : localFilteredHistory;
  const historyTotal = usesRemoteHistory
    ? (remoteHistoryCurrent ? remoteHistory.total : 0) : filteredHistory.length;
  const historyCounts = usesRemoteHistory
    ? (remoteHistoryCurrent ? remoteHistory.byModule : {}) : null;
  const reportPageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const activeReportPage = Math.min(reportPage, reportPageCount);
  const visibleReportRows = printAll ? filteredRows :
    filteredRows.slice((activeReportPage - 1) * PAGE_SIZE, activeReportPage * PAGE_SIZE);
  const historyPageCount = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));
  const activeHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistory = usesRemoteHistory ? filteredHistory
    : filteredHistory.slice((activeHistoryPage - 1) * PAGE_SIZE, activeHistoryPage * PAGE_SIZE);

  useEffect(() => {
    const afterPrint = () => setPrintAll(false);
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  const reportFields = fields;
  const showManagement = [ACADEMIC_REPORT_TYPES[2], ACADEMIC_REPORT_TYPES[3]].includes(reportType);
  const capacityMetrics = useMemo(() => {
    if (reportType !== ACADEMIC_REPORT_TYPES[2]) return [];
    const capacitySectionRows = buildCapacityRows(blockPlanning, registrar, "section");
    const sectionById = new Map((blockPlanning?.blockSections || []).map((row) => [row.id, row]));
    const availableSections = new Set();
    const capacityScope = new Set();
    const selectedSections = breakdown === "section"
      ? new Set(filteredRows.map((row) => row.termId + "|" + row.section)) : null;
    const selectedSubjects = breakdown !== "section"
      ? new Set(filteredRows.map((row) => row.termId + "|" + row.program + "|" + row.subject)) : null;
    for (const item of blockPlanning?.subjectClasses || []) {
      const section = sectionById.get(item.sectionId);
      if (!section) continue;
      const sectionKey = section.termId + "|" + section.code;
      const subjectKey = section.termId + "|" + section.programCode + "|" + item.subjectCode;
      if ((selectedSections && selectedSections.has(sectionKey)) ||
        (selectedSubjects && selectedSubjects.has(subjectKey))) {
        availableSections.add(sectionKey);
        capacityScope.add(section.programCode + "|" + item.subjectCode);
      }
    }
    if (selectedSections) for (const sectionKey of selectedSections) availableSections.add(sectionKey);
    const capacitySections = capacitySectionRows.filter((row) =>
      availableSections.has(row.termId + "|" + row.section));
    const selectedTerms = new Set(capacitySections.map((row) => row.termId));
    const matchingRequests = (registrar.enrollments || []).filter((enrollment) =>
      selectedTerms.has(enrollment.term) &&
      (enrollment.subjects || []).some((item) => capacityScope.has(enrollment.program + "|" + item.code)));
    const uniqueRequesters = new Set(matchingRequests.map((enrollment) =>
      enrollment.studentNumber || enrollment.reference));
    const uniqueConfirmed = new Set(matchingRequests.filter((enrollment) => enrollment.status === "CONFIRMED")
      .map((enrollment) => enrollment.studentNumber || enrollment.reference));
    return [
      { label: isLive ? "Recorded Student Requests" : "Student Requests (Demo)", value: uniqueRequesters.size },
      { label: "Available Sections", value: capacitySections.filter((row) => row.available > 0).length },
      { label: "Total Section Capacity", value: capacitySections.reduce((sum, row) => sum + row.capacity, 0) },
      { label: isLive ? "Registrar Confirmed Enrollments" : "Confirmed Enrollments (Registrar Demo)", value: uniqueConfirmed.size },
      { label: "Proposed Block Assignments", value: capacitySections.reduce((sum, row) => sum + row.proposed, 0) },
      { label: "Actually Available Slots", value: capacitySections.reduce((sum, row) => sum + row.available, 0) },
    ];
  }, [reportType, breakdown, filteredRows, blockPlanning, registrar, isLive]);
  const metrics = reportType === ACADEMIC_REPORT_TYPES[2]
    ? capacityMetrics
    : reportType === ACADEMIC_REPORT_TYPES[3]
      ? [{ label: "Class Meetings", value: filteredRows.filter((row) => row.day !== "Not scheduled").length },
        { label: "Unscheduled", value: filteredRows.filter((row) => row.conflictStatus === "Unscheduled").length },
        { label: "Conflict Entries", value: filteredRows.filter((row) => row.conflictStatus === "Conflict detected").length }]
      : reportType === ACADEMIC_REPORT_TYPES[4]
        ? [{ label: "Pending", value: filteredRows.reduce((sum, row) => sum + row.pending, 0) },
          { label: "Approved", value: filteredRows.reduce((sum, row) => sum + row.approved, 0) },
          { label: "Rejected", value: filteredRows.reduce((sum, row) => sum + row.rejected, 0) },
          { label: "Returned", value: filteredRows.reduce((sum, row) => sum + row.returned, 0) }]
        : [];

  function changeReport(next) {
    const nextBreakdown = DEFAULT_BREAKDOWN(next);
    const nextUsesSubject = [ACADEMIC_REPORT_TYPES[1], ACADEMIC_REPORT_TYPES[2], ACADEMIC_REPORT_TYPES[3]].includes(next);
    const previousUsesSubject = [ACADEMIC_REPORT_TYPES[1], ACADEMIC_REPORT_TYPES[2], ACADEMIC_REPORT_TYPES[3]].includes(reportType);
    const nextUsesTerm = [ACADEMIC_REPORT_TYPES[2], ACADEMIC_REPORT_TYPES[3]].includes(next);
    const previousUsesTerm = [ACADEMIC_REPORT_TYPES[2], ACADEMIC_REPORT_TYPES[3]].includes(reportType);
    const nextRows = getReportRows(next, nextBreakdown, catalog, academicCoordinatorData, blockPlanning, registrar, reviewCases);
    const nextTerm = nextUsesTerm && previousUsesTerm && term !== "ALL" &&
      nextRows.some((row) => row.termId === term && (program === "ALL" || row.program === program))
      ? term : "ALL";
    const nextSubject = nextUsesSubject && previousUsesSubject && subject !== "ALL" &&
      nextRows.some((row) => row.subject === subject &&
        (program === "ALL" || row.program === program) &&
        (!nextUsesTerm || nextTerm === "ALL" || row.termId === nextTerm))
      ? subject : "ALL";
    setReportType(next);
    setBreakdown(nextBreakdown);
    setSubject(nextSubject);
    setTerm(nextTerm);
    setReportPage(1);
    setSelectedDetail(null);
    setFeedback("");
  }
  function clearFilters() {
    setBreakdown(DEFAULT_BREAKDOWN(reportType));
    setProgram("ALL");
    setSubject("ALL");
    setTerm("ALL");
    setSearch("");
    setReportPage(1);
    setSelectedDetail(null);
    setFeedback("");
  }
  function exportReport() {
    if (reportType === ACADEMIC_REPORT_TYPES[4] && isOfficial && (officialReviews.loading || officialReviews.error)) {
      setFeedback("Academic review records are still unavailable. Retry after reloading the report."); return;
    }
    if (!filteredRows.length) { setFeedback("No report records match the selected filters."); return; }
    try {
      exportCsv(filteredRows, reportFields, reportType.toLowerCase().replaceAll(" ", "-") + ".csv");
      setFeedback("");
    } catch {
      setFeedback("The CSV download could not start. Please retry the export.");
    }
  }
  function openPrint() {
    if (reportType === ACADEMIC_REPORT_TYPES[4] && isOfficial && (officialReviews.loading || officialReviews.error)) {
      setFeedback("Academic review records are still unavailable. Retry after reloading the report."); return;
    }
    if (!filteredRows.length) { setFeedback("No report records match the selected filters."); return; }
    try {
      flushSync(() => setPrintAll(true));
      window.print();
    } catch {
      setFeedback("Unable to open the print dialog.");
    } finally {
      setPrintAll(false);
    }
  }

  return (
    <>
      <PageHeader title="Reports & Monitoring" description="View academic reports, review planning capacity and schedules, and inspect academic change history." />
      <InternalTabs selected={tab} items={TABS} onSelect={(next) => {
        setTab(next); setSearch(""); setReportPage(1); setHistoryPage(1);
        setSelectedDetail(null); setFeedback("");
      }} label="Academic reporting navigation" panelCard>
        {tab === "reports" ? (
          <>
            <div className="toolbar">
              <FilterControl label="Report Type" value={reportType} onChange={changeReport}
                options={ACADEMIC_REPORT_TYPES.map((value) => ({ value, label: value }))} />
              {reportType === ACADEMIC_REPORT_TYPES[0] && <FilterControl label="Content" value={breakdown}
                onChange={(value) => { setBreakdown(value); setReportPage(1); setFeedback(""); }}
                options={[{ value: "program", label: "Programs" }, { value: "curriculum", label: "Curriculum Versions" }]} />}
              {reportType === ACADEMIC_REPORT_TYPES[2] && <FilterControl label="Breakdown" value={breakdown === "section" ? "section" : "subject"}
                onChange={(value) => { setBreakdown(value); setSubject("ALL"); setReportPage(1); setFeedback(""); }}
                options={[{ value: "subject", label: "By Subject" }, { value: "section", label: "By Block Section" }]} />}
              <FilterControl label="Program" value={program} onChange={(value) => { setProgram(value); setSubject("ALL"); setReportPage(1); setFeedback(""); }}
                options={listOptions(catalog.programs.map((item) => item.code), "All Programs")} />
              {needsTerm && <FilterControl label="Academic Term" value={term} onChange={(value) => { setTerm(value); setSubject("ALL"); setReportPage(1); setFeedback(""); }}
                options={[{ ...ALL, label: "All Terms" },
                  ...terms.map((item) => ({ value: item.id, label: item.label || item.id }))]} />}
              {needsSubject && !(reportType === ACADEMIC_REPORT_TYPES[2] && breakdown === "section") && <FilterControl label="Subject" value={subject}
                onChange={(value) => { setSubject(value); setReportPage(1); setFeedback(""); }}
                options={listOptions(availableSubjects, "All Subjects")} />}
              <SearchControl value={search} onChange={(value) => { setSearch(value); setReportPage(1); setFeedback(""); }}
                label="Search report" placeholder="Search report records" />
              <Button variant="ghost" onClick={clearFilters}>Clear Filters</Button>
            </div>
            <div className="action-row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={exportReport}>Export CSV / Spreadsheet</Button>
              <Button variant="secondary" onClick={openPrint}>Print / Save PDF</Button>
              {showManagement && <LinkButton href={MANAGEMENT_ROUTE + (reportType === ACADEMIC_REPORT_TYPES[3] ? "?view=schedules" : "")}>Open Sections & Schedules</LinkButton>}
            </div>
            <Feedback message={feedback} />
            {isOfficial && reportType === ACADEMIC_REPORT_TYPES[4] && officialReviews.loading &&
              <p role="status">Loading normalized academic review cases...</p>}
            {isOfficial && reportType === ACADEMIC_REPORT_TYPES[4] && officialReviews.error &&
              <p className="notice warning" role="alert">{officialReviews.error}</p>}
            <section className="academic-report-print">
              <div className="section-header">
                <div><h2>{reportType}{reportType === ACADEMIC_REPORT_TYPES[0]
                  ? " · " + (breakdown === "curriculum" ? "Curriculum Versions" : "Programs")
                  : reportType === ACADEMIC_REPORT_TYPES[2]
                    ? " · " + (breakdown === "section" ? "By Block Section" : "By Subject") : ""}</h2>
          <p className="portal-demo-caption"><strong>{isSyntheticDemo ? "Supabase Synthetic Demo Data (Read Only)" : isLive ? "Live Academic Data" : "Demo Data"}</strong></p>
                  <p>Program: {program === "ALL" ? "All Programs" : program}
                    {needsTerm ? " · Term: " + (term === "ALL" ? "All Terms" : terms.find((item) => item.id === term)?.label || term) : ""}
                    {needsSubject && subject !== "ALL" ? " · Subject: " + subject : ""} · {filteredRows.length} records</p></div>
              </div>
              {metrics.length > 0 && <div className="stats-grid" style={{ marginBottom: 16 }}>
                {metrics.map((metric) => <Metric key={metric.label} label={metric.label} value={metric.value} />)}
              </div>}
              {reportType === ACADEMIC_REPORT_TYPES[2] && <p className="academic-helper">{isLive ? "Proposed block rosters are separate from official Registrar confirmed subject registrations. Confirmed block membership requires independently verified allocation evidence." : "Available seats = planned capacity minus proposed and confirmed block assignments. Registrar requests and confirmed enrollments come from a separate demo enrollment dataset and are not counted as block assignments or tied to the selected planning term."}</p>}
              {reportType === ACADEMIC_REPORT_TYPES[3] && <p className="academic-helper">Published means the Academic Coordinator published a schedule proposal. Conflicts reflect overlapping room, instructor, or block meetings and recorded resource unavailability.</p>}
              {reportType === ACADEMIC_REPORT_TYPES[4] && <p className="academic-helper">Returned for clarification remains pending until a final academic decision. Returned is included in Pending and is not added again to Total Cases. Applied appears only when explicitly recorded.</p>}
              <DataTable rowKey={(row) => row.id || [row.program, row.curriculum, row.subject, row.section, row.academicTerm, row.category].join(":")}
                rows={visibleReportRows} emptyMessage={isOfficial && reportType === ACADEMIC_REPORT_TYPES[4] && officialReviews.loading
                  ? "Loading academic review totals..." : "No records meet the current report filters."}
                columns={[...fields.map((field) => ({ key: field, label: FIELDS[field] || field,
                  ...(field === "scheduleStatus" && reportType === ACADEMIC_REPORT_TYPES[3]
                    ? { render: (row) => <><StatusBadge value={row.scheduleStatus} label={row.scheduleStatus} />{" "}
                      <StatusBadge value={row.conflictStatus === "No detected conflicts" ? "OPEN" : "REQUIRES_REVIEW"}
                        label={row.conflictStatus} /></> }
                    : field === "capacityStatus" || field === "scheduleStatus"
                      ? { render: (row) => <StatusBadge value={row[field]} label={row[field]} /> } : {}) })),
                ...(!printAll ? [{ key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton tone="view"
                  onClick={() => setSelectedDetail({ kind: "report", row })}>View Details</TableActionButton></TableActions> }] : [])]} />
              {!printAll && filteredRows.length > PAGE_SIZE &&
                <TablePagination page={activeReportPage} pageSize={PAGE_SIZE} total={filteredRows.length}
                  onPageChange={setReportPage} label="Academic reports pagination" />}
            </section>
          </>
        ) : (
          <>
            <div className="toolbar"><SearchControl value={search} onChange={(value) => { setSearch(value); setHistoryPage(1); }} label="Search academic change history"
              placeholder="Search coordinator, module, record or action" /></div>
            {usesRemoteHistory && (remoteHistory.loading || !remoteHistoryCurrent) &&
              <p role="status">Loading authorized academic change history...</p>}
            {usesRemoteHistory && remoteHistoryCurrent && remoteHistory.error &&
              <p role="alert">{remoteHistory.error}</p>}
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <Metric label="Academic Changes" value={historyTotal} />
              <Metric label="Academic Setup" value={historyCounts ? historyCounts["Academic Setup"] ?? 0 : filteredHistory.filter((row) => row.module === "Academic Setup").length} />
              <Metric label="Sections & Schedules" value={historyCounts ? historyCounts["Sections & Schedules"] ?? 0 : filteredHistory.filter((row) => row.module === "Sections & Schedules").length} />
              <Metric label="Academic Review" value={historyCounts ? historyCounts["Academic Review"] ?? 0 : filteredHistory.filter((row) => row.module === "Academic Review").length} />
            </div>
            <DataTable rowKey="id" rows={visibleHistory} emptyMessage={usesRemoteHistory && (!remoteHistoryCurrent || remoteHistory.loading)
              ? "Loading history records..." : "No academic changes match your search."}
              columns={[
                ...["dateTime", "coordinator", "module", "record", "action"].map((key) => ({ key, label: FIELDS[key] })),
                { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton tone="view"
                  onClick={() => setSelectedDetail({ kind: "history", row })}>View Details</TableActionButton></TableActions> },
              ]} />
            {historyTotal > PAGE_SIZE &&
              <TablePagination page={activeHistoryPage} pageSize={PAGE_SIZE} total={historyTotal}
                onPageChange={setHistoryPage} label="Academic change history pagination" />}
          </>
        )}
      </InternalTabs>
      <Modal open={Boolean(selectedDetail)} onClose={() => setSelectedDetail(null)}
        title={selectedDetail?.kind === "history" ? "Academic Change Details" : "Academic Report Details"}
        className="academic-setup-wide-modal"
        footer={<Button variant="ghost" onClick={() => setSelectedDetail(null)}>Close</Button>}>
        {selectedDetail && <Details items={selectedDetail.kind === "history"
          ? ["dateTime", "coordinator", "module", "record", "action", "previousValue", "newValue",
            ...["reason", "scope"].filter((key) => selectedDetail.row[key])].map((key) => [
            key === "record" ? "Record Reference" : FIELDS[key],
            displayDetail(selectedDetail.row[key]) || (key === "previousValue" || key === "newValue" ? "No recorded value" : "Not available"),
          ])
          : reportFields
            .map((key) => [FIELDS[key], selectedDetail.row[key] ?? "Not available"])} />}
      </Modal>
    </>
  );
}
