"use client";

import { useMemo, useState, useTransition } from "react";
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
import { titleStatus } from "@/features/registrar/registrar-client-utils";

const ALL = "ALL";

function options(values, allLabel) {
  return [
    { value: ALL, label: allLabel },
    ...[...new Set(values.filter(Boolean))]
      .sort()
      .map((value) => ({ value, label: value })),
  ];
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

  const filteredGroups = useMemo(
    () =>
      studentsData.groups.filter(
        (item) =>
          `${item.blockSection} ${item.college} ${item.programCode} ${item.programName} ${item.curriculumCode} ${item.source}`
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
          (selectedGroup.blockId
            ? item.home_block_id === selectedGroup.blockId
            : !item.home_block_id) &&
          item.current_term_id === selectedGroup.termId &&
          item.program_code === selectedGroup.programCode,
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
        description="Live student records grouped by block section, protected PROJECT_ONLY snapshots, and the existing official grade publication workflow."
      />

      <InternalTabs
        items={[
          { value: "blocks", label: "Block Section Student List" },
          { value: "grades", label: "Official Grades Import" },
          { value: "history", label: "Grade Import History" },
        ]}
        selected={tab}
        onSelect={setTab}
        label="Registrar student sections"
      >
        {tab === "blocks" ? (
          <Panel
            title="Block Section Student List"
            subtitle="Grouping is a navigation aid only. Every student remains an individual protected record."
          >
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label="Search blocks" placeholder="Search block, program, curriculum, or source" />
              <FilterControl label="College" value={college} onChange={setCollege} options={options(studentsData.groups.map((item) => item.college), "All Colleges")} />
              <FilterControl label="Program" value={program} onChange={setProgram} options={options(studentsData.groups.map((item) => item.programCode), "All Programs")} />
              <FilterControl label="Curriculum" value={curriculum} onChange={setCurriculum} options={options(studentsData.groups.map((item) => item.curriculumCode), "All Curricula")} />
              <FilterControl label="Term" value={term} onChange={setTerm} options={options(studentsData.groups.map((item) => item.termId), "All Terms")} />
              <FilterControl label="Year" value={year} onChange={setYear} options={options(studentsData.groups.map((item) => String(item.yearLevel)), "All Years")} />
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
                { key: "curriculumCode", label: "Curriculum" },
                { key: "yearLevel", label: "Year" },
                { key: "termId", label: "Academic Term" },
                { key: "assignedStudents", label: "Students" },
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
                ["Curriculum", selectedGroup.curriculumCode],
                ["Academic Term", selectedGroup.termId],
                ["Year Level", selectedGroup.yearLevel],
                ["Assigned Students", selectedGroup.assignedStudents],
                ["Record Source", selectedGroup.source],
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
                  { key: "academic_classification", label: "Classification", render: (row) => titleStatus(row.academic_classification) },
                  { key: "student_status", label: "Student Status", render: (row) => <StatusBadge value={row.student_status} /> },
                  { key: "progression_status", label: "Progression", render: (row) => titleStatus(row.progression_status) },
                  { key: "home_block", label: "Assignment" },
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
        {isPending && !studentDetail ? <div className="notice">Loading protected student record...</div> : null}

        {selectedStudent && studentDetail ? (
          <>
            <Details
              items={[
                ["Student ID", selectedStudent.student_number],
                ["Full Name", selectedStudent.full_name],
                ["Record Source", selectedStudent.project_only ? "PROJECT_ONLY demonstration" : "Institutional"],
                ["Program", selectedStudent.program_code],
                ["Curriculum", selectedStudent.curriculum_code],
                ["Academic Term", selectedStudent.current_term_id],
                ["Year Level", selectedStudent.year_level],
                ["Student Type", selectedStudent.student_type],
                ["Academic Classification", titleStatus(selectedStudent.academic_classification)],
                ["Progression", titleStatus(selectedStudent.progression_status)],
                ["Block Assignment", selectedStudent.home_block],
              ]}
            />

            {!selectedStudent.project_only ? (
              <div className="notice" style={{ marginTop: 14 }}>
                The current RLS model does not expose other students&apos; application identity rows to the Registrar, so institutional full names remain labeled Not available unless another protected record supplies them.
              </div>
            ) : null}

            {selectedStudent.project_only ? (
              <>
                <h3 style={{ marginTop: 18 }}>PROJECT_ONLY Academic Snapshot</h3>
                <DataTable
                  rowKey="subject_code"
                  rows={studentDetail.snapshot?.subjects || []}
                  emptyMessage="No project subject eligibility rows are available."
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
                    { key: "project_decision", label: "Project Decision" },
                  ]}
                />
                <div className="notice" style={{ marginTop: 14 }}>
                  Placement and transfer equivalency are read only here. Registrar does not auto allocate or finalize academic placement.
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
                    ["Source", studentDetail.admission?.source_name || "Not available"],
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
                    { key: "source_name", label: "Source" },
                  ]}
                />

                <div className="notice" style={{ marginTop: 14 }}>
                  Authorized contact correction is not exposed until the backend can record the correction and its immutable audit history atomically.
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
