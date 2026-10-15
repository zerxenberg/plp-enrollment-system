"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button, DataTable, FilterControl, InternalTabs, Modal, PageHeader,
  SearchControl, StatusBadge, TableActionButton, TableActions,
} from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { getTrackCode } from "@/features/block-planning/block-planning-seed";
import { Details, Feedback, Metric } from "@/components/registrar/RegistrarShared";

const TABS = [{ value: "sections", label: "Sections" }, { value: "schedules", label: "Class Schedule" }];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const YEARS = [1, 2, 3, 4];
const rows = (value) => Array.isArray(value) ? value : [];
const year = (value) => Number(String(value || "").match(/[1-4]/)?.[0]) || 1;
const locked = (item) => Boolean(item?.registrarConfirmed || item?.isConfirmed || ["PUBLISHED", "CONFIRMED", "FINALIZED"].includes(String(item?.status || "").toUpperCase()));
const confirmedRecord = (item) => Boolean(item?.registrarConfirmed || item?.isConfirmed);
const nameOf = (item) => item?.fullName || item?.name || item?.studentNumber || "Unknown";
const options = (items, value, label) => items.map((item) => ({ value: value(item), label: label(item) }));
const timeLabel = (value) => {
  if (!value) return "Not scheduled";
  const match = String(value).match(/^(\d\d?):(\d\d)/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  return String(hour % 12 || 12) + ":" + match[2] + (hour < 12 ? " AM" : " PM");
};
function Field({ label, children }) {
  return <label className="field">{label}{children}</label>;
}
function SelectField({ value, onChange, choices, placeholder, required, disabled }) {
  return <select required={required} disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
    {placeholder && <option value="">{placeholder}</option>}
    {choices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
  </select>;
}
function MeetingSubject({ item, classes, subjects }) {
  const entry = classes.find((row) => row.id === item.subjectClassId);
  const subject = subjects.find((row) => row.code === entry?.subjectCode);
  return <>{entry?.subjectCode || "Unknown"}{subject?.name ? " · " + subject.name : ""}</>;
}

export default function AcademicCoordinatorSectionsSchedules() {
  const query = useSearchParams();
  const {
    blockPlanning, academicCoordinatorData,
    createBlockSection, updateBlockSection, assignBlockStudents, transferBlockStudent,
    saveBlockMeeting, removeBlockMeeting, finalizeBlockSchedule, resetBlockDemoData,
  } = useDemoData();
  const source = blockPlanning || {};
  const terms = rows(source.terms);
  const colleges = rows(source.colleges);
  const programs = rows(source.programs);
  const curricula = rows(source.curricula).length ? source.curricula : rows(academicCoordinatorData?.curricula);
  const subjects = rows(source.subjects);
  const sections = rows(source.blockSections);
  const students = rows(source.students);
  const assignments = rows(source.assignments);
  const classes = rows(source.subjectClasses);
  const meetings = rows(source.classMeetings);
  const professors = rows(source.professors);
  const rooms = rows(source.rooms);

  const [tab, setTab] = useState(query.get("view") === "schedules" ? "schedules" : "sections");
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("ALL");
  const [program, setProgram] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [term, setTerm] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [scheduleId, setScheduleId] = useState("");
  const [dialog, setDialog] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [sectionForm, setSectionForm] = useState({ collegeId: "", programCode: "", major: "", curriculumId: "", yearLevel: 1, termId: "", capacity: 40, letter: "A" });
  const [meetingForm, setMeetingForm] = useState({ subjectClassId: "", professorId: "", day: "Mon", start: "08:00", end: "09:30", roomId: "" });
  const [studentIds, setStudentIds] = useState([]);
  const [rosterSearch, setRosterSearch] = useState("");
  const [professorSearch, setProfessorSearch] = useState("");
  const [transferId, setTransferId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [formError, setFormError] = useState("");

  const section = sections.find((item) => item.id === sectionId);
  const meeting = meetings.find((item) => item.id === meetingId);
  const termLabel = (item) => terms.find((termItem) => termItem.id === item?.termId)?.label || item?.termId || "Unknown term";
  const programRecord = (item) => programs.find((entry) => entry.code === item?.programCode);
  const collegeId = (item) => item?.collegeId || programRecord(item)?.departmentId || programRecord(item)?.collegeId || programRecord(item)?.department;
  const studentOf = (assignment) => students.find((entry) => entry.id === assignment.studentId);
  const rosterOf = (id) => assignments.filter((item) => item.sectionId === id && ["PROPOSED", "CONFIRMED"].includes(String(item.status).toUpperCase()));
  const count = (id) => rosterOf(id).length;
  const countStatus = (id, status) => rosterOf(id).filter((item) => item.status === status).length;
  const occupancyStatus = (item) => count(item.id) >= Number(item.capacity) ? "FULL"
    : count(item.id) >= Number(item.capacity) * 0.9 ? "NEAR_FULL" : "OPEN";
  const curriculumOf = (item) => curricula.find((entry) => entry.id === item?.curriculumId)
    || curricula.find((entry) => (entry.program || entry.programCode) === item?.programCode && (entry.major || "") === (item?.major || ""));
  const curriculumSubjects = (item) => {
    const semester = terms.find((termItem) => termItem.id === item?.termId)?.semester;
    return rows(curriculumOf(item)?.assignments).filter((entry) => year(entry.yearLevel) === year(item?.yearLevel)
      && (!semester || String(entry.semester).toLowerCase() === String(semester).toLowerCase()));
  };
  const filtered = sections.filter((item) => {
    const text = [item.code, item.programCode, item.major, programRecord(item)?.name].join(" ").toLowerCase();
    return (college === "ALL" || String(collegeId(item)) === college)
      && (program === "ALL" || item.programCode === program)
      && (level === "ALL" || year(item.yearLevel) === Number(level))
      && (term === "ALL" || item.termId === term)
      && (status === "ALL" || String(item.status).toUpperCase() === status)
      && text.includes(search.toLowerCase().trim());
  });
  const chosen = sections.find((item) => item.id === scheduleId && filtered.some((entry) => entry.id === item.id)) || filtered[0];
  const chosenClasses = classes.filter((item) => item.sectionId === chosen?.id);
  const meetingClass = classes.find((item) => item.id === meetingForm.subjectClassId);
  const qualifiedProfessors = professors.filter((item) => item.status === "ACTIVE" &&
    item.qualifiedSubjectCodes?.includes(meetingClass?.subjectCode) &&
    item.name.toLowerCase().includes(professorSearch.toLowerCase()));
  const matchingRooms = rooms.filter((item) => item.status === "AVAILABLE" && item.capacity >= Number(chosen?.capacity || 0)
    && item.types?.includes(meetingClass?.roomType));
  const chosenMeetings = meetings.filter((item) => chosenClasses.some((entry) => entry.id === item.subjectClassId))
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || String(a.start).localeCompare(String(b.start)));
  const formCurricula = curricula.filter((item) => (item.program || item.programCode) === sectionForm.programCode);
  const formCurriculum = formCurricula.find((item) => item.id === sectionForm.curriculumId)
    || formCurricula.find((item) => (item.major || "") === sectionForm.major && item.status === "Active")
    || formCurricula.find((item) => (item.major || "") === sectionForm.major);
  const availableCurricula = formCurricula.filter((item) => (item.major || "") === sectionForm.major && item.status === "Active");
  const trackCode = getTrackCode(sectionForm.programCode, sectionForm.major);
  const prefix = trackCode + "-" + year(sectionForm.yearLevel);
  const firstFreeLetter = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((letter) => !sections.some((item) => item.termId === sectionForm.termId && item.code === prefix + letter)) || "";
  const generatedCode = prefix + (sectionForm.letter || firstFreeLetter);
  const nextLetter = (programCode, major, yearLevel, termId) =>
    [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((letter) => !sections.some((item) => item.termId === termId
      && item.code === getTrackCode(programCode, major) + "-" + year(yearLevel) + letter)) || "";
  const roster = section ? rosterOf(section.id) : [];
  const candidates = section ? students.filter((student) => student.programCode === section.programCode
    && (student.major || "") === (section.major || "") && year(student.yearLevel) === year(section.yearLevel)
    && !assignments.some((entry) => entry.studentId === student.id && entry.termId === section.termId
      && ["PROPOSED", "CONFIRMED"].includes(String(entry.status).toUpperCase()))) : [];
  const allowed = candidates.filter((student) => student.status === "ACTIVE"
    && (!student.curriculumId || student.curriculumId === section?.curriculumId) && student.eligible !== false
    && !["INELIGIBLE", "RESTRICTED", "BLOCKED"].includes(String(student.eligibilityStatus).toUpperCase()));
  const destinations = section ? sections.filter((item) => item.id !== section.id && item.termId === section.termId
    && item.programCode === section.programCode && (item.major || "") === (section.major || "")
    && year(item.yearLevel) === year(section.yearLevel) && item.curriculumId === section.curriculumId
    && !confirmedRecord(item) && count(item.id) < Number(item.capacity)) : [];

  function close() { setDialog(""); setFormError(""); }
  function result(response, fallback) {
    const success = Boolean(response?.ok);
    const message = response?.message || (success ? fallback : "Unable to complete this action.");
    setFeedback({ message, warning: !success });
    setFormError(success ? "" : message);
    if (success) close();
    return success;
  }
  function openSection(item = null) {
    const first = item?.programCode || programs[0]?.code || "";
    const initialMajor = item?.major || "";
    const activeCurriculum = curricula.find((entry) => (entry.program || entry.programCode) === first && (entry.major || "") === initialMajor && entry.status === "Active");
    setSectionId(item?.id || "");
    setSectionForm({
      collegeId: item?.collegeId || collegeId({ programCode: first }) || "",
      programCode: first,
      major: initialMajor,
      curriculumId: item?.curriculumId || activeCurriculum?.id || "",
      yearLevel: year(item?.yearLevel),
      termId: item?.termId || terms[0]?.id || "",
      capacity: Number(item?.capacity ?? 40),
      letter: item?.letter || nextLetter(first, item?.major || "", year(item?.yearLevel), item?.termId || terms[0]?.id) || "A",
    });
    setFormError("");
    setDialog("section-form");
  }
  function submitSection(event) {
    event.preventDefault();
    const edit = sections.find((item) => item.id === sectionId);
    const selectedCurriculum = availableCurricula.find((item) => item.id === sectionForm.curriculumId);
    const values = { ...sectionForm, yearLevel: Number(sectionForm.yearLevel), capacity: Number(sectionForm.capacity),
      code: edit?.code || generatedCode, curriculumId: edit?.curriculumId || selectedCurriculum?.id,
      collegeId: edit?.collegeId || collegeId({ programCode: sectionForm.programCode }),
      trackCode: getTrackCode(sectionForm.programCode, sectionForm.major) };
    if (!values.code || !/^[A-Z]$/.test(sectionForm.letter)) { setFormError("Choose a valid block letter from A to Z."); return; }
    result(edit ? updateBlockSection(edit.id, values) : createBlockSection(values), "Block section saved.");
  }
  function showSection(item, mode = "details") {
    setSectionId(item.id);
    setStudentIds([]);
    setRosterSearch("");
    setFormError("");
    setDialog(mode);
  }
  function clearFilters() {
    setSearch("");
    setCollege("ALL");
    setProgram("ALL");
    setLevel("ALL");
    setTerm("ALL");
    setStatus("ALL");
    setScheduleId("");
  }
  function openSchedule(item) {
    clearFilters();
    setScheduleId(item.id);
    setTab("schedules");
    close();
  }
  function editMeeting(item = null, classItem = null) {
    setMeetingId(item?.id || "");
    setProfessorSearch("");
    const related = classes.find((entry) => entry.id === item?.subjectClassId) || classItem || chosenClasses[0];
    setMeetingForm({ subjectClassId: related?.id || "", professorId: related?.professorId || "",
      day: item?.day || "Mon", start: item?.start || "08:00", end: item?.end || "09:30", roomId: item?.roomId || "" });
    setFormError("");
    setDialog("meeting-form");
  }
  function saveMeeting(event) {
    event.preventDefault();
    result(saveBlockMeeting({ ...meetingForm, ...(meetingId ? { id: meetingId, meetingId } : {}) }), "Proposed class meeting saved.");
  }
  function openTransfer(studentId) {
    setTransferId(studentId);
    setDestinationId("");
    setFormError("");
    setDialog("transfer");
  }

  const all = { value: "ALL", label: "All" };
  return (
    <div className="block-planning">
      <PageHeader title="Sections & Schedules" description="Plan block sections, student assignments, subject classes and weekly meeting times across academic terms." />
      <InternalTabs items={TABS} selected={tab} onSelect={(value) => { setTab(value); close(); setFeedback(null); }} label="Sections and class schedule navigation" panelCard>
        <p className="portal-demo-caption block-note"><strong>Demo Planning</strong> · Schedules and assignments remain proposals until approved through the official enrollment workflow.</p>
        {feedback && <Feedback message={feedback.message} warning={feedback.warning} />}
        <div className="toolbar block-filters">
          <SearchControl value={search} onChange={setSearch} label="Search block sections" placeholder="Search block, program or major" />
          <FilterControl label="College" value={college} onChange={(value) => { setCollege(value); setProgram("ALL"); }}
            options={[{ ...all, label: "All Colleges" }, ...options(colleges, (item) => item.id, (item) => item.name || item.code || item.id)]} />
          <FilterControl label="Program" value={program} onChange={setProgram}
            options={[{ ...all, label: "All Programs" }, ...options(programs.filter((item) => college === "ALL" || String(collegeId({ programCode: item.code })) === college), (item) => item.code, (item) => item.code + " · " + item.name)]} />
          <FilterControl label="Year Level" value={level} onChange={setLevel}
            options={[{ ...all, label: "All Year Levels" }, ...options(YEARS, String, (item) => "Year " + item)]} />
          <FilterControl label="Academic Term" value={term} onChange={setTerm}
            options={[{ ...all, label: "All Terms" }, ...options(terms, (item) => item.id, (item) => item.label || item.id)]} />
          <FilterControl label="Status" value={status} onChange={setStatus}
            options={[{ ...all, label: "All Statuses" }, ...options([...new Set(["DRAFT", "PUBLISHED", ...sections.map((item) => item.status).filter(Boolean)])], String, (item) => item === "DRAFT" ? "Draft" : item === "PUBLISHED" ? "Published" : item)]} />
          <Button variant="ghost" onClick={clearFilters}>Clear Filters</Button>
        </div>
        {tab === "sections" ? <>
          <div className="stats-grid block-stats">
            <Metric label="Block Sections" value={filtered.length} />
            <Metric label="Planned Capacity" value={filtered.reduce((sum, item) => sum + Number(item.capacity), 0)} />
            <Metric label="Proposed Assignments" value={filtered.reduce((sum, item) => sum + countStatus(item.id, "PROPOSED"), 0)} />
            <Metric label="Confirmed Assignments" value={filtered.reduce((sum, item) => sum + countStatus(item.id, "CONFIRMED"), 0)} />
            <Metric label="Available Places" value={filtered.reduce((sum, item) => sum + Math.max(0, Number(item.capacity) - count(item.id)), 0)} />
            <Metric label="Full Sections" value={filtered.filter((item) => occupancyStatus(item) === "FULL").length} />
            <Metric label="Needs Attention" value={filtered.filter((item) => occupancyStatus(item) === "NEAR_FULL").length} hint="At least 90% occupied" />
          </div>
          <div className="section-header block-heading"><h2>Block Section Management</h2>
            <div className="action-row"><Button variant="secondary" onClick={() => setDialog("reset")}>Reset Demo Planning</Button>
              <Button onClick={() => openSection()}>Create Block Section</Button></div></div>
          <DataTable rowKey="id" rows={filtered} emptyMessage="No block sections match your filters." columns={[
            { key: "code", label: "Block Code" },
            { key: "college", label: "College", render: (item) => colleges.find((record) => record.id === collegeId(item))?.name || collegeId(item) || "Unknown" },
            { key: "programCode", label: "Program & Track", render: (item) => item.programCode + (item.major ? " · " + item.major : "") },
            { key: "yearLevel", label: "Year", render: (item) => "Year " + year(item.yearLevel) },
            { key: "termId", label: "Academic Term", render: termLabel },
            { key: "curriculum", label: "Curriculum", render: (item) => curriculumOf(item)?.version || curriculumOf(item)?.name || "Not assigned" },
            { key: "capacity", label: "Capacity" },
            { key: "assigned", label: "Proposed", render: (item) => countStatus(item.id, "PROPOSED") },
            { key: "confirmed", label: "Confirmed", render: (item) => countStatus(item.id, "CONFIRMED") },
            { key: "remaining", label: "Available", render: (item) => Math.max(0, Number(item.capacity) - count(item.id)) },
            { key: "occupancy", label: "Capacity Status", render: (item) => <StatusBadge value={occupancyStatus(item) === "FULL" ? "FULL" : occupancyStatus(item) === "NEAR_FULL" ? "NEAR_CAPACITY" : "OPEN"}
              label={occupancyStatus(item) === "FULL" ? "Full" : occupancyStatus(item) === "NEAR_FULL" ? "Near Capacity" : "Available"} /> },
            { key: "status", label: "Status", render: (item) => <StatusBadge value={item.status} label={item.status === "DRAFT" ? "Draft" : item.status === "PUBLISHED" ? "Published" : item.status} /> },
            { key: "actions", label: "Actions", render: (item) => <TableActions>
              <TableActionButton tone="view" onClick={() => showSection(item)}>Details</TableActionButton>
              <TableActionButton tone="edit" disabled={locked(item)} onClick={() => openSection(item)}>Edit</TableActionButton>
              <TableActionButton tone="review" disabled={confirmedRecord(item)} onClick={() => showSection(item, "roster")}>Roster</TableActionButton>
              <TableActionButton tone="review" disabled={confirmedRecord(item) || countStatus(item.id, "PROPOSED") === 0}
                onClick={() => { setSectionId(item.id); openTransfer(""); }}>Transfer</TableActionButton>
              <TableActionButton tone="schedule" onClick={() => openSchedule(item)}>Schedule</TableActionButton>
            </TableActions> },
          ]} />
        </> : <>

          <div className="section-header block-heading">
            <div><h2>Class Schedule Planning</h2><p>Assign professors, rooms and multiple weekly meetings for each subject class.</p></div>
            <div className="action-row">
              <Button variant="secondary" disabled={!chosen} onClick={() => showSection(chosen, "timetable")}>View Timetable</Button>
              <Button disabled={!chosen || locked(chosen) || !chosenClasses.length} onClick={() => editMeeting()}>Add Meeting</Button>
            </div>
          </div>
          <div className="block-schedule-select">
            <FilterControl label="Block Section" value={chosen?.id || ""} onChange={setScheduleId}
              options={options(filtered, (item) => item.id, (item) => item.code + " · " + termLabel(item))} />
            {chosen && <div className="block-selected-description">
              <strong>{chosen.code}</strong>
              <span>{chosen.programCode + (chosen.major ? " · " + chosen.major : "")} · Year {year(chosen.yearLevel)} · {termLabel(chosen)}</span>
              <StatusBadge value={chosen.status} label={chosen.status === "PUBLISHED" ? "Published" : "Draft"} />
            </div>}
          </div>
          {chosen ? <>
            <div className="stats-grid block-stats">
              <Metric label="Subject Classes" value={chosenClasses.length} />
              <Metric label="Weekly Meetings" value={chosenMeetings.length} />
              <Metric label="Subjects Scheduled" value={new Set(chosenMeetings.map((item) => classes.find((entry) => entry.id === item.subjectClassId)?.subjectCode)).size} />
              <Metric label="Plan Status" value={locked(chosen) ? "Published" : "Draft"} />
            </div>
            <h3 className="block-title">Subject Classes</h3>
            <DataTable rowKey="id" rows={chosenClasses} emptyMessage="No subject classes are assigned to this block." columns={[
              { key: "subjectCode", label: "Subject", render: (item) => item.subjectCode + " · " + (subjects.find((entry) => entry.code === item.subjectCode)?.name || "Subject") },
              { key: "professorId", label: "Professor", render: (item) => nameOf(professors.find((entry) => entry.id === item.professorId)) },
              { key: "meetingCount", label: "Weekly Meetings", render: (item) => chosenMeetings.filter((entry) => entry.subjectClassId === item.id).length },
              { key: "actions", label: "Actions", render: (item) => <TableActions><TableActionButton tone="schedule" disabled={locked(chosen)} onClick={() => editMeeting(null, item)}>Add Meeting</TableActionButton></TableActions> },
            ]} />
            <h3 className="block-title">Weekly Meeting Plan</h3>
            <DataTable rowKey="id" rows={chosenMeetings} emptyMessage="No meeting times have been planned." columns={[
              { key: "subject", label: "Subject", render: (item) => <MeetingSubject item={item} classes={classes} subjects={subjects} /> },
              { key: "day", label: "Day", render: (item) => DAY_NAMES[item.day] || item.day },
              { key: "start", label: "Start", render: (item) => timeLabel(item.start) },
              { key: "end", label: "End", render: (item) => timeLabel(item.end) },
              { key: "roomId", label: "Room", render: (item) => rooms.find((entry) => entry.id === item.roomId)?.name || "Unassigned" },
              { key: "professor", label: "Professor", render: (item) => nameOf(professors.find((entry) => entry.id === classes.find((cls) => cls.id === item.subjectClassId)?.professorId)) },
              { key: "record", label: "Record", render: () => <StatusBadge value="PENDING" label="Proposed" /> },
              { key: "actions", label: "Actions", render: (item) => <TableActions>
                <TableActionButton tone="view" onClick={() => { setMeetingId(item.id); setDialog("meeting-details"); }}>View</TableActionButton>
                <TableActionButton tone="edit" disabled={locked(chosen)} onClick={() => editMeeting(item)}>Edit</TableActionButton>
                <TableActionButton tone="danger" disabled={locked(chosen)} onClick={() => { setMeetingId(item.id); setDialog("remove"); }}>Delete</TableActionButton>
              </TableActions> },
            ]} />
            <div className="block-footer"><p>Finalized class schedules remain planning records. Official student enrollment requires Registrar confirmation.</p>
              <Button variant="secondary" disabled={locked(chosen) || !chosenMeetings.length} onClick={() => showSection(chosen, "finalize")}>Finalize Block Schedule</Button></div>
          </> : <div className="block-empty">Select a block section to begin schedule planning.</div>}
        </>}
      </InternalTabs>

      <Modal open={dialog === "section-form"} title={sectionId ? "Edit Block Section" : "Create Block Section"} className="academic-setup-wide-modal" onClose={close}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit" form="block-section-form">Save Block</Button></>}>
        <form id="block-section-form" className="form-grid" onSubmit={submitSection}>
          <Field label="Academic Term"><SelectField required disabled={Boolean(sectionId)} value={sectionForm.termId} placeholder="Select term"
            choices={options(terms, (item) => item.id, (item) => item.label || item.id)}
            onChange={(value) => setSectionForm((current) => ({ ...current, termId: value,
              letter: nextLetter(current.programCode, current.major, current.yearLevel, value) }))} /></Field>
          <Field label="College"><SelectField required disabled={Boolean(sectionId)} value={sectionForm.collegeId} placeholder="Select college"
            choices={options(colleges, (item) => item.id, (item) => item.name || item.id)}
            onChange={(value) => setSectionForm((current) => {
              const firstProgram = programs.find((item) => item.departmentId === value || item.collegeId === value);
              const code = firstProgram?.code || "";
              const initialCurriculum = curricula.find((item) => (item.program || item.programCode) === code && !item.major && item.status === "Active");
              return { ...current, collegeId: value, programCode: code, major: "",
                curriculumId: initialCurriculum?.id || "",
                letter: nextLetter(code, "", current.yearLevel, current.termId) };
            })} /></Field>
          <Field label="Program"><SelectField required disabled={Boolean(sectionId)} value={sectionForm.programCode} placeholder="Select program"
            choices={options(programs.filter((item) => !sectionForm.collegeId || item.departmentId === sectionForm.collegeId || item.collegeId === sectionForm.collegeId),
              (item) => item.code, (item) => item.code + " · " + item.name)}
            onChange={(value) => setSectionForm((current) => {
              const active = curricula.find((item) => (item.program || item.programCode) === value && !item.major && item.status === "Active");
              return { ...current, programCode: value, major: "", curriculumId: active?.id || "",
                letter: nextLetter(value, "", current.yearLevel, current.termId) };
            })} /></Field>
          {formCurricula.some((item) => item.major) && <Field label="Major or Track"><SelectField required value={sectionForm.major} disabled={Boolean(sectionId)} placeholder="Select major"
            choices={options([...new Set(formCurricula.map((item) => item.major || ""))].filter(Boolean), String, String)}
            onChange={(value) => setSectionForm((current) => {
              const active = formCurricula.find((item) => item.major === value && item.status === "Active");
              return { ...current, major: value, curriculumId: active?.id || "",
                letter: nextLetter(current.programCode, value, current.yearLevel, current.termId) };
            })} /></Field>}
          <Field label="Active Curriculum Version"><SelectField required disabled={Boolean(sectionId)} value={sectionForm.curriculumId} placeholder="Select active curriculum"
            choices={options(availableCurricula, (item) => item.id, (item) => item.version || item.id)}
            onChange={(value) => setSectionForm((current) => ({ ...current, curriculumId: value }))} /></Field>
          <Field label="Year Level"><SelectField disabled={Boolean(sectionId)} value={String(sectionForm.yearLevel)}
            choices={options(YEARS, String, (item) => "Year " + item)}
            onChange={(value) => setSectionForm((current) => ({ ...current, yearLevel: Number(value),
              letter: nextLetter(current.programCode, current.major, Number(value), current.termId) }))} /></Field>
          <Field label="Student Capacity"><input type="number" min="1" max="500" required value={sectionForm.capacity}
            onChange={(event) => setSectionForm((current) => ({ ...current, capacity: event.target.value }))} /></Field>
          <Field label="Section Letter"><SelectField required disabled={Boolean(sectionId)} value={sectionForm.letter} placeholder="Choose letter"
            choices={options([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"], String, String)}
            onChange={(value) => setSectionForm((current) => ({ ...current, letter: value }))} /></Field>
          <Field label="Generated Block Code"><input readOnly value={section?.code || generatedCode} aria-describedby="block-code-help" /></Field>
          <p id="block-code-help" className="academic-helper block-form-note">Codes follow PROGRAM-YEARLETTER. Section letters must be unique for their track, year and term.</p>
          <div className="block-curriculum-preview block-form-note">
            <h3>Subjects in the selected curriculum</h3>
            <p className="academic-helper">{sectionForm.curriculumId ? "Subjects for the selected year and semester" : "Select an active curriculum to preview its subjects."}</p>
            <ul>
              {rows(formCurriculum?.assignments).filter((item) => year(item.yearLevel) === year(sectionForm.yearLevel)
                && item.semester === terms.find((entry) => entry.id === sectionForm.termId)?.semester)
                .map((item) => <li key={item.subjectCode}>{item.subjectCode} · {subjects.find((entry) => entry.code === item.subjectCode)?.name || "Subject"}</li>)}
            </ul>
          </div>
          {formError && <p className="block-error" role="alert">{formError}</p>}
        </form>
      </Modal>

      <Modal open={dialog === "details" && Boolean(section)} title={section ? "Block Details · " + section.code : "Block Details"}
        className="academic-setup-wide-modal" onClose={close} footer={<Button variant="ghost" onClick={close}>Close</Button>}>
        {section && <>
          <Details items={[
            ["College", colleges.find((item) => item.id === collegeId(section))?.name || collegeId(section) || "Unknown"],
            ["Program", section.programCode + (section.major ? " · " + section.major : "")],
            ["Academic Term", termLabel(section)],
            ["Year Level", "Year " + year(section.yearLevel)],
            ["Curriculum", curriculumOf(section)?.version || "Not assigned"],
            ["Status", section.status],
            ["Capacity", section.capacity],
            ["Proposed Assignments", countStatus(section.id, "PROPOSED")],
            ["Confirmed Assignments", countStatus(section.id, "CONFIRMED")],
            ["Available Places", Math.max(0, Number(section.capacity) - count(section.id))],
          ]} />
          <h3 className="block-title">Curriculum Subjects</h3>
          <DataTable rowKey="subjectCode" rows={curriculumSubjects(section)} emptyMessage="No subject allocations match the current curriculum and term."
            columns={[
              { key: "subjectCode", label: "Subject Code" },
              { key: "subjectName", label: "Subject Name", render: (item) => subjects.find((row) => row.code === item.subjectCode)?.name || "Subject" },
              { key: "units", label: "Units", render: (item) => subjects.find((row) => row.code === item.subjectCode)?.units ?? "Not specified" },
            ]} />
          <h3 className="block-title">Proposed Student Roster</h3>
          <DataTable rowKey="id" rows={roster} emptyMessage="No students have been proposed for this section."
            columns={[
              { key: "studentNumber", label: "Student Number", render: (item) => studentOf(item)?.studentNumber },
              { key: "fullName", label: "Student", render: (item) => nameOf(studentOf(item)) },
              { key: "classification", label: "Classification", render: (item) => studentOf(item)?.classification || "Not evaluated" },
              { key: "progression", label: "Progression", render: (item) => studentOf(item)?.progressionStatus || studentOf(item)?.progression || "Refer to Academic Review" },
              { key: "status", label: "Assignment", render: (item) => <StatusBadge value={item.status} label={item.status || "Proposed"} /> },
            ]} />
          <div className="action-row block-dialog-actions">
            <Button variant="secondary" disabled={confirmedRecord(section)} onClick={() => showSection(section, "roster")}>Manage Roster</Button>
            <Button variant="secondary" onClick={() => openSchedule(section)}>Open Class Schedule</Button>
          </div>
        </>}
      </Modal>

      <Modal open={dialog === "roster" && Boolean(section)} title={section ? "Proposed Roster · " + section.code : "Proposed Roster"}
        className="academic-setup-wide-modal" onClose={close}
        footer={<><Button variant="ghost" onClick={close}>Close</Button><Button disabled={!studentIds.length || confirmedRecord(section)}
          onClick={() => result(assignBlockStudents({ sectionId, studentIds }), "Proposed assignments saved.")}>Assign Selected ({studentIds.length})</Button></>}>
        {section && <>
          <p className="academic-demo-note">Remaining capacity: {Math.max(0, Number(section.capacity) - count(section.id))}. Only proposed assignments are edited here. Eligibility is checked again when assigning.</p>
          <h3 className="block-title">Current Roster ({roster.length})</h3>
          <DataTable rowKey="id" rows={roster} emptyMessage="No proposed students in this block."
            columns={[
              { key: "number", label: "Student Number", render: (item) => studentOf(item)?.studentNumber },
              { key: "student", label: "Student", render: (item) => nameOf(studentOf(item)) },
              { key: "classification", label: "Classification", render: (item) => studentOf(item)?.classification || "Unknown" },
              { key: "actions", label: "Actions", render: (item) => <TableActions><TableActionButton tone="edit" disabled={item.status === "CONFIRMED" || confirmedRecord(section)} onClick={() => openTransfer(item.studentId)}>Transfer</TableActionButton></TableActions> },
            ]} />
          <div className="block-student-heading">
            <h3>Eligible Student Selection ({allowed.length})</h3>
            <div className="action-row">
              <Button variant="secondary" disabled={!studentIds.length} onClick={() => setStudentIds([])}>Deselect All</Button>
              <Button variant="secondary" disabled={!allowed.length || confirmedRecord(section)}
                onClick={() => setStudentIds(allowed.filter((item) => (nameOf(item) + " " + item.studentNumber).toLowerCase().includes(rosterSearch.toLowerCase()))
                  .slice(0, Math.max(0, Number(section.capacity) - count(section.id))).map((item) => item.id))}>Select Available</Button>
            </div>
          </div>
          <SearchControl value={rosterSearch} onChange={setRosterSearch} label="Search students for block assignment" placeholder="Search student name or number" />
          <div className="block-student-list">
            {candidates.length ? candidates.filter((item) =>
              (nameOf(item) + " " + item.studentNumber).toLowerCase().includes(rosterSearch.toLowerCase())).map((item) => {
              const eligible = allowed.some((entry) => entry.id === item.id);
              return <label className="block-student-choice" key={item.id}>
                <input type="checkbox" disabled={!eligible || confirmedRecord(section)} checked={studentIds.includes(item.id)}
                  onChange={(event) => setStudentIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
                <span><strong>{nameOf(item)}</strong><small>{item.studentNumber} · {item.classification || "Unclassified"}
                  {" · " + (item.progression || "Progression pending")}
                  {eligible ? "" : " · " + (item.eligibilityReason || (item.status !== "ACTIVE" ? "Inactive student record" : "Review curriculum eligibility"))}</small></span>
              </label>;
            }) : <p className="block-empty">No matching students are currently available for this block.</p>}
          </div>
          {formError && <p className="block-error" role="alert">{formError}</p>}
        </>}
      </Modal>

      <Modal open={dialog === "transfer" && Boolean(section)} title="Transfer Proposed Student" onClose={close}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit" form="block-transfer-form">Transfer</Button></>}>
        <form id="block-transfer-form" className="form-grid" onSubmit={(event) => {
          event.preventDefault();
          result(transferBlockStudent({ studentId: transferId, fromSectionId: sectionId, toSectionId: destinationId }), "Proposed transfer saved.");
        }}>
          <Field label="Student"><SelectField required placeholder="Select student" value={transferId} onChange={setTransferId}
            choices={options(roster, (item) => item.studentId, (item) => nameOf(studentOf(item)) + " · " + studentOf(item)?.studentNumber)} /></Field>
          <Field label="Destination Block"><SelectField required placeholder="Select destination" value={destinationId} onChange={setDestinationId}
            choices={options(destinations, (item) => item.id, (item) => item.code + " · " + (Number(item.capacity) - count(item.id)) + " spaces")} /></Field>
          <p className="academic-helper block-form-note">Available destinations share the same program, track, year and academic term, with space for the student.</p>
          {formError && <p className="block-error" role="alert">{formError}</p>}
        </form>
      </Modal>

      <Modal open={dialog === "meeting-form"} title={meetingId ? "Edit Class Meeting" : "Add Class Meeting"} onClose={close}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit" form="block-meeting-form">Check Conflicts & Save</Button></>}>
        <form id="block-meeting-form" className="form-grid" onSubmit={saveMeeting}>
          <Field label="Subject Class"><SelectField required value={meetingForm.subjectClassId} onChange={(value) => setMeetingForm((current) => ({ ...current, subjectClassId: value, professorId: classes.find((entry) => entry.id === value)?.professorId || "" }))}
            choices={options(chosenClasses, (item) => item.id, (item) => item.subjectCode + " · " + (subjects.find((entry) => entry.code === item.subjectCode)?.name || "Subject"))} /></Field>
          <div className="field"><label htmlFor="block-professor-filter">Qualified Professor</label>
            <input id="block-professor-filter" type="search" aria-label="Search qualified professors" placeholder="Filter qualified professors"
              value={professorSearch} onChange={(event) => setProfessorSearch(event.target.value)} />
            <SelectField required value={meetingForm.professorId} placeholder="Choose professor" onChange={(value) => setMeetingForm((current) => ({ ...current, professorId: value }))}
              choices={options(qualifiedProfessors, (item) => item.id, (item) => item.name)} />
          </div>
          <Field label="Room"><SelectField required value={meetingForm.roomId} placeholder="Choose room" onChange={(value) => setMeetingForm((current) => ({ ...current, roomId: value }))}
            choices={options(matchingRooms, (item) => item.id, (item) => item.name + " · " + item.capacity + " seats")} /></Field>
          <Field label="Day"><SelectField value={meetingForm.day} onChange={(value) => setMeetingForm((current) => ({ ...current, day: value }))}
            choices={options(DAYS, String, (item) => DAY_NAMES[item])} /></Field>
          <Field label="Start"><input type="time" required value={meetingForm.start} onChange={(event) => setMeetingForm((current) => ({ ...current, start: event.target.value }))} /></Field>
          <Field label="End"><input type="time" required value={meetingForm.end} onChange={(event) => setMeetingForm((current) => ({ ...current, end: event.target.value }))} /></Field>
          <p className="academic-helper block-form-note">The demo data provider validates room, instructor and overlapping class meetings when saved.</p>
          {formError && <p className="block-error" role="alert">{formError}</p>}
        </form>
      </Modal>

      <Modal open={dialog === "meeting-details" && Boolean(meeting)} title="Meeting Details" onClose={close}
        footer={<Button variant="ghost" onClick={close}>Close</Button>}>
        {meeting && <Details items={[
          ["Subject", classes.find((entry) => entry.id === meeting.subjectClassId)?.subjectCode],
          ["Day", meeting.day],
          ["Time", timeLabel(meeting.start) + " to " + timeLabel(meeting.end)],
          ["Professor", nameOf(professors.find((entry) => entry.id === classes.find((cls) => cls.id === meeting.subjectClassId)?.professorId))],
          ["Room", rooms.find((entry) => entry.id === meeting.roomId)?.name || "Unassigned"],
          ["Record", "Proposed planning record"],
        ]} />}
      </Modal>
      <Modal open={dialog === "remove" && Boolean(meeting)} title="Delete Class Meeting" onClose={close}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger" onClick={() => result(removeBlockMeeting(meeting.id), "Meeting removed.")}>Delete Meeting</Button></>}>
        <p>Delete this proposed {meeting?.day} meeting from {timeLabel(meeting?.start)} to {timeLabel(meeting?.end)}?</p>
        {formError && <p className="block-error" role="alert">{formError}</p>}
      </Modal>
      <Modal open={dialog === "finalize" && Boolean(section)} title="Finalize Block Schedule" onClose={close}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button disabled={locked(section)} onClick={() => result(finalizeBlockSchedule(section.id), "Block schedule finalized.")}>Finalize Schedule</Button></>}>
        <p>Finalize the proposed class schedule for <strong>{section?.code}</strong>? Conflict checks run before publishing. Registrar confirmed records remain protected.</p>
        {formError && <p className="block-error" role="alert">{formError}</p>}
      </Modal>
      <Modal open={dialog === "reset"} title="Reset Block Planning Demo Data" onClose={close}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger"
          onClick={() => {
            if (result(resetBlockDemoData(), "Demo planning restored.")) {
              setScheduleId(""); setSectionId(""); setStudentIds([]); setMeetingId("");
            }
          }}>Reset Demo Planning</Button></>}>
        <p>Restore the original sample block sections, student proposals, subject classes and meeting plans? Current edits to this local demo planning data will be replaced. Official Registrar enrollment and other demo records are unaffected.</p>
        {formError && <p className="block-error" role="alert">{formError}</p>}
      </Modal>
      <Modal open={dialog === "timetable" && Boolean(section)} title={section ? "Weekly Timetable · " + section.code : "Weekly Timetable"}
        className="academic-setup-wide-modal" onClose={close} footer={<Button variant="ghost" onClick={close}>Close</Button>}>
        {section && <DataTable rowKey="id"
          rows={meetings.filter((item) => classes.some((entry) => entry.id === item.subjectClassId && entry.sectionId === section.id))
            .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || String(a.start).localeCompare(String(b.start)))}
          emptyMessage="No weekly meetings have been planned for this block."
          columns={[
            { key: "day", label: "Day" },
            { key: "time", label: "Time", render: (item) => timeLabel(item.start) + " to " + timeLabel(item.end) },
            { key: "subject", label: "Subject", render: (item) => <MeetingSubject item={item} classes={classes} subjects={subjects} /> },
            { key: "room", label: "Room", render: (item) => rooms.find((entry) => entry.id === item.roomId)?.name || "Unassigned" },
            { key: "professor", label: "Professor", render: (item) => nameOf(professors.find((entry) => entry.id === classes.find((cls) => cls.id === item.subjectClassId)?.professorId)) },
          ]} />}
      </Modal>
    </div>
  );
}
