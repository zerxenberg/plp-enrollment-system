"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
import RegistrarActionResultModal from "./RegistrarActionResultModal";
import RegistrarCORModal from "./RegistrarCORModal";
import CorDocumentPreview from "@/components/cor/CorDocumentPreview";
import { reviewRegistrarAdmissionsPhase8Demo } from "@/features/admissions/admissions-phase8-demo-actions";
import {
  confirmOfficialEnrollment,
  confirmProjectEnrollmentBatch,
  loadRegistrarProjectEnrollmentDetail,
  performProjectEnrollmentAction,
  recoverRegistrarLegacyProjectEnrollment,
  reviewOfficialEnrollment,
  readRegistrarOfficialCOR,
  readRegistrarProjectCOR,
} from "@/features/registrar/registrar-actions";
import { registrarDebug, titleStatus } from "@/features/registrar/registrar-client-utils";
import { projectEnrollmentDisplayStatus } from "@/features/registrar/registrar-project-enrollment-view.mjs";
import { displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";
import {
  ADMISSIONS_DEMO_SOURCE,
  PROJECT_COHORT_SOURCE,
  combineRegistrarProjectCases,
  isAdmissionsDemoCase,
  registrarEnrollmentSourceLabel,
} from "@/features/registrar/registrar-enrollment-source.mjs";

const ALL = "ALL";
const PROJECT = "PROJECT";
const OFFICIAL = "OFFICIAL";

function options(values, allLabel) {
  return [
    { value: ALL, label: allLabel },
    ...[...new Set(values.filter(Boolean))]
      .sort()
      .map((value) => ({ value, label: value })),
  ];
}

function groupProject(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.home_block_id || "UNASSIGNED";
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        block: row.home_block || "Unassigned",
        program: row.program_code || "Not available",
        term: row.current_term_id || "Not available",
        total: 0,
        pending: 0,
        awaitingSubmission: 0,
        validated: 0,
        confirmed: 0,
        students: [],
      });
    }
    const group = map.get(key);
    group.total += 1;
    group.students.push(row);
    if (["SUBMITTED", "DRAFT", "RETURNED"].includes(row.status)) group.pending += 1;
    if (row.status === "PROPOSED") group.awaitingSubmission += 1;
    if (row.status === "VALIDATED") group.validated += 1;
    if (row.status === "CONFIRMED_SIMULATION") group.confirmed += 1;
  }
  return [...map.values()].sort((a, b) => a.block.localeCompare(b.block));
}

