"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  DataTable,
  FilterControl,
  InternalTabs,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Panel } from "./RegistrarShared";
import RegistrarGradeImports from "./RegistrarGradeImports";
import RegistrarActionResultModal from "./RegistrarActionResultModal";
import { loadRegistrarStudentRecordDetail } from "@/features/registrar/registrar-actions";
import { registrarDebug, titleStatus } from "@/features/registrar/registrar-client-utils";
import { displayCurriculumCode, displayCurriculumName } from "@/features/academic/project-academic-display-aliases.mjs";

const ALL = "ALL";

function options(values, allLabel, format = (value) => value) {
  return [
    { value: ALL, label: allLabel },
    ...[...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))]
      .map((value) => ({ value: String(value), label: format(value) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label))),
  ];
}

function yearLabel(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return "Not available";
  const suffix = number === 1 ? "st" : number === 2 ? "nd" : number === 3 ? "rd" : "th";
  return `${number}${suffix} Year`;
}

export default function RegistrarStudents({ studentsData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState("blocks");
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [curriculum, setCurriculum] = useState(ALL);
  const [term, setTerm] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentOpen, setStudentOpen] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    registrarDebug("info", "Students", "Technical record-source fields are intentionally hidden from the Registrar interface.");
  }, []);

  const termMap = new Map((studentsData.terms || []).map((item) => [item.id, item.label || item.short_label || item.id]));

  const filteredGroups = useMemo(
    () =>
      studentsData.groups.filter(
        (item) =>
          `${item.blockSection} ${item.college} ${item.programCode} ${item.programName} ${displayCurriculumCode(item.curriculumCode)} ${displayCurriculumName(item.curriculumCode)}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (college === ALL || item.college === college) &&
          (program === ALL || item.programCode === program) &&
          (curriculum === ALL || item.curriculumCode === curriculum) &&
          (term === ALL || item.termId === term) &&
          (year === ALL || String(item.yearLevel) === year) &&
          (section === ALL || item.blockSection === section),
      ),
    [studentsData.groups, search, college, program, curriculum, term, year, section],
  );

  const roster = selectedGroup
    ? studentsData.students.filter(
        (item) =>
          item.home_block_id === selectedGroup.blockId,
      )
    : [];

  function openStudent(student) {
    setSelectedStudent(student);
    setStudentOpen(true);
    setStudentDetail(null);

    startTransition(async () => {
      const response = await loadRegistrarStudentRecordDetail(
        student.student_id,
        student.project_only,
      );
      if (!response.ok) {
        setResult(response);
        return;
      }
      setStudentDetail(response.data);
    });
  }

  return (
    <>
      <PageHeader
        title="Students"
        description="Current 2026 demonstration block sections, student rosters, and grade imports."
      />

      <InternalTabs
        items={[
          { value: "admissions", label: "Admitted Students" },
          { value: "blocks", label: "Block Section Student List" },
          { value: "grades", label: "Import Grades" },
          { value: "history", label: "Grade Import History" },
        ]}
        selected={tab}
        onSelect={setTab}
        label="Registrar student sections"
      >
        {tab === "blocks" ? (
          <Panel
            title="Block Section Student List"
            subtitle={`${studentsData.groups.length} block sections · ${studentsData.students.length} students in the 2026 demonstration cohort. Select a block to view its roster.`}
          >
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label="Search blocks" placeholder="Search block, program, or curriculum" />
              <FilterControl label="College" value={college} onChange={setCollege} options={options(studentsData.groups.map((item) => item.college), "All Colleges")} />
              <FilterControl label="Program" value={program} onChange={setProgram} options={options(studentsData.groups.map((item) => item.programCode), "All Programs")} />
              <FilterControl label="Curriculum" value={curriculum} onChange={setCurriculum} options={options(studentsData.groups.map((item) => item.curriculumCode), "All Curricula", displayCurriculumName)} />
              <FilterControl label="Term" value={term} onChange={setTerm} options={options(studentsData.groups.map((item) => item.termId), "All Terms", (value) => termMap.get(value) || value)} />
              <FilterControl label="Year" value={year} onChange={setYear} options={options(studentsData.groups.map((item) => String(item.yearLevel)), "All Years", yearLabel)} />
              <FilterControl label="Section" value={section} onChange={setSection} options={options(studentsData.groups.map((item) => item.blockSection), "All Sections")} />
              {(search || [college, program, curriculum, term, year, section].some((value) => value !== ALL)) ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setCollege(ALL);
                    setProgram(ALL);
                    setCurriculum(ALL);
                    setTerm(ALL);
                    setYear(ALL);
                    setSection(ALL);
                  }}
                >
                  Clear Filters
                </Button>
              ) : null}
            </div>

            <DataTable
              rowKey="id"
              rows={filteredGroups}
              onRowClick={setSelectedGroup}
              getRowAriaLabel={(row) => `View students in ${row.blockSection}`}
              emptyMessage="No block groups match the selected filters."
              columns={[
                { key: "blockSection", label: "Block Section" },
                { key: "college", label: "College" },
                { key: "programCode", label: "Program" },
                { key: "curriculumCode", label: "Curriculum", render: (row) => displayCurriculumCode(row.curriculumCode) },
                { key: "yearLevel", label: "Year", render: (row) => yearLabel(row.yearLevel) },
                { key: "termId", label: "Academic Term", render: (row) => termMap.get(row.termId) || row.termId },
                { key: "assignedStudents", label: "Students", render: (row) => `${row.assignedStudents} / ${row.capacity ?? "?"}` },
              ]}
            />
          </Panel>
        ) : null}

        {tab === "admissions" ? (
          <Panel
            title="Admitted Institutional Students"
            subtitle="Accepted applicant records in Enrollment, including students awaiting Auth provisioning, Registrar review, and block assignment. Admission does not confirm enrollment."
          >
            <DataTable
              rowKey="id"
              rows={studentsData.admittedStudents || []}
              emptyMessage="No institutional admitted student records were found."
              columns={[
                { key: "student_number", label: "Student Number" },
                { key: "full_name", label: "Student Name" },
                { key: "email", label: "PLP Email" },
                { key: "program_code", label: "Program" },
                { key: "inputted_gwa", label: "GWA", render: (row) => row.inputted_gwa ?? "Not provided" },
                { key: "gwa_status", label: "GWA Check" },
                { key: "student_status", label: "Student Status" },
                { key: "auth_status", label: "Portal Auth" },
                { key: "account_status", label: "Account" },
                { key: "source", label: "Record Source" },
              ]}
            />
          </Panel>
        ) : null}

        {tab === "grades" ? <RegistrarGradeImports data={studentsData} /> : null}
        {tab === "history" ? <RegistrarGradeImports data={studentsData} historyOnly /> : null}
      </InternalTabs>

      <Modal
        open={Boolean(selectedGroup)}
        title={selectedGroup ? `${selectedGroup.blockSection} Student List` : "Student List"}
        onClose={() => setSelectedGroup(null)}
        className="registrar-detail-modal"
        footer={<Button onClick={() => setSelectedGroup(null)}>Close</Button>}
      >
        {selectedGroup ? (
          <>
            <Details
              items={[
                ["Block Section", selectedGroup.blockSection],
                ["College", selectedGroup.college],
                ["Program", `${selectedGroup.programCode} · ${selectedGroup.programName}`],
                ["Curriculum", displayCurriculumName(selectedGroup.curriculumCode)],
                ["Academic Term", termMap.get(selectedGroup.termId) || selectedGroup.termId],
                ["Year Level", yearLabel(selectedGroup.yearLevel)],
                ["Assigned Students", `${selectedGroup.assignedStudents} of ${selectedGroup.capacity ?? "?"} capacity`],
              ]}
            />

            <div style={{ marginTop: 16 }}>
              <DataTable
                rowKey="student_id"
                rows={roster}
                onRowClick={openStudent}
                getRowAriaLabel={(row) => `View student ${row.student_number}`}
                emptyMessage="No students are currently assigned to this group."
                columns={[
                  { key: "student_number", label: "Student ID" },
                  { key: "full_name", label: "Full Name" },
                  { key: "student_type", label: "Student Type", render: (row) => titleStatus(row.student_type) },
                  { key: "academic_classification", label: "Classification", render: (row) => titleStatus(row.academic_classification) },
                  { key: "enrollment_status", label: "Enrollment Status", render: (row) => titleStatus(row.enrollment_status) },
                  { key: "home_block", label: "Block Section" },
                ]}
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={studentOpen}
        title={selectedStudent ? `${selectedStudent.student_number} · ${selectedStudent.full_name}` : "Student Record"}
        onClose={() => {
          setStudentOpen(false);
          setSelectedStudent(null);
          setStudentDetail(null);
        }}
        className="registrar-detail-modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStudentOpen(false)}>Close</Button>
            {selectedStudent ? (
              <Button
                variant="secondary"
                onClick={() => router.push(`/registrar/enrollment?student=${encodeURIComponent(selectedStudent.student_number)}`)}
              >
                Open Enrollment
              </Button>
            ) : null}
          </>
        }
      >
        {isPending && !studentDetail ? <div className="notice">Loading student record...</div> : null}

        {selectedStudent && studentDetail ? (
          <>
            <Details
              items={[
                ["Student ID", selectedStudent.student_number],
                ["Full Name", selectedStudent.full_name],
                ["Program", selectedStudent.program_code],
                ["Curriculum", displayCurriculumName(selectedStudent.curriculum_code)],
                ["Academic Term", termMap.get(selectedStudent.current_term_id) || selectedStudent.current_term_id],
                ["Year Level", yearLabel(selectedStudent.year_level)],
                ["Student Type", titleStatus(selectedStudent.student_type)],
                ["Academic Classification", titleStatus(selectedStudent.academic_classification)],
                ["Enrollment Status", titleStatus(selectedStudent.enrollment_status)],
                ["Block Assignment", selectedStudent.home_block],
              ]}
            />

            {!selectedStudent.project_only ? (
              <div className="notice" style={{ marginTop: 14 }}>
                The student name is not available for this institutional record.
              </div>
            ) : null}

            {selectedStudent.project_only ? (
              <>
                <h3 style={{ marginTop: 18 }}>Academic Eligibility</h3>
                <DataTable
                  rowKey="subject_code"
                  rows={studentDetail.snapshot?.subjects || []}
                  emptyMessage="No subject eligibility records are available."
                  columns={[
                    { key: "subject_code", label: "Subject" },
                    { key: "subject_name", label: "Subject Name" },
                    { key: "academic_units", label: "Units" },
                    { key: "eligibility", label: "Eligibility", render: (row) => <StatusBadge value={row.eligibility} /> },
                    { key: "reason", label: "Reason", render: (row) => row.reason || "Not available" },
                  ]}
                />

                <h3 style={{ marginTop: 18 }}>Transfer Equivalency Reference</h3>
                <DataTable
                  rowKey="target_subject"
                  rows={studentDetail.snapshot?.transfer_credits || []}
                  emptyMessage="No project transfer equivalency reference is available."
                  columns={[
                    { key: "target_subject", label: "Target Subject" },
                    { key: "source_course", label: "Source Course" },
                    { key: "credited_units", label: "Credited Units" },
                    { key: "project_decision", label: "Decision" },
                  ]}
                />
                <div className="notice" style={{ marginTop: 14 }}>
                  Placement and transfer equivalency are read only in the Registrar portal.
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 18 }}>Admission Handoff</h3>
                <Details
                  items={[
                    ["Applicant Reference", studentDetail.admission?.applicant_reference || "Not available"],
                    ["Admission Type", studentDetail.admission?.admission_type || "Not available"],
                    ["Admission Status", studentDetail.admission?.admission_status || "Not available"],
                    ["Approved Program", studentDetail.admission?.approved_program_code || "Not available"],
                  ]}
                />

                <h3 style={{ marginTop: 18 }}>Official Enrollment History</h3>
                <DataTable
                  rowKey="id"
                  rows={studentDetail.officialEnrollments || []}
                  emptyMessage="No official enrollment history is available."
                  columns={[
                    { key: "reference", label: "Enrollment Reference" },
                    { key: "term_id", label: "Term" },
                    { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
                    { key: "declared_units", label: "Units" },
                    { key: "confirmedAtLabel", label: "Confirmation Date" },
                  ]}
                />

                <h3 style={{ marginTop: 18 }}>Official Academic Results</h3>
                <DataTable
                  rowKey="id"
                  rows={studentDetail.academicResults || []}
                  emptyMessage="No official academic results are visible."
                  columns={[
                    { key: "term_id", label: "Term" },
                    { key: "subject_code", label: "Subject" },
                    { key: "official_grade_value", label: "Official Grade", render: (row) => row.official_grade_value ?? "Not available" },
                    { key: "result_status", label: "Result", render: (row) => <StatusBadge value={row.result_status} /> },
                  ]}
                />

                <div className="notice" style={{ marginTop: 14 }}>
                  Student contact correction is currently unavailable from this screen.
                </div>
              </>
            )}
          </>
        ) : null}
      </Modal>

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
