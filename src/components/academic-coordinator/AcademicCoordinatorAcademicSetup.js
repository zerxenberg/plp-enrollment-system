
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  DataTable,
  FilterControl,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Details, Feedback, Info, Panel, Tabs } from "@/components/registrar/RegistrarShared";

const VIEWS = [
  { value: "programs", label: "Programs" },
  { value: "curriculum", label: "Curriculum" },
  { value: "subjects", label: "Subjects" },
  { value: "prerequisites", label: "Prerequisites" },
  { value: "term", label: "Academic Term Reference" },
];

export default function AcademicCoordinatorAcademicSetup() {
  const params = useSearchParams();
  const {
    catalog,
    student,
    academicCoordinatorData,
    createAcademicProgram,
    updateAcademicProgram,
    createCurriculumVersion,
    updateCurriculumVersion,
    duplicateCurriculumVersion,
    createAcademicSubject,
    updateAcademicSubject,
    savePrerequisiteRule,
    removePrerequisiteRule,
  } = useDemoData();

  const initialView = VIEWS.some((item) => item.value === params.get("view")) ? params.get("view") : "programs";
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState("");

  const [programForm, setProgramForm] = useState({ code: "", name: "", department: "", status: "Active" });
  const [curriculumForm, setCurriculumForm] = useState({ program: "BSIT", version: "", effectiveAcademicYear: "2026 to 2027", status: "Draft" });
  const [subjectForm, setSubjectForm] = useState({ code: "", name: "", units: 3, yearLevel: "1st Year", semester: "First Semester", program: "BSIT", curriculum: "BSIT Curriculum 2024", status: "Active", description: "" });
  const [prerequisiteForm, setPrerequisiteForm] = useState({ targetCode: "", prerequisiteCode: "" });

  useEffect(() => {
    const next = params.get("view");
    if (VIEWS.some((item) => item.value === next)) setView(next);
  }, [params]);

  const programOptions = [{ value: "ALL", label: "All Programs" }, ...catalog.programs.map((item) => ({ value: item.code, label: item.code }))];

  const programs = useMemo(
    () => catalog.programs.filter((item) =>
      `${item.code} ${item.name} ${item.department}`.toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === "ALL" || item.status === statusFilter)
    ),
    [catalog.programs, search, statusFilter],
  );

  const curricula = academicCoordinatorData.curricula.filter((item) =>
    `${item.version} ${item.program}`.toLowerCase().includes(search.toLowerCase()) &&
    (programFilter === "ALL" || item.program === programFilter) &&
    (statusFilter === "ALL" || item.status === statusFilter)
  );

  const subjects = catalog.subjects.filter((item) =>
    `${item.code} ${item.name}`.toLowerCase().includes(search.toLowerCase()) &&
    (programFilter === "ALL" || (item.program || "BSIT") === programFilter) &&
    (statusFilter === "ALL" || (item.status || "Active") === statusFilter)
  );

  const prerequisiteRows = catalog.subjects.flatMap((subject) =>
    (subject.prerequisites || []).map((code) => ({
      id: `${subject.code}:${code}`,
      subject: subject.code,
      requiredPrerequisite: code,
      curriculum: subject.curriculum || "BSIT Curriculum 2024",
      effectiveTerm: student.term.shortLabel,
      status: "Active",
    })),
  ).filter((item) =>
    `${item.subject} ${item.requiredPrerequisite} ${item.curriculum}`.toLowerCase().includes(search.toLowerCase())
  );

  function saveProgram(event) {
    event.preventDefault();
    const result = selected
      ? updateAcademicProgram(selected.code, programForm)
        ? { ok: true }
        : { ok: false, message: "Program could not be updated." }
      : createAcademicProgram(programForm);

    setFeedback(result.ok ? `Program ${selected ? "updated" : "created"} in the shared demo data.` : result.message);
    if (result.ok) { setDialog(null); setSelected(null); }
  }

  function saveCurriculum(event) {
    event.preventDefault();
    const result = selected
      ? updateCurriculumVersion(selected.id, curriculumForm)
        ? { ok: true }
        : { ok: false, message: "Curriculum could not be updated." }
      : createCurriculumVersion(curriculumForm);

    setFeedback(result.ok ? `Curriculum version ${selected ? "updated" : "created"} in the demo.` : result.message);
    if (result.ok) { setDialog(null); setSelected(null); }
  }

  function saveSubject(event) {
    event.preventDefault();
    const result = selected
      ? updateAcademicSubject(selected.code, subjectForm)
        ? { ok: true }
        : { ok: false, message: "Subject could not be updated." }
      : createAcademicSubject(subjectForm);

    setFeedback(result.ok ? `Subject ${selected ? "updated" : "created"} in the shared demo catalog.` : result.message);
    if (result.ok) { setDialog(null); setSelected(null); }
  }

  function savePrerequisite(event) {
    event.preventDefault();
    const result = savePrerequisiteRule(prerequisiteForm);
    setFeedback(result.ok ? "Prerequisite rule validated and saved." : result.message);
    if (result.ok) setDialog(null);
  }

  return (
    <>
      <PageHeader
        title="Academic Setup"
        description="Maintain programs, curriculum versions, subjects, prerequisite rules, and review the current academic term reference."
      />

      <Panel title="Academic Configuration" subtitle="These structures form the academic foundation used by enrollment validation.">
        <Tabs items={VIEWS} selected={view} onSelect={(next) => { setView(next); setSearch(""); setSelected(null); setFeedback(""); }} />

        {feedback ? <Feedback message={feedback} warning={feedback.toLowerCase().includes("could not") || feedback.toLowerCase().includes("required") || feedback.toLowerCase().includes("already")} /> : null}

        {view !== "term" ? (
          <div className="toolbar">
            <SearchControl value={search} onChange={setSearch} label="Search academic records" placeholder={`Search ${view}`} />
            {["curriculum", "subjects"].includes(view) ? <FilterControl label="Program" value={programFilter} onChange={setProgramFilter} options={programOptions} /> : null}
            <FilterControl label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "ALL", label: "All Statuses" }, { value: "Active", label: "Active" }, { value: "Draft", label: "Draft" }, { value: "Inactive", label: "Inactive" }]} />
          </div>
        ) : null}

        {view === "programs" ? (
          <>
            <div className="action-row" style={{ marginBottom: 12 }}>
              <Button onClick={() => { setSelected(null); setProgramForm({ code: "", name: "", department: "", status: "Active" }); setDialog("program"); }}>Add Program</Button>
            </div>
            <DataTable
              rowKey="code"
              rows={programs}
              columns={[
                { key: "code", label: "Program Code" },
                { key: "name", label: "Program Name" },
                { key: "department", label: "Department / College" },
                { key: "status", label: "Program Status", render: (row) => <StatusBadge value={row.status.toUpperCase()} label={row.status} /> },
                { key: "curricula", label: "Related Curriculum Versions", render: (row) => academicCoordinatorData.curricula.filter((item) => item.program === row.code).length },
                { key: "actions", label: "Actions", render: (row) => <div className="cell-actions"><button className="table-action" type="button" onClick={() => setSelected(row)}>View Program</button><button className="table-action" type="button" onClick={() => { setSelected(row); setProgramForm({ code: row.code, name: row.name, department: row.department, status: row.status }); setDialog("program"); }}>Edit</button></div> },
              ]}
            />
          </>
        ) : null}

        {view === "curriculum" ? (
          <>
            <div className="action-row" style={{ marginBottom: 12 }}>
              <Button onClick={() => { setSelected(null); setCurriculumForm({ program: "BSIT", version: "", effectiveAcademicYear: "2026 to 2027", status: "Draft" }); setDialog("curriculum"); }}>Create Curriculum Version</Button>
            </div>
            <DataTable
              rowKey="id"
              rows={curricula}
              columns={[
                { key: "version", label: "Curriculum Version" },
                { key: "program", label: "Program" },
                { key: "effectiveAcademicYear", label: "Effective Academic Year" },
                { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status.toUpperCase()} label={row.status} /> },
                { key: "assignedSubjects", label: "Assigned Subjects" },
                { key: "actions", label: "Actions", render: (row) => <div className="cell-actions"><button className="table-action" type="button" onClick={() => setSelected(row)}>View Curriculum</button><button className="table-action" type="button" onClick={() => { setSelected(row); setCurriculumForm({ program: row.program, version: row.version, effectiveAcademicYear: row.effectiveAcademicYear, status: row.status }); setDialog("curriculum"); }}>Edit</button><button className="table-action" type="button" onClick={() => { const result = duplicateCurriculumVersion(row.id); setFeedback(result.ok ? "Curriculum duplicated as a new Draft version." : result.message); }}>Duplicate as New Version</button></div> },
              ]}
            />
          </>
        ) : null}

        {view === "subjects" ? (
          <>
            <div className="action-row" style={{ marginBottom: 12 }}>
              <Button onClick={() => { setSelected(null); setSubjectForm({ code: "", name: "", units: 3, yearLevel: "1st Year", semester: "First Semester", program: "BSIT", curriculum: "BSIT Curriculum 2024", status: "Active", description: "" }); setDialog("subject"); }}>Add Subject</Button>
            </div>
            <DataTable
              rowKey="code"
              rows={subjects}
              columns={[
                { key: "code", label: "Subject Code" },
                { key: "name", label: "Subject Name" },
                { key: "units", label: "Units" },
                { key: "yearLevel", label: "Year Level" },
                { key: "semester", label: "Semester" },
                { key: "status", label: "Active Status", render: (row) => <StatusBadge value={(row.status || "Active").toUpperCase()} label={row.status || "Active"} /> },
                { key: "prerequisite", label: "Prerequisite", render: (row) => row.prerequisites?.length ? row.prerequisites.join(", ") : "None" },
                { key: "actions", label: "Actions", render: (row) => <div className="cell-actions"><button className="table-action" type="button" onClick={() => setSelected(row)}>View Subject</button><button className="table-action" type="button" onClick={() => { setSelected(row); setSubjectForm({ ...row, program: row.program || "BSIT", curriculum: row.curriculum || "BSIT Curriculum 2024", status: row.status || "Active", description: row.description || "" }); setDialog("subject"); }}>Edit</button><button className="table-action" type="button" onClick={() => { setPrerequisiteForm({ targetCode: row.code, prerequisiteCode: "" }); setDialog("prerequisite"); }}>Manage Prerequisites</button></div> },
              ]}
            />
          </>
        ) : null}

        {view === "prerequisites" ? (
          <>
            <div className="action-row" style={{ marginBottom: 12 }}>
              <Button onClick={() => { setPrerequisiteForm({ targetCode: "", prerequisiteCode: "" }); setDialog("prerequisite"); }}>Add Prerequisite Rule</Button>
            </div>
            <DataTable
              rowKey="id"
              rows={prerequisiteRows}
              columns={[
                { key: "subject", label: "Subject" },
                { key: "requiredPrerequisite", label: "Required Prerequisite" },
                { key: "curriculum", label: "Curriculum Version" },
                { key: "effectiveTerm", label: "Effective Term" },
                { key: "status", label: "Status", render: (row) => <StatusBadge value="ACTIVE" label={row.status} /> },
                { key: "actions", label: "Actions", render: (row) => <div className="cell-actions"><button className="table-action" type="button" onClick={() => setSelected(row)}>View Rule</button><button className="table-action" type="button" onClick={() => setFeedback("Rule validation checks subject references, duplicate relationships, and circular prerequisites before save.")}>Validate Rule</button><button className="table-action" type="button" onClick={() => { removePrerequisiteRule(row.subject, row.requiredPrerequisite); setFeedback("Prerequisite rule deactivated in the demo."); }}>Deactivate Rule</button></div> },
              ]}
            />
          </>
        ) : null}

        {view === "term" ? (
          <>
            <div className="info-grid">
              <Info label="Academic Year" value={student.term.academicYear} />
              <Info label="Semester" value={student.term.semester} />
              <Info label="Current Academic Term" value={student.term.label} />
              <Info label="Term Status" value={student.term.status} />
              <Info label="Enrollment Opening Date" value={student.term.enrollmentStart} />
              <Info label="Enrollment Closing Date" value={student.term.enrollmentEnd} />
            </div>
            <div className="notice" style={{ marginTop: 14 }}>
              Academic Coordinators review term alignment but do not normally open or close enrollment or change enrollment period dates. Those operational controls remain with the Registrar.
            </div>
          </>
        ) : null}
      </Panel>

      {selected && ["programs", "curriculum", "subjects", "prerequisites"].includes(view) ? (
        <div style={{ marginTop: 16 }}>
          <Panel
            title={`${view === "programs" ? "Program" : view === "curriculum" ? "Curriculum" : view === "subjects" ? "Subject" : "Prerequisite Rule"} Details`}
            actions={<Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>}
          >
            <Details items={Object.entries(selected).filter(([key]) => !["actions", "id"].includes(key)).slice(0, 10).map(([key, value]) => [key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), Array.isArray(value) ? value.join(", ") || "None" : value])} />
          </Panel>
        </div>
      ) : null}

      <Modal open={dialog === "program"} title={selected ? "Edit Program" : "Add Program"} onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="coordinator-program-form">Save</Button></>}>
        <form id="coordinator-program-form" className="form-grid" onSubmit={saveProgram}>
          <label className="field">Program Code<input required disabled={Boolean(selected)} value={programForm.code} onChange={(event) => setProgramForm({ ...programForm, code: event.target.value })} /></label>
          <label className="field">Program Name<input required value={programForm.name} onChange={(event) => setProgramForm({ ...programForm, name: event.target.value })} /></label>
          <label className="field">Department or College<input required value={programForm.department} onChange={(event) => setProgramForm({ ...programForm, department: event.target.value })} /></label>
          <label className="field">Active Status<select value={programForm.status} onChange={(event) => setProgramForm({ ...programForm, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
        </form>
      </Modal>

      <Modal open={dialog === "curriculum"} title={selected ? "Edit Curriculum Version" : "Create Curriculum Version"} onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="coordinator-curriculum-form">Save</Button></>}>
        <form id="coordinator-curriculum-form" className="form-grid" onSubmit={saveCurriculum}>
          <label className="field">Program<select value={curriculumForm.program} onChange={(event) => setCurriculumForm({ ...curriculumForm, program: event.target.value })}>{catalog.programs.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label>
          <label className="field">Curriculum Version<input required value={curriculumForm.version} onChange={(event) => setCurriculumForm({ ...curriculumForm, version: event.target.value })} /></label>
          <label className="field">Effective Academic Year<input required value={curriculumForm.effectiveAcademicYear} onChange={(event) => setCurriculumForm({ ...curriculumForm, effectiveAcademicYear: event.target.value })} /></label>
          <label className="field">Status<select value={curriculumForm.status} onChange={(event) => setCurriculumForm({ ...curriculumForm, status: event.target.value })}><option>Draft</option><option>Active</option><option>Inactive</option></select></label>
        </form>
      </Modal>

      <Modal open={dialog === "subject"} title={selected ? "Edit Subject" : "Add Subject"} onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="coordinator-subject-form">Save</Button></>}>
        <form id="coordinator-subject-form" className="form-grid" onSubmit={saveSubject}>
          <label className="field">Subject Code<input required disabled={Boolean(selected)} value={subjectForm.code} onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value })} /></label>
          <label className="field">Subject Name<input required value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} /></label>
          <label className="field">Units<input required type="number" min="1" value={subjectForm.units} onChange={(event) => setSubjectForm({ ...subjectForm, units: Number(event.target.value) })} /></label>
          <label className="field">Program<select value={subjectForm.program} onChange={(event) => setSubjectForm({ ...subjectForm, program: event.target.value })}>{catalog.programs.map((item) => <option key={item.code}>{item.code}</option>)}</select></label>
          <label className="field">Year Level<select value={subjectForm.yearLevel} onChange={(event) => setSubjectForm({ ...subjectForm, yearLevel: event.target.value })}>{["1st Year","2nd Year","3rd Year","4th Year"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field">Semester<select value={subjectForm.semester} onChange={(event) => setSubjectForm({ ...subjectForm, semester: event.target.value })}><option>First Semester</option><option>Second Semester</option></select></label>
          <label className="field">Status<select value={subjectForm.status} onChange={(event) => setSubjectForm({ ...subjectForm, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>
          <label className="field full">Description<textarea value={subjectForm.description} onChange={(event) => setSubjectForm({ ...subjectForm, description: event.target.value })} /></label>
        </form>
      </Modal>

      <Modal open={dialog === "prerequisite"} title="Add Prerequisite Rule" onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="coordinator-prerequisite-form">Validate & Save</Button></>}>
        <form id="coordinator-prerequisite-form" className="form-grid" onSubmit={savePrerequisite}>
          <label className="field">Target Subject<select required value={prerequisiteForm.targetCode} onChange={(event) => setPrerequisiteForm({ ...prerequisiteForm, targetCode: event.target.value })}><option value="">Select subject</option>{catalog.subjects.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
          <label className="field">Required Prerequisite Subject<select required value={prerequisiteForm.prerequisiteCode} onChange={(event) => setPrerequisiteForm({ ...prerequisiteForm, prerequisiteCode: event.target.value })}><option value="">Select prerequisite</option>{catalog.subjects.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
          <Info label="Effective Term" value={student.term.shortLabel} />
          <Info label="Status" value="Active" />
        </form>
        <p className="notice" style={{ marginTop: 12 }}>Background validation blocks duplicate, invalid, self-referencing, and circular prerequisite relationships.</p>
      </Modal>
    </>
  );
}