function groupOfficial(rows) {
  const map = new Map();
  for (const row of rows) {
    const block = row.targetBlock || row.currentBlock || "Unassigned";
    const key = `${row.term_id}:${row.program_code}:${block}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        block,
        program: row.program_code || "Not available",
        term: row.term_id || "Not available",
        total: 0,
        pending: 0,
        validated: 0,
        confirmed: 0,
        students: [],
      });
    }
    const group = map.get(key);
    group.total += 1;
    group.students.push(row);
    if (["SUBMITTED", "FOR_VALIDATION", "NEEDS_ACADEMIC_REVIEW", "REQUIRES_CORRECTION"].includes(row.status)) group.pending += 1;
    if (row.status === "VALIDATED") group.validated += 1;
    if (row.status === "CONFIRMED") group.confirmed += 1;
  }
  return [...map.values()].sort((a, b) => `${a.program}-${a.block}`.localeCompare(`${b.program}-${b.block}`));
}

export default function RegistrarEnrollment({ enrollmentData, admissionsDemo = [] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState("processing");
  const [recordType, setRecordType] = useState(PROJECT);
  const [search, setSearch] = useState(searchParams.get("student") || "");
  const [status, setStatus] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [block, setBlock] = useState(ALL);
  const [term, setTerm] = useState(ALL);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionType, setDecisionType] = useState("");
  const [decisionValue, setDecisionValue] = useState("");
  const [selectedBatch, setSelectedBatch] = useState(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchReference, setBatchReference] = useState("");
  const [cor, setCor] = useState(null);
  const [corProject, setCorProject] = useState(false);
  const [admissionsDemoCorId, setAdmissionsDemoCorId] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!enrollmentData.capabilities?.enrollmentPeriodMutation) {
      registrarDebug("info", "Enrollment Period", "Enrollment period mutation is unavailable to the Registrar interface.");
    }
  }, [enrollmentData.capabilities]);

  const termMap = new Map((enrollmentData.terms || []).map((item) => [item.id, item.label || item.short_label || item.id]));
  const projectRows = useMemo(
    () => combineRegistrarProjectCases(enrollmentData.project, admissionsDemo),
    [enrollmentData.project, admissionsDemo],
  );
  const allRows = recordType === PROJECT ? projectRows : enrollmentData.official;
  const filteredRows = allRows.filter((row) => {
    const searchable = recordType === PROJECT
      ? `${row.student_number} ${row.full_name} ${row.program_code} ${row.home_block}`
      : `${row.studentNumber} ${row.studentName} ${row.reference} ${row.program_code} ${row.currentBlock}`;
    const rowBlock = recordType === PROJECT ? row.home_block : row.currentBlock;
    const rowTerm = recordType === PROJECT ? row.current_term_id : row.term_id;
    return (
      searchable.toLowerCase().includes(search.toLowerCase()) &&
      (recordType !== PROJECT || source === ALL || row.enrollment_source === source) &&
      (status === ALL || row.status === status) &&
      (program === ALL || row.program_code === program) &&
      (block === ALL || rowBlock === block) &&
      (term === ALL || rowTerm === term)
    );
  });
  const filteredGroups = recordType === PROJECT
    ? groupProject(filteredRows) : groupOfficial(filteredRows);
  const historyRows = allRows.filter((row) =>
    (recordType !== PROJECT || source === ALL || row.enrollment_source === source) &&
    (status === ALL || row.status === status));

  function run(action, onSuccess) {
    startTransition(async () => {
      const response = await action();
      setResult(response);
      if (response.ok) {
        onSuccess?.(response);
        router.refresh();
      }
    });
  }

  async function openCase(row) {
    setSelectedCase(row);
    setSelectedGroup(null);
    setProjectDetail(null);
    setCaseLoading(false);

    if (recordType === PROJECT && !isAdmissionsDemoCase(row)) {
      setCaseLoading(true);
      const response = await loadRegistrarProjectEnrollmentDetail(row.student_id);
      setCaseLoading(false);
      if (!response.ok) {
        setResult(response);
        setSelectedCase(null);
        return;
      }
      setProjectDetail(response.data);
    }
  }

  function startDecision(type) {
    setDecisionType(type);
    setDecisionValue("");
    setDecisionOpen(true);
  }

  function submitDecision() {
    if (!selectedCase) return;

    if (recordType === PROJECT && isAdmissionsDemoCase(selectedCase)) {
      run(
        () => reviewRegistrarAdmissionsPhase8Demo({
          studentId: selectedCase.student_id,
          action: decisionType,
          reason: decisionValue,
        }),
        () => {
          setDecisionOpen(false);
          setSelectedCase(null);
        },
      );
      return;
    }

    if (recordType === PROJECT) {
      const action = decisionType;
      run(
        () => action === "RECOVER"
          ? recoverRegistrarLegacyProjectEnrollment({
            studentId: selectedCase.student_id,
            reason: decisionValue,
          })
          : performProjectEnrollmentAction({
            studentId: selectedCase.student_id,
            action,
            reason: decisionValue,
          }),
        (response) => {
          setDecisionOpen(false);
          setSelectedCase(null);
          if (action === "CONFIRM" && response.data?.simulation_id) {
            run(async () => {
              const loaded = await readRegistrarProjectCOR(response.data.simulation_id);
              if (loaded.ok) {
                setCor(loaded.data);
                setCorProject(true);
              }
              return loaded;
            });
          }
        },
      );
      return;
    }

    if (["VALIDATE", "RETURN"].includes(decisionType)) {
      run(
        () => reviewOfficialEnrollment({
          enrollmentId: selectedCase.id,
          action: decisionType,
          reason: decisionValue,
        }),
        () => {
          setDecisionOpen(false);
          setSelectedCase(null);
        },
      );
      return;
    }

    if (decisionType === "CONFIRM") {
      const enrollmentId = selectedCase.id;
      run(
        () =>
          confirmOfficialEnrollment({
            enrollmentId,
            sourceReference: decisionValue,
          }),
        (response) => {
          setDecisionOpen(false);
          setSelectedCase(null);
          if (response.ok) {
            run(async () => {
              const loaded = await readRegistrarOfficialCOR(enrollmentId);
              if (loaded.ok) {
                setCor(loaded.data);
                setCorProject(false);
              }
              return loaded;
            });
          }
        },
      );
    }
  }

  function confirmBatch() {
    const rows = enrollmentData.project.filter(
      (row) => selectedBatch.has(row.student_id) && row.status === "VALIDATED",
    );
    run(
      () => confirmProjectEnrollmentBatch(rows.map((row) => row.student_id), batchReference),
      () => {
        setBatchOpen(false);
        setSelectedBatch(new Set());
        setBatchReference("");
      },
    );
  }

  function toggleBatch(studentId) {
    setSelectedBatch((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function openProjectCor(row) {
    run(async () => {
      const response = await readRegistrarProjectCOR(row.project_simulation_id);
      if (response.ok) {
        setCor(response.data);
        setCorProject(true);
      }
      return response;
    });
  }

  function openOfficialCor(row) {
    run(async () => {
      const response = await readRegistrarOfficialCOR(row.id);
      if (response.ok) {
        setCor(response.data);
        setCorProject(false);
      }
      return response;
    });
  }

  return (
    <>
      <PageHeader
        title="Enrollment"
        description="Review official enrollment records and demonstration enrollment cases."
      />

      <InternalTabs
        items={[
          { value: "period", label: "Enrollment Period" },
          { value: "processing", label: "Enrollment Processing" },
          { value: "history", label: "Enrollment History" },
        ]}
        selected={tab}
        onSelect={setTab}
        label="Registrar enrollment sections"
      >
        {tab === "period" ? (
          <Panel
            title="Enrollment Period"
            subtitle="View the academic term and enrollment period currently used for registration."
          >
            <div className="notice" style={{ marginBottom: 14 }}>
              Enrollment period dates are currently view-only.
            </div>

            <DataTable
              rowKey="id"
              rows={enrollmentData.terms}
              onRowClick={setSelectedTerm}
              getRowAriaLabel={(row) => `View enrollment period ${row.label}`}
              columns={[
                { key: "label", label: "Academic Term" },
                { key: "enrollmentStartLabel", label: "Opening Date" },
                { key: "enrollmentEndLabel", label: "Closing Date" },
                { key: "status", label: "Window Status", render: (row) => <StatusBadge value={row.status} /> },
                { key: "source_inferred", label: "Source", render: (row) => row.source_inferred ? "Inferred" : "Configured" },
              ]}
            />
          </Panel>
        ) : null}

        {tab === "processing" ? (
          <Panel
            title="Enrollment Processing"
            subtitle="Process original Phase 8 and Admissions demonstration enrollments together, with official institutional records in their own view."
          >
            <div className="toolbar">
              <FilterControl
                label="Record Type"
                value={recordType}
                onChange={(value) => {
                  setRecordType(value);
                  setSelectedGroup(null);
                  setSelectedCase(null);
                  setSelectedBatch(new Set());
                  setStatus(ALL);
                  setSource(ALL);
                }}
                options={[
                  { value: PROJECT, label: "Project Demonstration" },
                  { value: OFFICIAL, label: "Official Institutional" },
                ]}
              />
              {recordType === PROJECT ? <FilterControl
                label="Source"
                value={source}
                onChange={setSource}
                options={[
                  { value: ALL, label: "All Demonstration Sources" },
                  { value: PROJECT_COHORT_SOURCE, label: "Original Project Cohort" },
                  { value: ADMISSIONS_DEMO_SOURCE, label: "Admissions Demonstration" },
                ]}
              /> : null}
              <SearchControl value={search} onChange={setSearch} label="Search enrollment" placeholder="Search student, reference, program, or block" />
              <FilterControl label="Status" value={status} onChange={setStatus} options={options(allRows.map((row) => row.status), "All Statuses")} />
              <FilterControl label="Program" value={program} onChange={setProgram} options={options(allRows.map((row) => row.program_code), "All Programs")} />
              <FilterControl label="Block" value={block} onChange={setBlock} options={options(allRows.map((row) => recordType === PROJECT ? row.home_block : row.currentBlock), "All Blocks")} />
              <FilterControl label="Term" value={term} onChange={setTerm} options={options(allRows.map((row) => recordType === PROJECT ? row.current_term_id : row.term_id), "All Terms")} />
              {(search || [source, status, program, block, term].some((value) => value !== ALL)) ? (
                <Button variant="ghost" onClick={() => { setSearch(""); setSource(ALL); setStatus(ALL); setProgram(ALL); setBlock(ALL); setTerm(ALL); }}>
                  Clear Filters
                </Button>
              ) : null}
            </div>

            {recordType === OFFICIAL ? (
              <div className="notice" style={{ marginBottom: 14 }}>
                Submitted institutional records enter the validation queue before Registrar review.
                A Registrar may validate or return records marked For Validation.
                Final confirmation remains a separate action.
              </div>
            ) : (
              <div className="notice" style={{ marginBottom: 14 }}>
                Original Phase 8 students and real Admissions students share this demonstration queue. Source labels identify their separate enrollment ledgers. Only submitted students can be validated; confirmation is always individual.
              </div>
            )}

            {recordType === PROJECT && selectedBatch.size ? (
              <div className="action-row" style={{ marginBottom: 14 }}>
                <Button onClick={() => setBatchOpen(true)}>
                  Confirm {selectedBatch.size} Validated Selection{selectedBatch.size === 1 ? "" : "s"}
                </Button>
              </div>
            ) : null}

            <DataTable
              rowKey="id"
              rows={filteredGroups}
              onRowClick={setSelectedGroup}
              getRowAriaLabel={(row) => `View enrollment group ${row.block}`}
              emptyMessage="No enrollment groups match the selected filters."
              columns={[
                { key: "program", label: "Program" },
                { key: "block", label: "Block" },
                { key: "term", label: "Academic Term", render: (row) => termMap.get(row.term) || row.term },
                { key: "total", label: "Applications" },
                ...(recordType === PROJECT
                  ? [{ key: "awaitingSubmission", label: "Awaiting Student Submission" }]
                  : []),
                { key: "pending", label: "Pending Review" },
                { key: "validated", label: "Validated" },
                { key: "confirmed", label: recordType === PROJECT ? "Confirmed (Demonstration)" : "Confirmed" },
              ]}
            />
          </Panel>
        ) : null}

        {tab === "history" ? (
          <Panel title="Enrollment History" subtitle="Review original and Admissions demonstration records together, including returned and confirmed registrations. Official history remains separate.">
            <div className="toolbar">
              <FilterControl
                label="Record Type"
                value={recordType}
                onChange={(value) => { setRecordType(value); setSource(ALL); setStatus(ALL); setSelectedCase(null); }}
                options={[
                  { value: PROJECT, label: "Project Demonstration" },
                  { value: OFFICIAL, label: "Official Institutional" },
                ]}
              />
              {recordType === PROJECT ? <FilterControl
                label="Source"
                value={source}
                onChange={setSource}
                options={[
                  { value: ALL, label: "All Demonstration Sources" },
                  { value: PROJECT_COHORT_SOURCE, label: "Original Project Cohort" },
                  { value: ADMISSIONS_DEMO_SOURCE, label: "Admissions Demonstration" },
                ]}
              /> : null}
              <FilterControl label="Status" value={status} onChange={setStatus}
                options={options(allRows.map((row) => row.status), "All Statuses")} />
            </div>

            <DataTable
              rowKey="id"
              rows={historyRows}
              onRowClick={openCase}
              getRowAriaLabel={(row) => `View enrollment ${recordType === PROJECT ? row.student_number : row.reference}`}
              emptyMessage="No enrollment records are available for this record type."
              columns={[
                {
                  key: "reference",
                  label: "Reference",
                  render: (row) => recordType === PROJECT
                    ? (isAdmissionsDemoCase(row) ? row.admissions_ledger_id : row.project_simulation_id) || "Not available"
                    : row.reference,
                },
                { key: "source", label: "Source", render: (row) =>
                  recordType === PROJECT ? registrarEnrollmentSourceLabel(row) : "Official Institutional" },
                {
                  key: "student",
                  label: "Student",
                  render: (row) => recordType === PROJECT ? `${row.student_number} · ${row.full_name}` : `${row.studentNumber} · ${row.studentName}`,
                },
                { key: "program_code", label: "Program" },
                {
                  key: "term",
                  label: "Term",
                  render: (row) => termMap.get(recordType === PROJECT ? row.current_term_id : row.term_id) || (recordType === PROJECT ? row.current_term_id : row.term_id),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => <StatusBadge value={row.status}
                    label={recordType === PROJECT ? (projectEnrollmentDisplayStatus(row) || titleStatus(row.status)) : titleStatus(row.status)} />,
                },
                {
                  key: "confirmed",
                  label: "Confirmation Date",
                  render: (row) => row.confirmedAtLabel,
                },
              ]}
            />
          </Panel>
        ) : null}
      </InternalTabs>

      <Modal
        open={Boolean(selectedTerm)}
        title={selectedTerm?.label || "Enrollment Period"}
        onClose={() => setSelectedTerm(null)}
        footer={<Button onClick={() => setSelectedTerm(null)}>Close</Button>}
      >
        {selectedTerm ? (
          <Details
            items={[
              ["Academic Year", selectedTerm.academic_year],
              ["Semester", selectedTerm.semester],
              ["Opening Date", selectedTerm.enrollmentStartLabel],
              ["Closing Date", selectedTerm.enrollmentEndLabel],
              ["Status", selectedTerm.status],
              ["Source Inferred", selectedTerm.source_inferred ? "Yes" : "No"],
            ]}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedGroup)}
        title={selectedGroup ? `${selectedGroup.program} · ${selectedGroup.block}` : "Enrollment Group"}
        onClose={() => setSelectedGroup(null)}
        className="registrar-detail-modal"
        footer={<Button onClick={() => setSelectedGroup(null)}>Close</Button>}
      >
        {selectedGroup ? (
          <DataTable
            rowKey={recordType === PROJECT ? "student_id" : "id"}
            rows={selectedGroup.students}
            onRowClick={openCase}
            getRowAriaLabel={(row) => `View enrollment for ${recordType === PROJECT ? row.student_number : row.studentNumber}`}
            columns={[
              {
                key: "select",
                label: "",
                render: (row) =>
                  recordType === PROJECT && !isAdmissionsDemoCase(row) && row.status === "VALIDATED" ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.student_number}`}
                      checked={selectedBatch.has(row.student_id)}
                      data-stop-row-click="true"
                      onChange={() => toggleBatch(row.student_id)}
                    />
                  ) : null,
              },
              { key: "studentNumber", label: "Student ID", render: (row) => recordType === PROJECT ? row.student_number : row.studentNumber },
              { key: "studentName", label: "Student Name", render: (row) => recordType === PROJECT ? row.full_name : row.studentName },
              { key: "source", label: "Source", render: (row) =>
                recordType === PROJECT ? registrarEnrollmentSourceLabel(row) : "Official Institutional" },
              { key: "program_code", label: "Program" },
              { key: "block", label: "Block", render: (row) => recordType === PROJECT ? row.home_block : row.currentBlock },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} label={projectEnrollmentDisplayStatus(row) || titleStatus(row.status)} /> },
            ]}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedCase)}
        title={
          selectedCase
            ? recordType === PROJECT
              ? `${selectedCase.student_number} · ${selectedCase.full_name}`
              : `${selectedCase.studentNumber} · ${selectedCase.studentName}`
            : "Enrollment Review"
        }
        onClose={() => {
          setSelectedCase(null);
          setProjectDetail(null);
        }}
        className="registrar-detail-modal"
        footer={
          selectedCase ? (
            <>
              <Button variant="ghost" onClick={() => setSelectedCase(null)}>Close</Button>
              {recordType === PROJECT ? (
                isAdmissionsDemoCase(selectedCase) ? (
                  <>
                    {selectedCase.status === "CONFIRMED_SIMULATION" &&
                      selectedCase.confirmed_at && selectedCase.admissions_ledger_id ? (
                        <Button onClick={() => setAdmissionsDemoCorId(selectedCase.admissions_ledger_id)}>
                          View COR
                        </Button>
                      ) : null}
                    {selectedCase.status === "SUBMITTED" ? (
                      <>
                        <Button variant="secondary" onClick={() => startDecision("RETURN")}>Return for Correction</Button>
                        <Button onClick={() => startDecision("VALIDATE")}>Validate Demonstration</Button>
                      </>
                    ) : null}
                    {selectedCase.status === "VALIDATED" ? (
                      <>
                        <Button variant="secondary" onClick={() => startDecision("RETURN")}>Return for Correction</Button>
                        <Button onClick={() => startDecision("CONFIRM")}>Confirm Demonstration</Button>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    {selectedCase.status === "SUBMITTED" && projectDetail?.selectedSubjectCount > 0 ?
                      <Button onClick={() => startDecision("VALIDATE")}>Validate</Button> : null}
                    {selectedCase.status === "VALIDATED" ? (
                      <>
                        <Button variant="secondary" onClick={() => startDecision("RETURN")}>Return for Correction</Button>
                        <Button onClick={() => startDecision("CONFIRM")}>Confirm Demonstration</Button>
                      </>
                    ) : null}
                    {selectedCase.status === "CONFIRMED_SIMULATION" && projectDetail?.corReady === true ?
                      <Button onClick={() => openProjectCor(selectedCase)}>View COR</Button> : null}
                    {selectedCase.status === "CONFIRMED_SIMULATION" && projectDetail?.legacyConfirmationWithoutRegistration ?
                      <Button variant="secondary" onClick={() => startDecision("RECOVER")}>Recover Legacy Enrollment</Button> : null}
                  </>
                )
              ) : (
                <>
                  {selectedCase.status === "FOR_VALIDATION" ? (
                    <>
                      <Button variant="secondary" onClick={() => startDecision("RETURN")}>Require Correction</Button>
                      <Button onClick={() => startDecision("VALIDATE")}>Validate Official Enrollment</Button>
                    </>
                  ) : null}
                  {selectedCase.status === "VALIDATED" ? <Button onClick={() => startDecision("CONFIRM")}>Confirm Official Enrollment</Button> : null}
                  {selectedCase.status === "CONFIRMED" ? <Button onClick={() => openOfficialCor(selectedCase)}>View Official COR</Button> : null}
                </>
              )}
            </>
          ) : null
        }
      >
        {caseLoading ? <div className="notice">Loading enrollment record...</div> : null}

        {selectedCase && !caseLoading && recordType === PROJECT && isAdmissionsDemoCase(selectedCase) ? (
          <>
            <div className="notice" role="note">
              Real Admissions identity in the separate Phase 8 demonstration ledger.
              This is fictional academic planning and never an official institutional enrollment.
            </div>
            <Details items={[
              ["Student ID", selectedCase.student_number],
              ["Student Name", selectedCase.full_name],
              ["Program", selectedCase.program_code],
              ["Curriculum", selectedCase.curriculum_code || "Not available"],
              ["Demo Block", selectedCase.home_block],
              ["Academic Term", termMap.get(selectedCase.current_term_id) || selectedCase.current_term_id],
              ["Record Source", registrarEnrollmentSourceLabel(selectedCase)],
              ["Enrollment Status", titleStatus(selectedCase.status)],
              ["Confirmation Date", selectedCase.confirmedAtLabel],
            ]} />
            {selectedCase.status === "PROPOSED" ? <div className="notice" style={{ marginTop: 14 }}>
              This block has been proposed. The student must submit the demonstration registration before Registrar validation.
            </div> : null}
            {selectedCase.status === "RETURNED" && selectedCase.correction_reason ?
              <div className="notice warning" style={{ marginTop: 14 }} role="status">
                Returned for correction: {selectedCase.correction_reason}
              </div> : null}
            {selectedCase.status === "CONFIRMED_SIMULATION" ? <div className="notice" style={{ marginTop: 14 }}>
              Confirmed for project demonstration only. The student can access the demonstration registration PDF.
              No official university COR was issued.
            </div> : null}
            <h3 style={{ marginTop: 20 }}>Preserved Demonstration Subject Snapshot</h3>
            <DataTable
              rowKey={(row) => row.code || row.subject_code}
              rows={Array.isArray(selectedCase.subject_snapshot) ? selectedCase.subject_snapshot : []}
              emptyMessage="No submitted subject snapshot is available yet."
              columns={[
                { key: "code", label: "Subject Code", render: (row) => displaySubjectCode(row.code || row.subject_code) },
                { key: "name", label: "Subject Name", render: (row) => row.name || row.subject_name },
                { key: "units", label: "Units" },
                { key: "section", label: "Section", render: (row) => row.section || row.section_code || "Not available" },
              ]}
            />
          </>
        ) : null}

        {selectedCase && !caseLoading && recordType === PROJECT && !isAdmissionsDemoCase(selectedCase) ? (
          <>
            <p style={{ fontSize: ".7rem", color: "#607168", marginBottom: 12 }}>
              Demonstration enrollment record. This is not an official enrollment record.
            </p>
            <Details
              items={[
                ["Student ID", selectedCase.student_number],
                ["Student Name", selectedCase.full_name],
                ["Program", projectDetail?.snapshot?.program_code || selectedCase.program_code],
                ["Curriculum", projectDetail?.snapshot?.curriculum_code || "Not available"],
                ["Year Level", projectDetail?.snapshot?.year_level || "Not available"],
                ["Classification", titleStatus(projectDetail?.snapshot?.academic_classification)],
                ["Progression", titleStatus(projectDetail?.snapshot?.progression_status)],
                ["Home Block", projectDetail?.snapshot?.home_block || selectedCase.home_block],
                ["Enrollment Status", projectEnrollmentDisplayStatus(selectedCase, projectDetail?.corReady) || titleStatus(selectedCase.status)],
              ]}
            />

            {selectedCase.status === "CONFIRMED_SIMULATION" &&
              projectDetail?.legacyConfirmationWithoutRegistration ? (
                <div className="notice warning" role="status" style={{ marginTop: 16 }}>
                  This older demonstration enrollment was confirmed before registered subjects were saved.
                  A COR cannot be generated without an authenticated subject registration snapshot.
                  The original confirmation is preserved. Registrar review and an authorized correction
                  workflow are required before treating this as a completed registration.
                </div>
              ) : null}

            <h3 style={{ marginTop: 22 }}>{selectedCase.status === "SUBMITTED"
              ? "Student Submitted Subject Registration" : "Saved Enrollment Subject Selection"}</h3>
            <p style={{ fontSize: ".77rem", color: "#607168", marginBottom: 12 }}>
              These are the actual student selected subjects saved in Supabase for this
              enrollment. They are not confirmed registrations until Registrar confirmation.
            </p>
            <Details items={[
              ["Submitted Subjects", projectDetail?.selectedSubjectCount ?? "Not loaded"],
              ["Submitted Units", projectDetail?.selectedUnits ?? "Not loaded"],
              ["Registration State", titleStatus(selectedCase.status)],
            ]} />
            <DataTable
              rowKey="subject_code"
              rows={projectDetail?.selectedSubjects || []}
              emptyMessage="No subject selections have been saved for this enrollment."
              columns={[
                { key: "subject_code", label: "Subject Code", render: (row) => displaySubjectCode(row.subject_code) },
                { key: "subject_name", label: "Submitted Subject" },
                { key: "academic_units", label: "Units" },
                { key: "section_code", label: "Selected Section" },
                { key: "currentEligibility", label: "Current Eligibility", render: (row) =>
                  <StatusBadge value={row.currentEligibility} /> },
              ]}
            />

          </>
        ) : null}

        {selectedCase && !caseLoading && recordType === OFFICIAL ? (
          <>
            <Details
              items={[
                ["Enrollment Reference", selectedCase.reference],
                ["Student ID", selectedCase.studentNumber],
                ["Student Name", selectedCase.studentName],
                ["Program", selectedCase.program_code],
                ["Curriculum", selectedCase.curriculum_code],
                ["Classification", titleStatus(selectedCase.academicClassification)],
                ["Current Block", selectedCase.currentBlock],
                ["Eligibility", titleStatus(selectedCase.eligibility_status)],
                ["Declared Units", selectedCase.declared_units ?? "Not available"],
                ["Enrollment Status", titleStatus(selectedCase.status)],
                ["Submitted At", selectedCase.submittedAtLabel],
                ["Last Validated", selectedCase.validatedAtLabel],
                ["Confirmation Reference", selectedCase.confirmation_reference || "Not available"],
              ]}
            />

            {selectedCase.status === "REQUIRES_CORRECTION" ? (
              <div className="notice warning" style={{ marginTop: 14 }}>
                This application was returned for correction.
                {selectedCase.current_correction_reason ? ` Reason: ${selectedCase.current_correction_reason}` : ""}
              </div>
            ) : null}

            <h3 style={{ marginTop: 18 }}>Registered Subjects</h3>
            <DataTable
              rowKey={(row) => `${row.subject_code}-${row.section_id}`}
              rows={selectedCase.subjects || []}
              emptyMessage="No subject registration records are available."
              columns={[
                { key: "subject_code", label: "Subject Code", render: (row) => displaySubjectCode(row.subject_code) },
                { key: "subjectName", label: "Subject Name" },
                { key: "sectionCode", label: "Section" },
                { key: "units_at_enrollment", label: "Units", render: (row) => row.units_at_enrollment ?? "Not available" },
                { key: "registration_status", label: "Registration Status", render: (row) => <StatusBadge value={row.registration_status} /> },
                { key: "scheduleStatus", label: "Schedule" },
              ]}
            />

            <h3 style={{ marginTop: 18 }}>Status History</h3>
            <DataTable
              rowKey="id"
              rows={selectedCase.history || []}
              emptyMessage="No status history is available."
              columns={[
                { key: "changedAtLabel", label: "Date & Time" },
                { key: "actor_label", label: "Actor" },
                { key: "action", label: "Action" },
                { key: "previous_status", label: "Previous" },
                { key: "new_status", label: "Result" },
                { key: "reason", label: "Reason", render: (row) => row.reason || "Not available" },
              ]}
            />
          </>
        ) : null}
      </Modal>

      <Modal
        open={decisionOpen}
        title={
          decisionType === "VALIDATE"
            ? recordType === PROJECT
              ? isAdmissionsDemoCase(selectedCase) ? "Validate Admissions Demonstration" : "Validate Project Enrollment"
              : "Validate Official Enrollment"
            : decisionType === "RECOVER"
              ? "Recover Legacy Project Enrollment"
            : decisionType === "RETURN"
              ? recordType === PROJECT
                ? isAdmissionsDemoCase(selectedCase) ? "Return Admissions Demonstration for Correction" : "Return Project Enrollment for Correction"
                : "Require Official Enrollment Correction"
              : recordType === PROJECT
                ? isAdmissionsDemoCase(selectedCase) ? "Confirm Admissions Demonstration Enrollment" : "Confirm Project Demonstration Enrollment"
                : "Confirm Official Enrollment"
        }
        onClose={() => setDecisionOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecisionOpen(false)}>Cancel</Button>
            <Button
              disabled={isPending || (["RETURN", "CONFIRM"].includes(decisionType) && !decisionValue.trim()) ||
                (isAdmissionsDemoCase(selectedCase) && decisionValue.trim().length < 10) ||
                (recordType === OFFICIAL && ["RETURN", "VALIDATE"].includes(decisionType) &&
                  decisionValue.trim().length < 10) ||
                (decisionType === "RECOVER" && decisionValue.trim().length < 20)}
              onClick={submitDecision}
            >
              {isPending ? "Processing..." : "Confirm Action"}
            </Button>
          </>
        }
      >
        {decisionType === "VALIDATE" ? (
          <>
            <div className="notice">
              {recordType === PROJECT
                ? isAdmissionsDemoCase(selectedCase)
                  ? "The separate Admissions demonstration ledger will be validated by the trusted Registrar review workflow. A reason of at least 10 characters is required."
                  : "This action updates the demonstration enrollment workflow only."
                : "This validates the student's recorded official subjects, current eligibility, active institutional sections, capacity, and published class meetings. Registrar confirmation is still required."}
            </div>
            <label className="field full">
              <span>{recordType === PROJECT && !isAdmissionsDemoCase(selectedCase) ? "Validation Note" : "Registrar Review Reason (at least 10 characters)"}</span>
              <textarea value={decisionValue} maxLength={isAdmissionsDemoCase(selectedCase) ? 700 : 1000} onChange={(event) => setDecisionValue(event.target.value)} />
            </label>
          </>
        ) : null}

        {decisionType === "RETURN" ? (
          <>
            {recordType === OFFICIAL ? <div className="notice">
              The correction reason will be saved with the official enrollment record.
            </div> : null}
            <label className="field full">
              <span>Correction Reason {recordType === OFFICIAL || isAdmissionsDemoCase(selectedCase) ? "(at least 10 characters)" : ""}</span>
              <textarea value={decisionValue} maxLength={isAdmissionsDemoCase(selectedCase) ? 700 : 1000} onChange={(event) => setDecisionValue(event.target.value)} />
            </label>
          </>
        ) : null}

        {decisionType === "RECOVER" ? <>
          <div className="notice warning">
            This is an audited, project only correction for a confirmed legacy simulation
            without registered subjects. The original Registrar confirmation and audit
            history are retained. The student must select subjects and submit again,
            then receive separate Registrar validation and confirmation.
          </div>
          <label className="field full">
            <span>Recovery explanation (at least 20 characters)</span>
            <textarea value={decisionValue} maxLength={1000}
              onChange={(event) => setDecisionValue(event.target.value)} />
          </label>
        </> : null}

        {decisionType === "CONFIRM" ? (
          <>
            <div className="notice warning">
              <strong>{recordType === PROJECT ? "Confirm for project demonstration only?" : "Confirm official institutional enrollment?"}</strong>
              <p>
                {recordType === PROJECT
                  ? isAdmissionsDemoCase(selectedCase)
                    ? "This confirms the separate Admissions demonstration ledger. The student can download a demonstration registration PDF. No official university COR is issued."
                    : "This confirms the demonstration enrollment and allows a demonstration COR to be generated."
                  : "Final confirmation rechecks enrollment requirements, schedule readiness, and section capacity."}
              </p>
            </div>
            <label className="field full">
              <span>{recordType === PROJECT
                ? isAdmissionsDemoCase(selectedCase) ? "Registrar Review Reference (at least 10 characters)" : "Confirmation Reference"
                : "Official Validation Source Reference"}</span>
              <input value={decisionValue} maxLength={isAdmissionsDemoCase(selectedCase) ? 700 : undefined} onChange={(event) => setDecisionValue(event.target.value)} />
            </label>
          </>
        ) : null}
      </Modal>

      <Modal
        open={batchOpen}
        title="Confirm Selected Project Demonstration Enrollments"
        onClose={() => setBatchOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBatchOpen(false)}>Cancel</Button>
            <Button disabled={isPending || !batchReference.trim()} onClick={confirmBatch}>
              {isPending ? "Confirming..." : `Confirm ${selectedBatch.size} Selected`}
            </Button>
          </>
        }
      >
        <div className="notice warning">
          <strong>Batch grouping does not waive individual validation.</strong>
          <p>
            Each selected student is confirmed individually. Students who no longer meet enrollment requirements remain unconfirmed.
          </p>
        </div>
        <label className="field full">
          <span>Batch Confirmation Reference</span>
          <input value={batchReference} onChange={(event) => setBatchReference(event.target.value)} />
        </label>
      </Modal>

      <RegistrarCORModal
        open={Boolean(cor)}
        cor={cor}
        isProject={corProject}
        onClose={() => setCor(null)}
      />

      <CorDocumentPreview
        open={Boolean(admissionsDemoCorId)}
        documentUrl={admissionsDemoCorId
          ? `/api/registrar/admissions-demo-cor/${encodeURIComponent(admissionsDemoCorId)}`
          : null}
        project
        onClose={() => setAdmissionsDemoCorId(null)}
      />

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
