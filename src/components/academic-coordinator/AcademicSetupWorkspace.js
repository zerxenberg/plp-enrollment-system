"use client";

import { Fragment, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, DataTable, FilterControl, Modal, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";
import AppIcon from "@/components/ui/AppIcon";
import { Feedback, Info, Panel, Tabs } from "@/components/registrar/RegistrarShared";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { DEPARTMENTS, YEARS, SEMESTERS, MOCK_ACADEMIC_YEARS, formatDemoPeso, summarizeCurriculum, getAcademicSubjectOptions, getPrerequisiteCandidates } from "@/features/academic/academic-reference";

const VIEWS = [
  { value: "programs", label: "Programs" },
  { value: "subjects", label: "Subjects" },
  { value: "curriculum", label: "Curriculum" },
];
const ALL = { value: "ALL", label: "All" };
const yearOptions = YEARS.map((value) => ({ value, label: value }));
const semesterOptions = SEMESTERS.map((value) => ({ value, label: value }));
const freshProgram = () => ({ code: "", name: "", department: DEPARTMENTS[0].id, status: "Active", majors: [] });
const freshSubject = () => ({ code: "", name: "", units: 3, department: DEPARTMENTS[0].id, programs: ["BSIT"], yearLevel: YEARS[0], semester: SEMESTERS[0], status: "Active", description: "", prerequisites: [], feePerUnit: 100 });
const freshCurriculum = () => ({ department: DEPARTMENTS[0].id, program: "BSIT", major: "", version: "", effectiveAcademicYear: "2026 to 2027", status: "Draft", assignments: [] });
const programMajors = (program) => program?.majors || program?.specializations?.map((major) => typeof major === "string" ? major : major.name) || [];
const semesterKey = (yearLevel, semester) => `${yearLevel}|${semester}`;
const semesterSections = YEARS.flatMap((yearLevel) => SEMESTERS.map((semester) => ({ yearLevel, semester, key: semesterKey(yearLevel, semester) })));
const semesterIndex = (yearLevel, semester) => YEARS.indexOf(yearLevel) * SEMESTERS.length + SEMESTERS.indexOf(semester);
const CURRICULUM_STATUSES = ["Draft", "Active", "Inactive", "Archived"];
const CONFIRMABLE_CURRICULUM_ACTIONS = {
  activate: { from: ["Draft", "Inactive"], to: "Active", label: "Activate" },
  deactivate: { from: ["Active"], to: "Inactive", label: "Deactivate" },
  archive: { from: ["Inactive"], to: "Archived", label: "Archive" },
  restore: { from: ["Archived"], to: "Inactive", label: "Restore" },
};

export default function AcademicSetupWorkspace() {
  const params = useSearchParams();
  const {
    catalog, academicCoordinatorData,
    createAcademicProgram, updateAcademicProgram,
    createAcademicSubject, updateAcademicSubject,
    createCurriculumVersion, updateCurriculumVersion, duplicateCurriculumVersion,
    activateCurriculumVersion, deactivateCurriculumVersion, archiveCurriculumVersion,
    restoreCurriculumVersion, validateCurriculumVersion, resetMockAcademicSetup,
  } = useDemoData();
  const [view, setView] = useState(() => {
    const requested = params.get("view");
    return requested === "prerequisites" ? "subjects" : VIEWS.some((item) => item.value === requested) ? requested : "programs";
  });
  const [requestedView, setRequestedView] = useState(params.get("view"));
  if (requestedView !== params.get("view")) {
    const requested = params.get("view");
    setRequestedView(requested);
    if (requested === "prerequisites") setView("subjects");
    else if (VIEWS.some((item) => item.value === requested)) setView(requested);
  }

  const departments = catalog.departments?.length ? catalog.departments : DEPARTMENTS;
  const programs = catalog.programs || [];
  const subjects = catalog.subjects || [];
  const curricula = academicCoordinatorData.curricula || [];
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [program, setProgram] = useState("ALL");
  const [major, setMajor] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [year, setYear] = useState("ALL");
  const [semester, setSemester] = useState("ALL");
  const [dialog, setDialog] = useState("");
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [programForm, setProgramForm] = useState(freshProgram);
  const [majorText, setMajorText] = useState("");
  const [subjectForm, setSubjectForm] = useState(freshSubject);
  const [curriculumForm, setCurriculumForm] = useState(freshCurriculum);
  const [prerequisiteSearch, setPrerequisiteSearch] = useState("");
  const [subjectSearch, setSubjectSearch] = useState({});
  const [chosenSubjects, setChosenSubjects] = useState({});
  const [activeSemester, setActiveSemester] = useState(semesterSections[0].key);
  const [semesterDetails, setSemesterDetails] = useState(null);
  const [curriculumHistory, setCurriculumHistory] = useState(null);
  const [versionConfirmation, setVersionConfirmation] = useState(null);
  const [versionActionError, setVersionActionError] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  const versionBusyRef = useRef(false);
  const [curriculumSort, setCurriculumSort] = useState("version");
  const [collapsedCurricula, setCollapsedCurricula] = useState({});
  const [page, setPage] = useState(1);

  const programList = programs.filter((item) => department === "ALL" || item.department === department);
  const chosenProgram = programs.find((item) => item.code === program);
  const programOptions = [{ ...ALL, label: "All Programs" }, ...programList.map((item) => ({ value: item.code, label: item.code }))];
  const majors = programMajors(chosenProgram);
  const matchesContext = (item) => {
    const itemPrograms = item.programs || [item.program || "BSIT"];
    return (department === "ALL" || item.department === department || itemPrograms.some((code) => programs.find((p) => p.code === code)?.department === department)) &&
      (program === "ALL" || itemPrograms.includes(program)) &&
      (status === "ALL" || (item.status || "Active") === status);
  };
  const visiblePrograms = programList.filter((item) =>
    (program === "ALL" || item.code === program) &&
    (status === "ALL" || item.status === status) &&
    `${item.code} ${item.name} ${item.department} ${programMajors(item).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const visibleSubjects = subjects.filter((item) =>
    matchesContext(item) &&
    (year === "ALL" || item.yearLevel === year) &&
    (semester === "ALL" || item.semester === semester) &&
    `${item.code} ${item.name}`.toLowerCase().includes(search.toLowerCase()));
  const visibleCurricula = curricula.filter((item) =>
    (department === "ALL" || (item.department || programs.find((entry) => entry.code === item.program)?.department) === department) &&
    (program === "ALL" || item.program === program) &&
    (major === "ALL" || (item.major || "") === major) &&
    (status === "ALL" || item.status === status) &&
    `${item.id} ${item.version} ${item.program} ${programs.find((entry) => entry.code === item.program)?.name || ""} ${item.department} ${departments.find((entry) => entry.id === item.department)?.name || ""} ${item.major || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => String(a[curriculumSort] || "").localeCompare(String(b[curriculumSort] || "")) || a.id.localeCompare(b.id));
  const visibleSemesterCount = visibleCurricula.filter((item) => !collapsedCurricula[item.id]).length * semesterSections.length;
  const activeForConfirmation = versionConfirmation?.action === "activate" ? curricula.find((item) =>
    item.id !== versionConfirmation.curriculum.id && item.status === "Active" &&
    item.program === versionConfirmation.curriculum.program &&
    (item.major || "") === (versionConfirmation.curriculum.major || "")) : null;
  const subjectPageCount = Math.max(1, Math.ceil(visibleSubjects.length / 20));
  const shownSubjects = visibleSubjects.slice((Math.min(page, subjectPageCount) - 1) * 20, Math.min(page, subjectPageCount) * 20);
  const curriculumProgram = programs.find((item) => item.code === curriculumForm.program);
  const curriculumMajors = programMajors(curriculumProgram);
  const subjectPrograms = programs.filter((item) => subjectForm.department === "SHARED" || item.department === subjectForm.department);
  const subjectMajorChoices = subjectForm.programs.length === 1 ? programMajors(programs.find((item) => item.code === subjectForm.programs[0])) : [];
  const prerequisiteCandidates = getPrerequisiteCandidates(catalog, subjectForm)
    .filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(prerequisiteSearch.toLowerCase()));
  const activeSection = semesterSections.find((section) => section.key === activeSemester) || semesterSections[0];
  const curriculumSummary = summarizeCurriculum(curriculumForm.assignments, subjects, activeSection.yearLevel, activeSection.semester);
  const selectedProgramReference = programs.find((item) => item.code === curriculumForm.program);
  const incompatibleAssignments = curriculumForm.assignments.filter((assignment) => {
    const item = subjects.find((subject) => subject.code === assignment.subjectCode);
    return !item || item.status === "Inactive" ||
      !(item.programs || [item.program]).includes(curriculumForm.program) ||
      (item.department !== "SHARED" && item.department !== curriculumForm.department) ||
      (item.major && item.major !== curriculumForm.major);
  });
  const subjectCandidatesFor = (section) => getAcademicSubjectOptions(catalog, {
    departmentId: curriculumForm.department, programId: selectedProgramReference?.id,
    major: curriculumForm.major, yearLevel: section.yearLevel, semester: section.semester,
  }).filter((item) =>
    !curriculumForm.assignments.some((assignment) => assignment.subjectCode === item.code) &&
    `${item.code} ${item.name}`.toLowerCase().includes((subjectSearch[section.key] || "").toLowerCase()));

  function report(result, successText) {
    const ok = result === true || result?.ok === true;
    setFeedback({ ok, text: ok ? successText : result?.errors?.length ? result.errors.join(" · ") : result?.message || "The demo operation could not be saved." });
    return ok;
  }
  function changeDepartment(value) {
    setDepartment(value);
    if (program !== "ALL" && !programs.some((item) => item.code === program && item.department === value)) { setProgram("ALL"); setMajor("ALL"); }
    setPage(1);
  }
  function changeProgram(value) {
    setProgram(value); setMajor("ALL"); setPage(1);
  }
  function resetFilters() {
    setDepartment("ALL"); setProgram("ALL"); setMajor("ALL"); setYear("ALL"); setSemester("ALL"); setStatus("ALL"); setSearch(""); setPage(1);
  }
  function closeDialog() {
    if (dialog && ["program", "subject", "curriculum"].includes(dialog) && !window.confirm("Close this editor? Any unsaved changes will be lost.")) return;
    setDialog(""); setSelected(null);
  }
  function openProgram(row = null) {
    setSelected(row);
    setProgramForm(row ? { ...row, majors: programMajors(row) } : freshProgram());
    setMajorText(row ? programMajors(row).join(", ") : "");
    setDialog("program");
  }
  function openSubject(row = null) {
    setSelected(row);
    const initial = row ? {
      ...row,
      department: row.department || programs.find((item) => item.code === row.program)?.department || "CCS",
      programs: row.programs || [row.program || "BSIT"],
      prerequisites: row.prerequisites || [],
      feePerUnit: row.feePerUnit ?? 100,
    } : {
      ...freshSubject(),
      department: department === "ALL" ? DEPARTMENTS[0].id : department,
      programs: program === "ALL" ? [programs.find((entry) => entry.department === (department === "ALL" ? DEPARTMENTS[0].id : department))?.code].filter(Boolean) : [program],
    };
    setSubjectForm(initial); setPrerequisiteSearch(""); setDialog("subject");
  }
  function openCurriculum(row = null, readOnly = false) {
    setSelected(row);
    const selectedProgram = program !== "ALL" ? programs.find((item) => item.code === program) : null;
    const form = row ? {
      id: row.id, department: row.department, program: row.program, major: row.major || "",
      version: row.version, effectiveAcademicYear: row.effectiveAcademicYear,
      status: row.status, assignments: (row.assignments || []).map((item) => ({ ...item })),
    } : {
      ...freshCurriculum(),
      department: department !== "ALL" ? department : DEPARTMENTS[0].id,
      program: selectedProgram?.code || programs.find((item) => item.department === (department !== "ALL" ? department : DEPARTMENTS[0].id))?.code || "",
      major: major !== "ALL" ? major : "",
    };
    setCurriculumForm(form); setActiveSemester(semesterSections[0].key);
    setSubjectSearch({}); setChosenSubjects({}); setDialog(readOnly ? "curriculum-view" : "curriculum");
  }
  function saveProgram(event) {
    event.preventDefault();
    const payload = { ...programForm, majors: majorText.split(",").map((item) => item.trim()).filter(Boolean) };
    const result = selected
      ? updateAcademicProgram(selected.code, payload)
      : createAcademicProgram(payload);
    if (report(result, `Demo program ${selected ? "updated" : "created"} successfully.`)) { setDialog(""); setSelected(null); }
  }
  function saveSubject(event) {
    event.preventDefault();
    const payload = { ...subjectForm, program: subjectForm.programs[0] };
    const result = selected ? updateAcademicSubject(selected.code, payload) : createAcademicSubject(payload);
    if (report(result, `Subject ${selected ? "updated" : "created"} successfully.`)) { setDialog(""); setSelected(null); }
  }
  function saveCurriculum(event) {
    event.preventDefault();
    const result = selected
      ? updateCurriculumVersion(selected.id, curriculumForm)
      : createCurriculumVersion(curriculumForm);
    if (report(result, "Curriculum Draft saved with its assigned subjects.")) { setDialog(""); setSelected(null); }
  }
  function addSubjects(section) {
    const selectedCodes = chosenSubjects[section.key] || [];
    if (!selectedCodes.length) return;
    setCurriculumForm((current) => ({
      ...current,
      assignments: [...current.assignments, ...selectedCodes.filter((code) =>
        !current.assignments.some((item) => item.subjectCode === code)
      ).map((subjectCode) => ({
        subjectCode, yearLevel: section.yearLevel, semester: section.semester,
        prerequisites: [...(subjects.find((item) => item.code === subjectCode)?.prerequisites || [])],
      }))],
    }));
    setChosenSubjects((current) => ({ ...current, [section.key]: [] }));
    setActiveSemester(section.key);
  }
  function updateAssignment(code, changes) {
    setCurriculumForm((current) => ({
      ...current,
      assignments: current.assignments.map((item) => item.subjectCode === code ? { ...item, ...changes } : item),
    }));
  }
  function updateAssignmentPrerequisite(code, prerequisiteCode) {
    setCurriculumForm((current) => ({
      ...current,
      assignments: current.assignments.map((item) => item.subjectCode !== code ? item : ({
        ...item,
        prerequisites: (item.prerequisites || []).includes(prerequisiteCode)
          ? item.prerequisites.filter((value) => value !== prerequisiteCode)
          : [...(item.prerequisites || []), prerequisiteCode],
      })),
    }));
  }
  function removeAssignment(code) {
    setCurriculumForm((current) => ({
      ...current, assignments: current.assignments.filter((item) => item.subjectCode !== code),
    }));
  }
  function closeVersionConfirmation() {
    if (versionBusyRef.current) return;
    setVersionConfirmation(null);
    setVersionActionError("");
  }
  function confirmVersionAction(action, row) {
    if (versionBusyRef.current) return;
    const latest = curricula.find((entry) => entry.id === row.id);
    const rule = CONFIRMABLE_CURRICULUM_ACTIONS[action];
    if (!latest || !rule?.from.includes(latest.status)) {
      report({ ok: false, message: "The curriculum status has changed. Review the current version and try again." });
      return;
    }
    if (action === "activate") {
      const validation = validateCurriculumVersion(latest.id);
      if (!validation?.ok) {
        report(validation, "");
        return;
      }
    }
    setVersionActionError("");
    setVersionConfirmation({ action, curriculum: latest });
  }
  async function manageVersion(action, row) {
    if (versionBusyRef.current) return;
    const operation = {
      duplicate: duplicateCurriculumVersion,
      validate: validateCurriculumVersion,
      activate: activateCurriculumVersion,
      deactivate: deactivateCurriculumVersion,
      archive: archiveCurriculumVersion,
      restore: restoreCurriculumVersion,
    }[action];
    if (typeof operation !== "function") {
      const error = "This curriculum action is unavailable in the demo provider.";
      report({ ok: false, message: error });
      if (versionConfirmation) setVersionActionError(error);
      return;
    }
    versionBusyRef.current = true;
    setVersionBusy(true);
    setVersionActionError("");
    try {
      const result = await operation(row.id);
      const message = {
        duplicate: `A separate Draft copy of ${row.version} was created.`,
        validate: `${row.version} passed curriculum validation.`,
        activate: `${row.version} is now Active. Any previous Active version for this program and major is now Inactive.`,
        deactivate: `${row.version} is now Inactive. Its historical assignments remain unchanged.`,
        archive: `${row.version} is now Archived and remains available for historical reference.`,
        restore: `${row.version} is now Inactive and may be validated for future activation.`,
      }[action];
      const ok = report(result, message);
      if (ok) setVersionConfirmation(null);
      else if (versionConfirmation) setVersionActionError(result?.errors?.join(" · ") || result?.message || "Curriculum action could not be completed.");
    } catch {
      const error = "The curriculum action could not be completed. Please try again.";
      report({ ok: false, message: error });
      if (versionConfirmation) setVersionActionError(error);
    } finally {
      versionBusyRef.current = false;
      setVersionBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Academic Setup" description="Manage programs, shared subjects and complete curriculum versions. Academic records and fees below are illustrative demo data." />
      <div className="academic-setup-tabs">
        <Tabs items={VIEWS} selected={view} onSelect={(value) => { setView(value); resetFilters(); setSelected(null); setFeedback(null); }} label="Academic setup sections" title={VIEWS.find((item) => item.value === view)?.label} subtitle="Browse all demo academic records, or narrow them using filters.">
          <p className="academic-demo-note">Demo Academic Data. Subjects, curriculum checklists and ₱100.00 per unit default are sample values, not official PLP academic or tuition policies.</p>
          {feedback && <Feedback message={feedback.text} warning={!feedback.ok} />}
          <div className="academic-filters">
            <SearchControl label="Search academic records" value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search by code, title or version" />
            <FilterControl label="College Department" value={department} onChange={changeDepartment} options={[{ value: "ALL", label: "All Departments" }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} />
            <FilterControl label="Academic Program" value={program} onChange={changeProgram} options={programOptions} />
            {majors.length > 0 && <FilterControl label="Major" value={major} onChange={setMajor} options={[{ value: "ALL", label: "All Majors" }, ...majors.map((value) => ({ value, label: value }))]} />}
            {view === "subjects" && <FilterControl label="Year Level" value={year} onChange={(value) => { setYear(value); setPage(1); }} options={[{ value: "ALL", label: "All Years" }, ...yearOptions]} />}
            {view === "subjects" && <FilterControl label="Semester" value={semester} onChange={(value) => { setSemester(value); setPage(1); }} options={[{ value: "ALL", label: "All Semesters" }, ...semesterOptions]} />}
            <FilterControl label="Status" value={status} onChange={setStatus} options={[{ value: "ALL", label: "All Statuses" }, ...(view === "curriculum" ? CURRICULUM_STATUSES : ["Active", "Inactive"]).map((value) => ({ value, label: value }))]} />
            <Button variant="ghost" onClick={resetFilters}>Clear Filters</Button>
          </div>
          {view === "programs" && (
            <>
              <div className="academic-list-heading"><span>{visiblePrograms.length} degree programs</span><Button onClick={() => openProgram()}>Add Demo Program</Button></div>
              <DataTable rowKey="code" rows={visiblePrograms} columns={[
                { key: "department", label: "Department", render: (row) => departments.find((item) => item.id === row.department)?.name || row.department },
                { key: "code", label: "Code" },
                { key: "name", label: "Program Name" },
                { key: "majors", label: "Majors", render: (row) => programMajors(row).join(", ") || "None" },
                { key: "curricula", label: "Curriculum Versions", render: (row) => curricula.filter((item) => item.program === row.code).length },
                { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} label={row.status} /> },
                { key: "actions", label: "Actions", render: (row) => <div className="cell-actions"><button className="table-action" onClick={() => { changeDepartment(row.department); setProgram(row.code); setView("curriculum"); }}>View Curricula</button><button className="table-action" onClick={() => openProgram(row)}>Edit</button></div> },
              ]} />
            </>
          )}
          {view === "subjects" && (
            <>
              <div className="academic-list-heading"><span>{visibleSubjects.length} subjects. Page {Math.min(page, subjectPageCount)} of {subjectPageCount}</span><Button onClick={() => openSubject()}>Add Subject</Button></div>
              <DataTable rowKey="code" rows={shownSubjects} emptyMessage="No subjects match these academic filters." columns={[
                { key: "code", label: "Subject Code" },
                { key: "name", label: "Subject Name" },
                { key: "department", label: "Department", render: (row) => departments.find((item) => item.id === row.department)?.code || (row.department === "SHARED" ? "Shared" : row.department) },
                { key: "programs", label: "Applicable Programs", render: (row) => (row.programs || [row.program || "BSIT"]).join(", ") },
                { key: "units", label: "Units" },
                { key: "placement", label: "Suggested Placement", render: (row) => `${row.yearLevel || "Any"} · ${row.semester || "Any"}` },
                { key: "prerequisites", label: "Prerequisites", render: (row) => row.prerequisites?.join(", ") || "None" },
                { key: "fee", label: "Estimated Subject Fee", render: (row) => formatDemoPeso(Number(row.units) * Number(row.feePerUnit ?? 100)) },
                { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status || "Active"} /> },
                { key: "actions", label: "Actions", render: (row) => <button className="table-action" onClick={() => openSubject(row)}>Edit / Prerequisites</button> },
              ]} />
              {subjectPageCount > 1 && <div className="academic-pagination"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>{Math.min(page, subjectPageCount)} / {subjectPageCount}</span><Button variant="ghost" disabled={page >= subjectPageCount} onClick={() => setPage((current) => current + 1)}>Next</Button></div>}
            </>
          )}
          {view === "curriculum" && (
            <>
              <div className="academic-list-heading"><span>{visibleCurricula.length} curriculum versions, {visibleSemesterCount} semester rows displayed from {curricula.length} total versions.</span><div className="action-row"><Button variant="ghost" onClick={() => { if (window.confirm("Restore the original mock Academic Setup data? This discards all Academic Setup demo edits.")) { if (typeof resetMockAcademicSetup === "function") report(resetMockAcademicSetup(), "Academic Setup demo data restored."); else report({ ok: false, message: "Reset is not available." }); } }}>Reset Demo Data</Button><Button onClick={() => openCurriculum()}>Create Curriculum Version</Button></div></div>
              <div className="academic-curriculum-status-totals" aria-label="Curriculum status totals">
                {CURRICULUM_STATUSES.map((value) => <span key={value} className={`status-badge academic-curriculum-status academic-curriculum-status-${value.toLowerCase()}`}>{value}: {curricula.filter((item) => item.status === value).length}</span>)}
              </div>
              <div className="academic-sort-control"><FilterControl label="Sort Curriculum Versions" value={curriculumSort} onChange={setCurriculumSort} options={[{value:"version",label:"Curriculum Version"},{value:"program",label:"Academic Program"},{value:"effectiveAcademicYear",label:"Effective Academic Year"},{value:"status",label:"Status"}]} /></div>
              <div className="academic-curriculum-table">
                <div className="table-scroll academic-curriculum-scroll" role="region" tabIndex={0} aria-label="Curriculum table. Scroll horizontally to view all columns.">
                  <table className="data-table academic-curriculum-grid">
                    <caption className="sr-only">Curriculum versions grouped by year level and semester</caption>
                    <thead><tr>
                      {[
                        "Curriculum Version", "College Department", "Academic Program", "Major", "Effective Academic Year",
                        "Year Level", "Semester", "Subjects", "Total Units", "Status", "Actions",
                      ].map((heading) => <th key={heading} scope="col">{heading}</th>)}
                    </tr></thead>
                    {visibleCurricula.length === 0 && <tbody><tr><td className="academic-curriculum-empty" colSpan={11}>No curriculum versions match the selected filters.</td></tr></tbody>}
                    {visibleCurricula.map((curriculum) => {
                      const expanded = !collapsedCurricula[curriculum.id];
                      const yearGroupIds = YEARS.map((_, index) => `academic-year-${curriculum.id}-${index}`);
                      return <Fragment key={curriculum.id}>
                        <tbody className="academic-curriculum-heading-group" data-curriculum-id={curriculum.id}>
                          <tr className="academic-version-header-row">
                            <th scope="row" className="academic-version-cell">
                              <button type="button" className="academic-version-toggle" aria-expanded={expanded} aria-controls={yearGroupIds.join(" ")} onClick={() => setCollapsedCurricula((current) => ({ ...current, [curriculum.id]: !current[curriculum.id] }))}>
                                <span className={`academic-version-chevron ${expanded ? "is-expanded" : ""}`}><AppIcon name="chevronRight" size={15} /></span>
                                <span className="academic-curriculum-version">{curriculum.version}</span>
                              </button>
                            </th>
                            <td title={departments.find((item) => item.id === curriculum.department)?.name || curriculum.department}>{departments.find((item) => item.id === curriculum.department)?.name || curriculum.department}</td>
                            <td>{curriculum.program}</td>
                            <td title={curriculum.major || "None"}>{curriculum.major || "None"}</td>
                            <td>{curriculum.effectiveAcademicYear}</td>
                            <td colSpan={4} className="academic-curriculum-meta-space" aria-hidden="true" />
                            <td><span className={`status-badge academic-curriculum-status academic-curriculum-status-${String(curriculum.status).toLowerCase()}`}>{curriculum.status}</span></td>
                            <td className="academic-actions-cell"><div className="academic-row-actions academic-version-actions">
                              <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => openCurriculum(curriculum, true)}>View Curriculum</button>
                              {curriculum.status === "Draft" && <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => openCurriculum(curriculum)}>Edit Draft</button>}
                              {curriculum.status !== "Archived" && <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => manageVersion("duplicate", curriculum)}>Duplicate</button>}
                              {curriculum.status !== "Archived" && <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => manageVersion("validate", curriculum)}>Validate</button>}
                              {["Draft", "Inactive"].includes(curriculum.status) && <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => confirmVersionAction("activate", curriculum)}>Activate</button>}
                              {curriculum.status === "Active" && <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => confirmVersionAction("deactivate", curriculum)}>Deactivate</button>}
                              {curriculum.status === "Inactive" && <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => confirmVersionAction("archive", curriculum)}>Archive</button>}
                              {curriculum.status === "Archived" && <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => confirmVersionAction("restore", curriculum)}>Restore</button>}
                              <button className="table-action academic-glass-action" type="button" disabled={versionBusy} onClick={() => setCurriculumHistory(curriculum)}>History</button>
                            </div></td>
                          </tr>
                        </tbody>
                        {YEARS.map((yearLevel, yearIndex) => <tbody key={`${curriculum.id}-${yearLevel}`} id={yearGroupIds[yearIndex]} className="academic-curriculum-year-group" data-curriculum-id={curriculum.id} hidden={!expanded}>
                          {SEMESTERS.map((term, termIndex) => {
                            const section = { yearLevel, semester: term };
                            const metrics = summarizeCurriculum(curriculum.assignments || [], subjects, yearLevel, term).selected;
                            return <tr className="academic-semester-row" key={`${curriculum.id}-${yearLevel}-${term}`}>
                              {termIndex === 0 && <><td className="academic-curriculum-meta-space" colSpan={5} rowSpan={2} aria-hidden="true" /><th className="academic-year-cell" scope="rowgroup" rowSpan={2}>{yearLevel}</th></>}
                              <th scope="row" className="academic-semester-cell">{term}</th>
                              <td className="academic-number-cell">{metrics.subjects}</td>
                              <td className="academic-number-cell">{metrics.units}</td>
                              <td className="academic-semester-status" aria-hidden="true" />
                              <td className="academic-actions-cell"><div className="academic-row-actions">
                                <button className="table-action academic-glass-action" type="button" onClick={() => setSemesterDetails({ curriculum, section })}>View Subjects</button>
                              </div></td>
                            </tr>;
                          })}
                        </tbody>)}
                      </Fragment>;
                    })}
                  </table>
                </div>
              </div>
            </>
          )}
        </Tabs>
      </div>

      <Modal open={dialog === "program"} title={selected ? "Edit Program" : "Add Demo Program"} onClose={closeDialog} footer={<><Button variant="ghost" onClick={closeDialog}>Cancel</Button><Button type="submit" form="academic-program-form">Save Program</Button></>}>
        <form className="form-grid" id="academic-program-form" onSubmit={saveProgram}>
          <label className="field">College Department<select required value={programForm.department} onChange={(event) => setProgramForm({ ...programForm, department: event.target.value })}>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field">Program Code<input required disabled={Boolean(selected)} value={programForm.code} onChange={(event) => setProgramForm({ ...programForm, code: event.target.value.toUpperCase() })} /></label>
          <label className="field full">Program Name<input required value={programForm.name} onChange={(event) => setProgramForm({ ...programForm, name: event.target.value })} /></label>
          <label className="field full">Majors or Specializations (comma separated, optional)<input value={majorText} onChange={(event) => setMajorText(event.target.value)} disabled={Boolean(selected?.reference === "Verified Program")} /></label>
          <label className="field">Status<select value={programForm.status} onChange={(event) => setProgramForm({ ...programForm, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
          <p className="notice full">Additional programs created here are demo records. Verified PLP reference programs remain identified in the catalog.</p>
        </form>
      </Modal>

      <Modal open={dialog === "subject"} title={selected ? `Edit Subject · ${selected.code}` : "Add Demo Subject"} onClose={closeDialog} className="academic-setup-wide-modal" footer={<><Button variant="ghost" onClick={closeDialog}>Cancel</Button><Button type="submit" form="academic-subject-form">Save Subject</Button></>}>
        <form className="academic-editor" id="academic-subject-form" onSubmit={saveSubject}>
          <h3>Subject Information</h3>
          <div className="form-grid">
            <label className="field">College Department<select value={subjectForm.department} onChange={(event) => setSubjectForm({ ...subjectForm, department: event.target.value, programs: event.target.value === "SHARED" ? programs.map((item) => item.code) : [], major: "" })}>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="SHARED">General Education (Shared Across Programs)</option></select></label>
            <label className="field">Subject Code<input required disabled={Boolean(selected)} value={subjectForm.code} onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value.toUpperCase() })} /></label>
            <label className="field full">Subject Name<input required value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} /></label>
            <div className="field full"><span>Applicable Programs</span><div className="academic-check-grid">{subjectPrograms.map((item) => <label key={item.code}><input type="checkbox" disabled={subjectForm.department === "SHARED"} checked={subjectForm.department === "SHARED" || subjectForm.programs.includes(item.code)} onChange={(event) => setSubjectForm({ ...subjectForm, programs: event.target.checked ? [...subjectForm.programs, item.code] : subjectForm.programs.filter((code) => code !== item.code), major: "" })} /> {item.code}</label>)}</div>{subjectForm.department === "SHARED" && <small className="academic-helper">Shared General Education subjects are available to all supported programs.</small>}</div>
            {subjectMajorChoices.length > 0 && <label className="field full">Applicable Specialization<select value={subjectForm.major || ""} onChange={(event) => setSubjectForm({ ...subjectForm, major: event.target.value })}><option value="">All Specializations</option>{subjectMajorChoices.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
            <label className="field">Number of Units<input required type="number" min="0.5" step="0.5" value={subjectForm.units} onChange={(event) => setSubjectForm({ ...subjectForm, units: Number(event.target.value) })} /></label>
            <label className="field">Status<select value={subjectForm.status} onChange={(event) => setSubjectForm({ ...subjectForm, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
            <label className="field full">Subject Description<textarea value={subjectForm.description || ""} onChange={(event) => setSubjectForm({ ...subjectForm, description: event.target.value })} /></label>
          </div>
          <h3>Suggested Academic Placement</h3>
          <div className="form-grid">
            <label className="field">Year Level<select value={subjectForm.yearLevel} onChange={(event) => setSubjectForm({ ...subjectForm, yearLevel: event.target.value })}>{YEARS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="field">Semester<select value={subjectForm.semester} onChange={(event) => setSubjectForm({ ...subjectForm, semester: event.target.value })}>{SEMESTERS.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <h3>Prerequisites</h3>
          <label className="field">Search possible prerequisites<input placeholder="Search code or subject name" value={prerequisiteSearch} onChange={(event) => setPrerequisiteSearch(event.target.value)} /></label>
          <p className="academic-helper">Only compatible subjects from earlier academic semesters are available for the selected programs and suggested placement.</p>
          <div className="academic-choices" role="group" aria-label="Eligible earlier prerequisite subjects">
            {prerequisiteCandidates.length ? prerequisiteCandidates.map((item) => (
              <label key={item.code}><input type="checkbox" checked={subjectForm.prerequisites.includes(item.code)} onChange={(event) => setSubjectForm({ ...subjectForm, prerequisites: event.target.checked ? [...new Set([...subjectForm.prerequisites, item.code])] : subjectForm.prerequisites.filter((code) => code !== item.code) })} /> {item.code} · {item.name} ({item.yearLevel}, {item.semester})</label>
            )) : <span className="academic-helper">No compatible earlier subjects match this academic context or search.</span>}
          </div>
          <p className="academic-helper">{subjectForm.prerequisites.length} selected prerequisites: {subjectForm.prerequisites.join(", ") || "None"}. Invalid or circular relationships are checked again when saved.</p>
          <h3>Estimated Tuition From Units</h3>
          <div className="form-grid">
            <label className="field">Demo Fee Per Unit (₱)<input type="number" min="0" step="0.01" value={subjectForm.feePerUnit} onChange={(event) => setSubjectForm({ ...subjectForm, feePerUnit: Number(event.target.value) })} /></label>
            <Info label="Calculated Subject Fee" value={formatDemoPeso(Number(subjectForm.units) * Number(subjectForm.feePerUnit))} />
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "curriculum" || dialog === "curriculum-view"} title={dialog === "curriculum-view" ? "Curriculum Details" : selected ? "Edit Draft Curriculum" : "Create Curriculum Version"} onClose={closeDialog} className="academic-setup-wide-modal" footer={<><Button variant="ghost" onClick={closeDialog}>{dialog === "curriculum-view" ? "Close" : "Cancel"}</Button>{dialog === "curriculum" && <Button type="submit" form="academic-curriculum-form">Save Draft</Button>}</>}>
        <form id="academic-curriculum-form" className="academic-editor" onSubmit={saveCurriculum}>
          <h3>Curriculum Information</h3>
          <div className="form-grid">
            <label className="field">Department<select disabled={Boolean(selected)} value={curriculumForm.department} onChange={(event) => { const nextPrograms = programs.filter((item) => item.department === event.target.value); setCurriculumForm({ ...curriculumForm, department: event.target.value, program: nextPrograms[0]?.code || "", major: "" }); setChosenSubjects({}); }}>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="field">Academic Program<select disabled={Boolean(selected)} value={curriculumForm.program} onChange={(event) => { setCurriculumForm({ ...curriculumForm, program: event.target.value, major: "" }); setChosenSubjects({}); }}>{programs.filter((item) => item.department === curriculumForm.department).map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
            {curriculumMajors.length > 0 && <label className="field">Major or Specialization<select required disabled={Boolean(selected)} value={curriculumForm.major || ""} onChange={(event) => { setCurriculumForm({ ...curriculumForm, major: event.target.value }); setChosenSubjects({}); }}><option value="">Select Major</option>{curriculumMajors.map((value) => <option key={value}>{value}</option>)}</select></label>}
            <label className="field">Curriculum Version<input required disabled={Boolean(selected)} value={curriculumForm.version} onChange={(event) => setCurriculumForm({ ...curriculumForm, version: event.target.value })} /></label>
            <label className="field">Effective Academic Year<select disabled={dialog === "curriculum-view"} value={curriculumForm.effectiveAcademicYear} onChange={(event) => setCurriculumForm({ ...curriculumForm, effectiveAcademicYear: event.target.value })}>{MOCK_ACADEMIC_YEARS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <Info label="Curriculum Status" value={curriculumForm.status || "Draft"} />
          </div>
          <h3>Complete Curriculum Subject Builder</h3>
          <p className="academic-helper">All eight semesters form one curriculum version. Choose each semester heading to display its demo tuition estimate. Suggested subject placements are based on the existing mock catalog.</p>
          {incompatibleAssignments.length > 0 && <p className="notice warning" role="status">{incompatibleAssignments.length} existing assignments are inactive or incompatible with the selected department, program, or specialization. Review and remove or correct these before saving or activating. The assignments remain visible until you edit them.</p>}
          <div className="academic-curriculum-metrics" aria-live="polite">
            <div className="academic-tuition-card"><span>Entire Curriculum Estimated Tuition</span><strong>{formatDemoPeso(curriculumSummary.total.tuition)}</strong><small>{curriculumSummary.total.subjects} subjects, {curriculumSummary.total.units} units across eight semesters</small></div>
            <div className="academic-tuition-card"><span>Selected Semester Estimated Tuition</span><strong>{formatDemoPeso(curriculumSummary.selected.tuition)}</strong><small>{activeSection.yearLevel}, {activeSection.semester} · {curriculumSummary.selected.subjects} subjects, {curriculumSummary.selected.units} units</small></div>
          </div>
          <div className="academic-curriculum-years">
            {YEARS.map((yearLevel) => <section className="academic-curriculum-year" key={yearLevel} aria-label={`${yearLevel} curriculum`}>
              <h4>{yearLevel}</h4>
              {SEMESTERS.map((semester) => {
                const section = { yearLevel, semester, key: semesterKey(yearLevel, semester) };
                const assignments = curriculumForm.assignments.filter((item) => item.yearLevel === yearLevel && item.semester === semester);
                const metrics = summarizeCurriculum(assignments, subjects).total;
                const candidates = dialog === "curriculum" ? subjectCandidatesFor(section) : [];
                const choices = chosenSubjects[section.key] || [];
                return <section className={`academic-semester-card ${activeSemester === section.key ? "is-selected" : ""}`} key={section.key} aria-label={`${yearLevel}, ${semester}`}>
                  <button className="academic-semester-header" type="button" aria-pressed={activeSemester === section.key} onClick={() => setActiveSemester(section.key)}><span>{semester}</span><span>{metrics.subjects} subjects · {metrics.units} units</span></button>
                  {dialog === "curriculum" && <div className="academic-subject-selector">
                    <label className="field">Search Compatible Subjects
                      <input placeholder={`Search ${yearLevel}, ${semester}`} value={subjectSearch[section.key] || ""} onFocus={() => setActiveSemester(section.key)} onChange={(event) => setSubjectSearch((current) => ({ ...current, [section.key]: event.target.value }))} />
                    </label>
                    <div className="academic-choices" role="group" aria-label={`Compatible subjects for ${yearLevel} ${semester}`}>
                      {candidates.length ? candidates.map((item) => <label key={item.code}><input type="checkbox" checked={choices.includes(item.code)} onChange={(event) => {
                        setActiveSemester(section.key);
                        setChosenSubjects((current) => ({ ...current, [section.key]: event.target.checked ? [...new Set([...(current[section.key] || []), item.code])] : (current[section.key] || []).filter((code) => code !== item.code) }));
                      }} /> <span>{item.code} · {item.name} ({item.units} units, {formatDemoPeso(Number(item.units) * Number(item.feePerUnit ?? 100))} demo estimate)</span></label>) : <span className="academic-helper">No compatible unassigned subjects for this semester. Try another search or review subject placement in the catalog.</span>}
                    </div>
                    <div className="academic-selector-actions"><span>{choices.length} selected</span><Button variant="ghost" disabled={!choices.length} onClick={() => setChosenSubjects((current) => ({ ...current, [section.key]: [] }))}>Clear Selection</Button><Button disabled={!choices.length} onClick={() => addSubjects(section)}>Add Selected Subjects</Button></div>
                  </div>}
                  <div className="academic-assignment-table">
                    <DataTable rowKey="subjectCode" rows={assignments} emptyMessage="No subjects assigned to this semester." columns={[
                      { key: "subjectCode", label: "Code" },
                      { key: "name", label: "Subject Name", render: (item) => subjects.find((subject) => subject.code === item.subjectCode)?.name || "Missing subject" },
                      { key: "units", label: "Units", render: (item) => subjects.find((subject) => subject.code === item.subjectCode)?.units ?? 0 },
                      { key: "prerequisites", label: "Prerequisites", render: (item) => <div><span>{(item.prerequisites || []).join(", ") || "None"}</span>
                        {dialog === "curriculum" && <details className="academic-prerequisite-details"><summary>Edit prerequisites</summary><div className="academic-choices">{curriculumForm.assignments.filter((assigned) => semesterIndex(assigned.yearLevel, assigned.semester) < semesterIndex(item.yearLevel, item.semester)).map((entry) => <label key={entry.subjectCode}><input type="checkbox" checked={(item.prerequisites || []).includes(entry.subjectCode)} onChange={() => updateAssignmentPrerequisite(item.subjectCode, entry.subjectCode)} />{entry.subjectCode}</label>)}</div></details>}
                      </div> },
                      { key: "feePerUnit", label: "Demo Rate Per Unit", render: (item) => dialog === "curriculum" ? <input className="academic-rate-input" type="number" min="0" step="0.01" aria-label={`Demo fee per unit for ${item.subjectCode}`} value={item.feePerUnit ?? subjects.find((subject) => subject.code === item.subjectCode)?.feePerUnit ?? 100} onFocus={() => setActiveSemester(section.key)} onChange={(event) => updateAssignment(item.subjectCode, { feePerUnit: Number(event.target.value) })} /> : formatDemoPeso(item.feePerUnit ?? subjects.find((subject) => subject.code === item.subjectCode)?.feePerUnit ?? 100) },
                      { key: "tuition", label: "Estimated Fee", render: (item) => formatDemoPeso(Number(subjects.find((subject) => subject.code === item.subjectCode)?.units || 0) * Number(item.feePerUnit ?? subjects.find((subject) => subject.code === item.subjectCode)?.feePerUnit ?? 100)) },
                      ...(dialog === "curriculum" ? [{ key: "actions", label: "Actions", render: (item) => <div className="academic-assignment-actions"><label>Move to <select aria-label={`Move ${item.subjectCode} to semester`} value={semesterKey(item.yearLevel, item.semester)} onChange={(event) => {
                        const destination = semesterSections.find((option) => option.key === event.target.value);
                        if (destination) { updateAssignment(item.subjectCode, { yearLevel: destination.yearLevel, semester: destination.semester }); setActiveSemester(destination.key); }
                      }}>{semesterSections.map((option) => <option key={option.key} value={option.key}>{option.yearLevel} · {option.semester}</option>)}</select></label><button type="button" className="table-action" onClick={() => removeAssignment(item.subjectCode)}>Remove</button></div> }] : []),
                    ]} />
                  </div>
                </section>;
              })}
            </section>)}
          </div>
          <p className="academic-helper">All tuition figures are demonstration estimates based on subject units and configured demo rates. They are not official PLP assessments or enrollment bills.</p>
          <p className="academic-helper">Only Draft versions can be edited. Duplicate any other version and modify the resulting Draft.</p>
        </form>
      </Modal>
      <Modal open={Boolean(semesterDetails)} title={semesterDetails ? `${semesterDetails.curriculum.version} · ${semesterDetails.section.yearLevel}, ${semesterDetails.section.semester}` : "Semester Subjects"} onClose={() => setSemesterDetails(null)} className="academic-setup-wide-modal" footer={<Button variant="ghost" onClick={() => setSemesterDetails(null)}>Close</Button>}>
        {semesterDetails && <div className="academic-editor">
          <p className="academic-helper">Read only semester assignments for {semesterDetails.curriculum.program}. All tuition values are demo estimates.</p>
          <DataTable rowKey="subjectCode" rows={semesterDetails.curriculum.assignments.filter((item) => item.yearLevel === semesterDetails.section.yearLevel && item.semester === semesterDetails.section.semester)} emptyMessage="No subjects assigned to this semester." columns={[
            { key: "subjectCode", label: "Code" },
            { key: "name", label: "Subject Name", render: (item) => subjects.find((subject) => subject.code === item.subjectCode)?.name || "Missing subject" },
            { key: "units", label: "Units", render: (item) => subjects.find((subject) => subject.code === item.subjectCode)?.units ?? 0 },
            { key: "prerequisites", label: "Prerequisites", render: (item) => (item.prerequisites || []).join(", ") || "None" },
            { key: "fee", label: "Estimated Fee", render: (item) => { const subject = subjects.find((entry) => entry.code === item.subjectCode); return formatDemoPeso(Number(subject?.units || 0) * Number(item.feePerUnit ?? subject?.feePerUnit ?? 100)); } },
            { key: "placement", label: "Academic Placement", render: (item) => `${item.yearLevel}, ${item.semester}` },
          ]} />
          <Info label="Semester Estimated Tuition (Demo)" value={formatDemoPeso(summarizeCurriculum(semesterDetails.curriculum.assignments, subjects, semesterDetails.section.yearLevel, semesterDetails.section.semester).selected.tuition)} />
        </div>}
      </Modal>
      <Modal open={Boolean(versionConfirmation)} title={versionConfirmation ? `${CONFIRMABLE_CURRICULUM_ACTIONS[versionConfirmation.action].label} Curriculum Version` : "Confirm Curriculum Action"} onClose={closeVersionConfirmation} className="academic-lifecycle-modal" footer={<><Button variant="ghost" disabled={versionBusy} onClick={closeVersionConfirmation}>Cancel</Button><Button disabled={versionBusy} onClick={() => versionConfirmation && manageVersion(versionConfirmation.action, versionConfirmation.curriculum)}>{versionBusy ? "Processing…" : `Confirm ${versionConfirmation ? CONFIRMABLE_CURRICULUM_ACTIONS[versionConfirmation.action].label : "Action"}`}</Button></>}>
        {versionConfirmation && <div className="academic-lifecycle-confirmation">
          <p><strong>{versionConfirmation.curriculum.version}</strong> ({versionConfirmation.curriculum.program}{versionConfirmation.curriculum.major ? ` · ${versionConfirmation.curriculum.major}` : ""}) will change from <strong>{versionConfirmation.curriculum.status}</strong> to <strong>{CONFIRMABLE_CURRICULUM_ACTIONS[versionConfirmation.action].to}</strong>.</p>
          {versionConfirmation.action === "activate" && <>
            {activeForConfirmation ? <p className="academic-lifecycle-warning" role="note"><strong>Current Active: {activeForConfirmation.version}.</strong> Confirming will automatically change this version to Inactive while activating {versionConfirmation.curriculum.version} for the same program and major.</p> : <p className="academic-lifecycle-note">This version will become the Active curriculum for its program and major.</p>}
            <p className="academic-helper">All required semesters and subjects will be validated again before activation. Existing students retain their assigned curriculum versions.</p>
          </>}
          {versionConfirmation.action === "deactivate" && <p className="academic-lifecycle-warning" role="note"><strong>Enrollment setup warning:</strong> Deactivating this Active version will leave {versionConfirmation.curriculum.program}{versionConfirmation.curriculum.major ? ` · ${versionConfirmation.curriculum.major}` : ""} without an Active curriculum until another validated version is activated. Students already assigned to this version retain it.</p>}
          {versionConfirmation.action === "archive" && <p className="academic-lifecycle-note">The Inactive version will remain available as a historical reference, including existing student assignments. Restore it before considering future activation.</p>}
          {versionConfirmation.action === "restore" && <p className="academic-lifecycle-note">Restoring this Archived version returns it to Inactive. It does not replace the current Active version. Revalidation is required before future activation.</p>}
          {versionActionError && <p className="academic-lifecycle-error" role="alert">{versionActionError}</p>}
        </div>}
      </Modal>
      <Modal open={Boolean(curriculumHistory)} title={curriculumHistory ? `Version History · ${curriculumHistory.version}` : "Version History"} onClose={() => setCurriculumHistory(null)} className="academic-setup-wide-modal" footer={<Button variant="ghost" onClick={() => setCurriculumHistory(null)}>Close</Button>}>
        {curriculumHistory && <DataTable rowKey="id" rows={(academicCoordinatorData.history || []).filter((entry) => entry.module === "Academic Setup" && (entry.recordId === curriculumHistory.id || entry.record === curriculumHistory.version || entry.previousValue === curriculumHistory.version || entry.newValue === curriculumHistory.version || entry.relatedCurriculum === curriculumHistory.version))} emptyMessage="No recorded demo history for this curriculum version." columns={[
          { key: "dateTime", label: "Date" }, { key: "coordinator", label: "Coordinator" }, { key: "record", label: "Version" }, { key: "action", label: "Action" },
          { key: "previousValue", label: "Previous Status / Value" }, { key: "newValue", label: "New Status / Value" },
          { key: "relatedCurriculum", label: "Related Version", render: (row) => row.relatedCurriculum || "None" },
        ]} />}
      </Modal>
    </>
  );
}
