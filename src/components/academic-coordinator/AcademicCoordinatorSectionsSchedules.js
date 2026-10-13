
"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  DataTable,
  FilterControl,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
  TableActionButton,
  TableActions,
} from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Details, Feedback, Info, Metric, Panel, Tabs } from "@/components/registrar/RegistrarShared";

const VIEWS = [
  { value: "offerings", label: "Subject Offerings" },
  { value: "sections", label: "Sections" },
  { value: "schedules", label: "Class Schedules" },
  { value: "capacity", label: "Capacity & Demand" },
];

export default function AcademicCoordinatorSectionsSchedules() {
  const params = useSearchParams();
  const {
    catalog,
    registrar,
    student,
    academicCoordinatorData,
    createSubjectOffering,
    updateSubjectOffering,
    createAcademicSection,
    updateAcademicSection,
    saveAcademicSchedule,
  } = useDemoData();

  const initialView = VIEWS.some((item) => item.value === params.get("view")) ? params.get("view") : "offerings";
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState("");

  const [offeringForm, setOfferingForm] = useState({ subjectCode: "", academicTerm: student.term.label, program: "BSIT", curriculum: student.profile.curriculum || "BSIT Curriculum 2024", status: "Planned", plannedSections: 1 });
  const [sectionForm, setSectionForm] = useState({ code: "", subject: "", program: "BSIT", academicTerm: student.term.shortLabel, capacity: 40, sectionStatus: "Planned" });
  const [scheduleForm, setScheduleForm] = useState({ sectionCode: "", day: "Monday", start: "08:00", end: "10:00", room: "" });

  const programs = [{ value: "ALL", label: "All Programs" }, ...catalog.programs.map((item) => ({ value: item.code, label: item.code }))];

  const offerings = academicCoordinatorData.offerings.filter((item) =>
    `${item.subjectCode} ${item.subjectName} ${item.curriculum}`.toLowerCase().includes(search.toLowerCase()) &&
    (program === "ALL" || item.program === program) &&
    (status === "ALL" || item.status === status)
  );

  const sections = registrar.sections.filter((item) =>
    `${item.code} ${item.subject} ${item.room} ${item.schedule}`.toLowerCase().includes(search.toLowerCase()) &&
    (program === "ALL" || (item.program || "BSIT") === program) &&
    (status === "ALL" || (item.sectionStatus || (item.confirmed >= item.capacity ? "Full" : "Open")) === status)
  );

  const demandRows = useMemo(() => {
    const requestedBySubject = new Map();

    registrar.enrollments.forEach((entry) => {
      entry.subjects.forEach((subject) => {
        requestedBySubject.set(subject.code, (requestedBySubject.get(subject.code) || 0) + 1);
      });
    });

    return catalog.subjects.map((subject) => {
      const relatedSections = registrar.sections.filter((section) => section.subject === subject.code);
      const totalCapacity = relatedSections.reduce((sum, section) => sum + Number(section.capacity || 0), 0);
      const confirmed = relatedSections.reduce((sum, section) => sum + Number(section.confirmed || 0), 0);
      const remaining = Math.max(0, totalCapacity - confirmed);
      const demand = requestedBySubject.get(subject.code) || 0;
      const capacityStatus = totalCapacity === 0 ? "No Sections" : remaining === 0 ? "Full" : remaining <= 5 ? "Near Capacity" : demand >= totalCapacity ? "High Demand" : "Available";

      return {
        subject: subject.code,
        program: subject.program || "BSIT",
        plannedSections: academicCoordinatorData.offerings.find((item) => item.subjectCode === subject.code)?.plannedSections || relatedSections.length,
        availableSections: relatedSections.length,
        totalCapacity,
        enrollmentDemand: demand,
        confirmedEnrollment: confirmed,
        remainingSlots: remaining,
        capacityStatus,
      };
    });
  }, [academicCoordinatorData.offerings, catalog.subjects, registrar.enrollments, registrar.sections]);

  const full = registrar.sections.filter((item) => item.confirmed >= item.capacity);
  const near = registrar.sections.filter((item) => item.confirmed < item.capacity && item.capacity - item.confirmed <= 5);

  function saveOffering(event) {
    event.preventDefault();
    const result = selected
      ? updateSubjectOffering(selected.id, offeringForm)
        ? { ok: true }
        : { ok: false, message: "Offering could not be updated." }
      : createSubjectOffering(offeringForm);
    setFeedback(result.ok ? `Subject offering ${selected ? "updated" : "created"}.` : result.message);
    if (result.ok) { setDialog(null); setSelected(null); }
  }

  function saveSection(event) {
    event.preventDefault();
    const result = selected
      ? updateAcademicSection(selected.code, sectionForm)
        ? { ok: true }
        : { ok: false, message: "Section could not be updated." }
      : createAcademicSection(sectionForm);
    setFeedback(result.ok ? `Section ${selected ? "updated" : "created"} in shared demo data.` : result.message);
    if (result.ok) { setDialog(null); setSelected(null); }
  }

  function saveSchedule(event) {
    event.preventDefault();
    const result = saveAcademicSchedule(scheduleForm);
    setFeedback(result.ok ? "Schedule passed the implemented checks and was saved." : result.message);
    if (result.ok) setDialog(null);
  }

  return (
    <>
      <PageHeader
        title="Sections & Schedules"
        description="Manage subject offerings, section planning, class schedules, room assignments, capacity, and academic demand."
      />

      <Tabs items={VIEWS} selected={view} onSelect={(next) => { setView(next); setSearch(""); setSelected(null); setFeedback(""); }} label="Section and schedule planning sections" title="Academic Section Planning" subtitle="Schedule feasibility, capacity, and subject offerings are maintained together.">

        {feedback ? <Feedback message={feedback} warning={!feedback.toLowerCase().includes("saved") && !feedback.toLowerCase().includes("created") && !feedback.toLowerCase().includes("updated")} /> : null}

        <div className="toolbar">
          <SearchControl value={search} onChange={setSearch} label="Search academic planning" placeholder={`Search ${view}`} />
          <FilterControl label="Program" value={program} onChange={setProgram} options={programs} />
          {view !== "capacity" ? <FilterControl label="Status" value={status} onChange={setStatus} options={[{ value: "ALL", label: "All Statuses" }, { value: "Planned", label: "Planned" }, { value: "Active", label: "Active" }, { value: "Open", label: "Open" }, { value: "Closed", label: "Closed" }, { value: "Full", label: "Full" }]} /> : null}
        </div>

        {view === "offerings" ? (
          <>
            <div className="action-row" style={{ marginBottom: 12 }}>
              <Button onClick={() => { setSelected(null); setOfferingForm({ subjectCode: "", academicTerm: student.term.label, program: "BSIT", curriculum: student.profile.curriculum || "BSIT Curriculum 2024", status: "Planned", plannedSections: 1 }); setDialog("offering"); }}>Add Subject Offering</Button>
            </div>
            <DataTable
              rowKey="id"
              rows={offerings}
              columns={[
                { key: "academicTerm", label: "Academic Term" },
                { key: "program", label: "Program" },
                { key: "curriculum", label: "Curriculum" },
                { key: "subjectCode", label: "Subject Code" },
                { key: "subjectName", label: "Subject Name" },
                { key: "yearLevel", label: "Year Level" },
                { key: "semester", label: "Semester" },
                { key: "status", label: "Offering Status", render: (row) => <StatusBadge value={row.status.toUpperCase()} label={row.status} /> },
                { key: "plannedSections", label: "Planned Sections" },
                { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton tone="view" onClick={() => setSelected(row)}>View Offering</TableActionButton><TableActionButton tone="edit" onClick={() => { setSelected(row); setOfferingForm({ ...row }); setDialog("offering"); }}>Edit Offering</TableActionButton><TableActionButton tone="schedule" icon="calendar" onClick={() => { setView("sections"); setSearch(row.subjectCode); }}>Plan Sections</TableActionButton></TableActions> },
              ]}
            />
          </>
        ) : null}

        {view === "sections" ? (
          <>
            <div className="action-row" style={{ marginBottom: 12 }}>
              <Button onClick={() => { setSelected(null); setSectionForm({ code: "", subject: "", program: "BSIT", academicTerm: student.term.shortLabel, capacity: 40, sectionStatus: "Planned" }); setDialog("section"); }}>Create Section</Button>
            </div>
            <DataTable
              rowKey="code"
              rows={sections}
              columns={[
                { key: "code", label: "Section Code" },
                { key: "subject", label: "Subject" },
                { key: "program", label: "Program", render: (row) => row.program || "BSIT" },
                { key: "academicTerm", label: "Academic Term", render: (row) => row.academicTerm || student.term.shortLabel },
                { key: "capacity", label: "Capacity" },
                { key: "confirmed", label: "Current Enrollment" },
                { key: "remaining", label: "Remaining Slots", render: (row) => Math.max(0, row.capacity - row.confirmed) },
                { key: "sectionStatus", label: "Section Status", render: (row) => { const value = row.sectionStatus || (row.confirmed >= row.capacity ? "Full" : "Open"); return <StatusBadge value={value.toUpperCase()} label={value} />; } },
                { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton tone="view" onClick={() => setSelected(row)}>View Section</TableActionButton><TableActionButton tone="edit" onClick={() => { setSelected(row); setSectionForm({ code: row.code, subject: row.subject, program: row.program || "BSIT", academicTerm: row.academicTerm || student.term.shortLabel, capacity: row.capacity, sectionStatus: row.sectionStatus || "Open" }); setDialog("section"); }}>Edit Section</TableActionButton><TableActionButton tone="schedule" onClick={() => { setScheduleForm({ sectionCode: row.code, day: row.day || "Monday", start: row.start || "08:00", end: row.end || "10:00", room: row.room === "TBA" ? "" : row.room }); setDialog("schedule"); }}>Open Schedule</TableActionButton></TableActions> },
              ]}
            />
          </>
        ) : null}

        {view === "schedules" ? (
          <>
            <div className="action-row" style={{ marginBottom: 12 }}>
              <Button onClick={() => { setScheduleForm({ sectionCode: registrar.sections[0]?.code || "", day: "Monday", start: "08:00", end: "10:00", room: "" }); setDialog("schedule"); }}>Add Schedule</Button>
            </div>
            <DataTable
              rowKey="code"
              rows={sections}
              columns={[
                { key: "subject", label: "Subject" },
                { key: "code", label: "Section" },
                { key: "day", label: "Day", render: (row) => row.day || "Not assigned" },
                { key: "start", label: "Start Time", render: (row) => row.start || "Not assigned" },
                { key: "end", label: "End Time", render: (row) => row.end || "Not assigned" },
                { key: "room", label: "Room" },
                { key: "academicTerm", label: "Academic Term", render: (row) => row.academicTerm || student.term.shortLabel },
                { key: "conflict", label: "Conflict Status", render: (row) => <StatusBadge value="PASSED" label={row.day && row.start && row.end ? "No Known Conflict" : "Not Checked"} /> },
                { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton tone="view" onClick={() => setSelected(row)}>View Schedule</TableActionButton><TableActionButton tone="edit" onClick={() => { setScheduleForm({ sectionCode: row.code, day: row.day || "Monday", start: row.start || "08:00", end: row.end || "10:00", room: row.room === "TBA" ? "" : row.room }); setDialog("schedule"); }}>Edit Schedule</TableActionButton></TableActions> },
              ]}
            />
          </>
        ) : null}

        {view === "capacity" ? (
          <>
            <div className="stats-grid" style={{ marginBottom: 14 }}>
              <Metric label="Total Sections" value={registrar.sections.length} />
              <Metric label="Available Sections" value={registrar.sections.filter((item) => item.confirmed < item.capacity).length} />
              <Metric label="Near Capacity Sections" value={near.length} />
              <Metric label="Full Sections" value={full.length} />
              <Metric label="High Demand Subjects" value={demandRows.filter((item) => ["High Demand", "Full", "Near Capacity"].includes(item.capacityStatus)).length} />
            </div>
            <DataTable
              rowKey="subject"
              rows={demandRows}
              columns={[
                { key: "subject", label: "Subject" },
                { key: "program", label: "Program" },
                { key: "plannedSections", label: "Planned Sections" },
                { key: "totalCapacity", label: "Total Capacity" },
                { key: "enrollmentDemand", label: "Enrollment Demand" },
                { key: "confirmedEnrollment", label: "Confirmed Enrollment Count" },
                { key: "remainingSlots", label: "Remaining Slots" },
                { key: "capacityStatus", label: "Capacity Status", render: (row) => <StatusBadge value={row.capacityStatus === "Full" ? "FULL" : row.capacityStatus === "Near Capacity" || row.capacityStatus === "High Demand" ? "REQUIRES_REVIEW" : "OPEN"} label={row.capacityStatus} /> },
                { key: "actions", label: "Actions", render: (row) => <TableActions><TableActionButton tone="view" onClick={() => { setView("sections"); setSearch(row.subject); }}>View Sections</TableActionButton></TableActions> },
              ]}
            />
            <div className="action-row" style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => { setView("sections"); setSearch(""); setFeedback("Use Create Section to plan an additional section. High demand never creates a section automatically."); }}>Plan Additional Section</Button>
              <Button variant="secondary" onClick={() => setFeedback("Academic capacity report export is ready for backend or CSV wiring.")}>Export Academic Capacity Report</Button>
            </div>
          </>
        ) : null}
      </Tabs>

      {selected ? (
        <div style={{ marginTop: 16 }}>
          <Panel title={`Details · ${selected.code || selected.subjectCode}`} actions={<Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>}>
            <Details items={Object.entries(selected).filter(([key]) => !["id"].includes(key)).slice(0, 12).map(([key, value]) => [key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), value])} />
          </Panel>
        </div>
      ) : null}

      <Modal open={dialog === "offering"} title={selected ? "Edit Subject Offering" : "Add Subject Offering"} onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="coordinator-offering-form">Save</Button></>}>
        <form id="coordinator-offering-form" className="form-grid" onSubmit={saveOffering}>
          <label className="field">Academic Term<input value={offeringForm.academicTerm} onChange={(event) => setOfferingForm({ ...offeringForm, academicTerm: event.target.value })} /></label>
          <label className="field">Program<select value={offeringForm.program} onChange={(event) => setOfferingForm({ ...offeringForm, program: event.target.value })}>{catalog.programs.map((item) => <option key={item.code}>{item.code}</option>)}</select></label>
          <label className="field">Curriculum<input value={offeringForm.curriculum} onChange={(event) => setOfferingForm({ ...offeringForm, curriculum: event.target.value })} /></label>
          <label className="field">Subject<select required disabled={Boolean(selected)} value={offeringForm.subjectCode} onChange={(event) => setOfferingForm({ ...offeringForm, subjectCode: event.target.value })}><option value="">Select subject</option>{catalog.subjects.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
          <label className="field">Offering Status<select value={offeringForm.status} onChange={(event) => setOfferingForm({ ...offeringForm, status: event.target.value })}><option>Planned</option><option>Active</option><option>Closed</option></select></label>
          <label className="field">Planned Number of Sections<input type="number" min="1" value={offeringForm.plannedSections} onChange={(event) => setOfferingForm({ ...offeringForm, plannedSections: Number(event.target.value) })} /></label>
        </form>
      </Modal>

      <Modal open={dialog === "section"} title={selected ? "Edit Section" : "Create Section"} onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="coordinator-section-form">Save</Button></>}>
        <form id="coordinator-section-form" className="form-grid" onSubmit={saveSection}>
          <label className="field">Section Code<input required disabled={Boolean(selected)} value={sectionForm.code} onChange={(event) => setSectionForm({ ...sectionForm, code: event.target.value })} /></label>
          <label className="field">Subject Offering<select required value={sectionForm.subject} onChange={(event) => setSectionForm({ ...sectionForm, subject: event.target.value })}><option value="">Select subject</option>{catalog.subjects.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label>
          <label className="field">Academic Term<input value={sectionForm.academicTerm} onChange={(event) => setSectionForm({ ...sectionForm, academicTerm: event.target.value })} /></label>
          <label className="field">Capacity<input type="number" min="1" value={sectionForm.capacity} onChange={(event) => setSectionForm({ ...sectionForm, capacity: Number(event.target.value) })} /></label>
          <label className="field">Section Status<select value={sectionForm.sectionStatus} onChange={(event) => setSectionForm({ ...sectionForm, sectionStatus: event.target.value })}><option>Planned</option><option>Open</option><option>Closed</option><option>Full</option></select></label>
        </form>
      </Modal>

      <Modal open={dialog === "schedule"} title="Add or Edit Class Schedule" onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="coordinator-schedule-form">Check Conflict & Save</Button></>}>
        <form id="coordinator-schedule-form" className="form-grid" onSubmit={saveSchedule}>
          <label className="field">Section<select required value={scheduleForm.sectionCode} onChange={(event) => setScheduleForm({ ...scheduleForm, sectionCode: event.target.value })}><option value="">Select section</option>{registrar.sections.map((item) => <option key={item.code}>{item.code}</option>)}</select></label>
          <label className="field">Day<select value={scheduleForm.day} onChange={(event) => setScheduleForm({ ...scheduleForm, day: event.target.value })}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field">Start Time<input type="time" required value={scheduleForm.start} onChange={(event) => setScheduleForm({ ...scheduleForm, start: event.target.value })} /></label>
          <label className="field">End Time<input type="time" required value={scheduleForm.end} onChange={(event) => setScheduleForm({ ...scheduleForm, end: event.target.value })} /></label>
          <label className="field full">Room<input required value={scheduleForm.room} onChange={(event) => setScheduleForm({ ...scheduleForm, room: event.target.value })} placeholder="e.g. CTC 201" /></label>
        </form>
        <p className="notice" style={{ marginTop: 12 }}>The implemented mock validation checks invalid time ranges and room conflicts where structured schedule data is available.</p>
      </Modal>
    </>
  );
}
