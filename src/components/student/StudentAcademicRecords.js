"use client";

import { useMemo, useState } from "react";
import {
  Button, Card, DataTable, EmptyState, FilterControl, InternalTabs, Modal,
  PageHeader, SearchControl, StatusBadge, TablePagination,
} from "@/components/ui/PortalUI";
import { displayCurriculumCode, displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";

const TABS = ["Academic History", "Curriculum Progress"];
const PAGE_SIZE = 20;

function formatUnits(units) {
  const number = Number(units);
  return units != null && Number.isFinite(number) ? number.toLocaleString() : "Not recorded";
}

function studentResults(snapshot) {
  const grades = snapshot.previousResults.map((item, index) => ({
    key: `grade:${item.term}:${item.subject_code}:${index}`,
    code: item.subject_code,
    name: item.subject_name || item.subject_code,
    units: item.units,
    term: item.term,
    grade: item.grade,
    status: item.result,
    source: "Published Registrar result",
    note: "Published through a verified Registrar grade batch.",
  }));
  const transfer = snapshot.transferCredits.map((item, index) => ({
    key: `transfer:${item.target_subject}:${index}`,
    code: item.target_subject,
    name: snapshot.curriculum.find((row) => row.code === item.target_subject)?.name || item.target_subject,
    units: item.credited_units,
    term: "Transfer evaluation",
    grade: null,
    status: item.decision_status === "CREDITED" ? "CREDITED" : "PENDING",
    source: "Approved transfer credit",
    note: `Source course: ${item.source_course || "Not recorded"}.`,
  }));
  const projectTransfer = (snapshot.projectTransferDecisions || []).map((item, index) => ({
    key: `project-transfer:${item.target_subject}:${index}`,
    code: item.target_subject,
    name: snapshot.curriculum.find((row) => row.code === item.target_subject)?.name || item.target_subject,
    units: item.decision_status === "PROJECT_CREDITED" ? item.credited_units : null,
    term: "Project transfer assessment",
    grade: null,
    status: item.decision_status,
    source: "Fictional project transfer decision",
    note: `Source course: ${item.source_course}. Source institution: ${item.source_institution}. ${item.decision_status === "PROJECT_PENDING" ? "This fictional equivalency remains pending and grants no project credit." : "This is a fictional project credit decision, not institutionally approved transfer credit."}`,
  }));
  const acceptedProject = (snapshot.acceptedProjectResults || []).map((item, index) => ({
    key: `project:${item.term}:${item.subject_code}:${index}`,
    code: item.subject_code,
    name: item.subject_name || item.subject_code,
    units: item.units,
    term: item.term,
    grade: item.grade,
    status: item.result,
    professor: item.professorProvenance === "PROJECT_FICTIONAL_ASSIGNMENT"
      ? item.previousSubjectProfessor : null,
    source: "Accepted project result",
    note: "This grade was accepted for the project enrollment demonstration. It is not an institutionally verified academic result. Any displayed previous professor is a fictional project assignment, not verified university faculty.",
  }));
  return [...grades, ...acceptedProject, ...transfer, ...projectTransfer]
    .sort((a, b) => b.term.localeCompare(a.term) || a.code.localeCompare(b.code));
}

function curriculumRows(snapshot) {
  const credited = new Set(
    snapshot.transferCredits.filter((item) => item.decision_status === "CREDITED")
      .map((item) => item.target_subject),
  );
  const completed = new Set(
    snapshot.previousResults.filter((item) => item.result === "COMPLETED")
      .map((item) => item.subject_code),
  );
  const failed = new Set(
    snapshot.previousResults.filter((item) => item.result === "FAILED")
      .map((item) => item.subject_code),
  );
  const incomplete = new Set(
    snapshot.previousResults.filter((item) => item.result === "INCOMPLETE")
      .map((item) => item.subject_code),
  );
  // The ledger-backed project results may contribute to project curriculum
  // progress but must remain visibly separate from institutional achievements.
  const acceptedProject = new Map();
  for (const item of [...(snapshot.acceptedProjectResults || [])]
    .sort((a, b) => String(a.term).localeCompare(String(b.term)))) {
    acceptedProject.set(item.subject_code, item.result);
  }
  const projectTransfer = new Map((snapshot.projectTransferDecisions || [])
    .map((item) => [item.target_subject, item.decision_status]));
  const eligibility = new Map(snapshot.eligibility.map((item) => [item.subject_code, item]));
  return snapshot.curriculum.map((row) => {
    const institutionalStatus = credited.has(row.code) ? "CREDITED" :
      completed.has(row.code) ? "COMPLETED" :
      incomplete.has(row.code) ? "INCOMPLETE" :
      failed.has(row.code) ? "FAILED" : null;
    const projectStatus = acceptedProject.get(row.code);
    const transferStatus = projectTransfer.get(row.code);
    return {
      ...row,
      status: institutionalStatus || projectStatus || transferStatus ||
        eligibility.get(row.code)?.eligibility || "NOT_TAKEN",
      source: institutionalStatus ? "Institutional result or approved credit" :
        projectStatus ? "Accepted project result" :
          transferStatus ? "Fictional project transfer decision" : "Enrollment eligibility",
      reason: eligibility.get(row.code)?.reason || null,
    };
  });
}

export default function StudentAcademicRecords({ mode = "unavailable", snapshot }) {
  const [tab, setTab] = useState(TABS[0]);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [year, setYear] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("NEWEST");

  const history = useMemo(() => snapshot ? studentResults(snapshot) : [], [snapshot]);
  const curriculum = useMemo(() => snapshot ? curriculumRows(snapshot) : [], [snapshot]);
  const terms = useMemo(() => [...new Set(history.map((item) => item.term))], [history]);
  const statuses = useMemo(() =>
    [...new Set(tab === TABS[0] ? history.map((item) => item.status) : curriculum.map((item) => item.status))],
    [tab, history, curriculum],
  );
  const filteredHistory = history.filter((item) =>
    (term === "ALL" || item.term === term) &&
    (status === "ALL" || item.status === status) &&
    `${item.code} ${displaySubjectCode(item.code)} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase()),
  ).sort((a, b) => sort === "SUBJECT" ? a.code.localeCompare(b.code)
    : sort === "OLDEST" ? a.term.localeCompare(b.term)
      : b.term.localeCompare(a.term));
  const filteredCurriculum = curriculum.filter((item) =>
    (year === "ALL" || String(item.yearLevel) === year) &&
    (status === "ALL" || item.status === status) &&
    `${item.code} ${displaySubjectCode(item.code)} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase()),
  ).sort((a, b) => sort === "SUBJECT" ? a.code.localeCompare(b.code) :
    Number(a.yearLevel) - Number(b.yearLevel) || String(a.semester).localeCompare(String(b.semester)));
  const reset = (setter) => (value) => { setter(value); setPage(1); };
  const currentRows = tab === TABS[0] ? filteredHistory : filteredCurriculum;
  const totalPages = Math.max(1, Math.ceil(currentRows.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const pagedRows = currentRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const totalUnits = curriculum.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
  const institutionalUnits = curriculum.reduce((sum, row) =>
    sum + (row.source === "Institutional result or approved credit" &&
      ["COMPLETED", "CREDITED"].includes(row.status) ? Number(row.units) || 0 : 0), 0);
  const acceptedProjectUnits = curriculum.reduce((sum, row) =>
    sum + (row.source === "Accepted project result" && row.status === "COMPLETED" ?
      Number(row.units) || 0 : 0), 0);
  const projectTransferUnits = curriculum.reduce((sum, row) =>
    sum + (row.source === "Fictional project transfer decision" &&
      row.status === "PROJECT_CREDITED" ? Number(row.units) || 0 : 0), 0);
  const institutionalPercent = totalUnits ? Math.round(100 * institutionalUnits / totalUnits) : 0;
  const projectPercent = totalUnits ?
    Math.round(100 * (acceptedProjectUnits + projectTransferUnits) / totalUnits) : 0;
  const hasProjectGrades = Boolean(snapshot?.acceptedProjectResults?.length);
  const hasProjectTransfer = Boolean(snapshot?.projectTransferDecisions?.length);
  const hasProjectProgress = hasProjectGrades || hasProjectTransfer;

  return (
    <>
      <PageHeader title="Academic Records" description="Academic history and progress through your assigned curriculum." />
      {mode !== "project" || !snapshot ? (
        <Card><EmptyState title="Academic records unavailable"
          description="We could not verify a project student academic source for this account. Sign in with an activated student account and try again." /></Card>
      ) : (
        <>
          <div className="summary-strip" style={{ marginBottom: 16 }}>
            <span>Student: <strong>{snapshot.studentNumber}</strong></span>
            <span>Program: <strong>{snapshot.program}{snapshot.track ? ` · ${snapshot.track}` : ""}</strong></span>
            <span>Curriculum: <strong>{displayCurriculumCode(snapshot.curriculumCode)}</strong></span>
            <span>Year: <strong>{snapshot.yearLevel}</strong></span>
          </div>
          {hasProjectTransfer && <div className="summary-strip" style={{ marginBottom: 16 }}>
            <span>Fictional transfer decisions: <strong>{snapshot.projectTransferSummary?.total ?? 0}</strong></span>
            <span>Project credited: <strong>{snapshot.projectTransferSummary?.projectCredited ?? 0}</strong></span>
            <span>Project pending: <strong>{snapshot.projectTransferSummary?.projectPending ?? 0}</strong></span>
            <span>Fictional transfer source: <strong>Not institutionally verified</strong></span>
          </div>}
          <InternalTabs items={TABS.map((item) => ({ value: item, label: item }))}
            selected={tab} onSelect={(value) => { setTab(value); setStatus("ALL"); setSearch(""); setPage(1); }}
            label="Academic record sections" panelCard>
            {tab === TABS[0] ? (
              <>
                <div className="toolbar">
                  <SearchControl value={search} onChange={reset(setSearch)} placeholder="Search code or subject" />
                  <FilterControl label="Term" value={term} onChange={reset(setTerm)}
                    options={[{ value: "ALL", label: "All terms" },
                      ...terms.map((value) => ({ value, label: value }))]} />
                  <FilterControl label="Result" value={status} onChange={reset(setStatus)}
                    options={[{ value: "ALL", label: "All results" },
                      ...statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))]} />
                  <FilterControl label="Sort" value={sort} onChange={reset(setSort)}
                    options={[{value:"NEWEST",label:"Newest term"},{value:"OLDEST",label:"Oldest term"},{value:"SUBJECT",label:"Subject code"}]} />
                </div>
                <DataTable rows={pagedRows} rowKey="key"
                  emptyMessage="No project decisions, accepted project results or published academic records match these filters."
                  onRowClick={setSelected} rowTitle="View academic result"
                  getRowAriaLabel={(row) => `View ${displaySubjectCode(row.code)} academic result`}
                  columns={[
                    { key: "code", label: "Code", render: (row) => displaySubjectCode(row.code) },
                    { key: "name", label: "Subject", render: (row) => displaySubjectCode(row.name) },
                    { key: "professor", label: "Previous Professor (Demo)", render: (row) => row.professor || "Not recorded" },
                    { key: "units", label: "Units", render: (row) => formatUnits(row.units) },
                    { key: "term", label: "Term" },
                    { key: "grade", label: "Grade", render: (row) => row.grade == null ? "Not recorded" : String(row.grade) },
                    { key: "status", label: "Result", render: (row) => <StatusBadge value={row.status} /> },
                    { key: "source", label: "Provenance" },
                  ]} />
                {filteredHistory.length > PAGE_SIZE && <TablePagination
                  page={safePage} pageSize={PAGE_SIZE} total={filteredHistory.length}
                  onPageChange={setPage} label="Academic history pages" />}
              </>
            ) : (
              <>
                <div className="summary-strip">
                  <span>Assigned curriculum units: <strong>{formatUnits(totalUnits)}</strong></span>
                  <span>Institutionally completed or credited units: <strong>{formatUnits(institutionalUnits)}</strong></span>
                  {hasProjectGrades && <span>Accepted project completed units: <strong>{formatUnits(acceptedProjectUnits)}</strong></span>}
                  {hasProjectTransfer && <span>Fictional project transfer credited units: <strong>{formatUnits(projectTransferUnits)}</strong></span>}
                </div>
                <div style={{ marginTop: 12 }}>Institutional curriculum progress: <strong>{institutionalPercent}%</strong></div>
                <div className="progress-track" style={{ marginTop: 12, marginBottom: 16 }}
                  role="progressbar" aria-label="Institutional curriculum progress"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={institutionalPercent}>
                  <div className="progress-fill" style={{ width: `${institutionalPercent}%` }} />
                </div>
                {hasProjectProgress && <>
                  <div>Project demonstration curriculum progress: <strong>{projectPercent}%</strong></div>
                  <div className="progress-track" style={{ marginTop: 12, marginBottom: 16 }}
                    role="progressbar" aria-label="Project demonstration curriculum progress"
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={projectPercent}>
                    <div className="progress-fill" style={{ width: `${projectPercent}%` }} />
                  </div>
                  <div className="notice" style={{ marginBottom: 16 }}>Project progress is fictional and separate from institutional completion. Pending transfer decisions grant no completed credits.</div>
                </>}

                <div className="toolbar">
                  <SearchControl value={search} onChange={reset(setSearch)} placeholder="Search curriculum subjects" />
                  <FilterControl label="Year level" value={year} onChange={reset(setYear)}
                    options={[{ value: "ALL", label: "All years" },
                      ...[...new Set(curriculum.map((row) => String(row.yearLevel)))].map((value) => ({ value, label: `Year ${value}` }))]} />
                  <FilterControl label="Progress" value={status} onChange={reset(setStatus)}
                    options={[{ value: "ALL", label: "All statuses" },
                      ...statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))]} />
                  <FilterControl label="Sort" value={sort} onChange={reset(setSort)}
                    options={[{value:"NEWEST",label:"Curriculum order"},{value:"SUBJECT",label:"Subject code"}]} />
                </div>
                <DataTable rows={pagedRows} rowKey="code"
                  emptyMessage="No curriculum subjects match these filters."
                  onRowClick={setSelected} rowTitle="View curriculum subject details"
                  getRowAriaLabel={(row) => `View ${displaySubjectCode(row.code)} curriculum details`}
                  columns={[
                    { key: "code", label: "Subject Code", render: (row) => displaySubjectCode(row.code) },
                    { key: "name", label: "Subject", render: (row) => displaySubjectCode(row.name) },
                    { key: "yearLevel", label: "Year", render: (row) => `Year ${row.yearLevel}` },
                    { key: "semester", label: "Semester" },
                    { key: "units", label: "Curriculum Units", render: (row) => formatUnits(row.units) },
                    { key: "status", label: "Academic Progress", render: (row) => <StatusBadge value={row.status} /> },
                    { key: "source", label: "Provenance" },
                  ]} />
                {filteredCurriculum.length > PAGE_SIZE && <TablePagination
                  page={safePage} pageSize={PAGE_SIZE} total={filteredCurriculum.length}
                  onPageChange={setPage} label="Curriculum progress pages" />}
              </>
            )}
          </InternalTabs>
          <Modal open={Boolean(selected)} onClose={() => setSelected(null)}
            title={selected ? `${displaySubjectCode(selected.code)} · ${displaySubjectCode(selected.name)}` : "Subject details"}
            footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
            {selected && (
              <>
                <div className="info-grid">
                  <div className="info-item"><span>Subject Code</span><strong>{displaySubjectCode(selected.code)}</strong></div>
                  <div className="info-item"><span>Units</span><strong>{formatUnits(selected.units)}</strong></div>
                  <div className="info-item"><span>Result or Decision Status</span><strong><StatusBadge value={selected.status} /></strong></div>
                  {"term" in selected ? (
                    <>
                      <div className="info-item"><span>Term</span><strong>{selected.term}</strong></div>
                      <div className="info-item"><span>{selected.source === "Accepted project result" ? "Accepted Project Grade" : selected.source === "Published Registrar result" ? "Published Grade" : "Grade"}</span><strong>{selected.grade == null ? "Not applicable" : selected.grade}</strong></div>
                      <div className="info-item"><span>Source</span><strong>{selected.source}</strong></div>
                      {selected.professor ? <div className="info-item"><span>Previous Professor (Fictional Demo)</span><strong>{selected.professor}</strong></div> : null}
                    </>
                  ) : (
                    <>
                      <div className="info-item"><span>Year</span><strong>{selected.yearLevel}</strong></div>
                      <div className="info-item"><span>Semester</span><strong>{selected.semester}</strong></div>
                      <div className="info-item"><span>Source</span><strong>{selected.source}</strong></div>
                    </>
                  )}
                </div>
                {(selected.note || selected.reason) && <div className="notice" style={{ marginTop: 14 }}>{selected.note || selected.reason}</div>}
              </>
            )}
          </Modal>
        </>
      )}
    </>
  );
}
