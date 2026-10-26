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
import {
  confirmOfficialEnrollment,
  confirmProjectEnrollmentBatch,
  loadRegistrarProjectEnrollmentDetail,
  performProjectEnrollmentAction,
  readRegistrarOfficialCOR,
  readRegistrarProjectCOR,
} from "@/features/registrar/registrar-actions";
import { registrarDebug, titleStatus } from "@/features/registrar/registrar-client-utils";

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
        validated: 0,
        confirmed: 0,
        students: [],
      });
    }
    const group = map.get(key);
    group.total += 1;
    group.students.push(row);
    if (["SUBMITTED", "DRAFT", "RETURNED"].includes(row.status)) group.pending += 1;
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

export default function RegistrarEnrollment({ enrollmentData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState("processing");
  const [recordType, setRecordType] = useState(PROJECT);
  const [search, setSearch] = useState(searchParams.get("student") || "");
  const [status, setStatus] = useState(ALL);
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
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!enrollmentData.capabilities?.enrollmentPeriodMutation) {
      registrarDebug("info", "Enrollment Period", "Enrollment period mutation is unavailable to the Registrar interface.");
    }
    if (!enrollmentData.capabilities?.officialReviewMutation) {
      registrarDebug("info", "Official Enrollment Review", "Official review/return mutation is unavailable; validated records can still be confirmed.");
    }
  }, [enrollmentData.capabilities]);

  const termMap = new Map((enrollmentData.terms || []).map((item) => [item.id, item.label || item.short_label || item.id]));
    const projectGroups = useMemo(() => groupProject(enrollmentData.project), [enrollmentData.project]);
  const officialGroups = useMemo(() => groupOfficial(enrollmentData.official), [enrollmentData.official]);
  const sourceGroups = recordType === PROJECT ? projectGroups : officialGroups;

  const filteredGroups = sourceGroups
    .map((group) => ({
      ...group,
      students: group.students.filter((row) => {
        const searchable = recordType === PROJECT
          ? `${row.student_number} ${row.full_name} ${row.program_code} ${row.home_block}`
          : `${row.studentNumber} ${row.studentName} ${row.reference} ${row.program_code} ${row.currentBlock}`;
        const rowBlock = recordType === PROJECT ? row.home_block : row.currentBlock;
        const rowTerm = recordType === PROJECT ? row.current_term_id : row.term_id;
        return (
          searchable.toLowerCase().includes(search.toLowerCase()) &&
          (status === ALL || row.status === status) &&
          (program === ALL || row.program_code === program) &&
          (block === ALL || rowBlock === block) &&
          (term === ALL || rowTerm === term)
        );
      }),
    }))
    .filter((group) => group.students.length);

  const allRows = recordType === PROJECT ? enrollmentData.project : enrollmentData.official;

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

    if (recordType === PROJECT) {
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

    if (recordType === PROJECT) {
      const action = decisionType;
      run(
        () =>
          performProjectEnrollmentAction({
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
            subtitle="Project Demonstration is the default view. Official Institutional records remain clearly separated."
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
                }}
                options={[
                  { value: PROJECT, label: "Project Demonstration" },
                  { value: OFFICIAL, label: "Official Institutional" },
                ]}
              />
              <SearchControl value={search} onChange={setSearch} label="Search enrollment" placeholder="Search student, reference, program, or block" />
              <FilterControl label="Status" value={status} onChange={setStatus} options={options(allRows.map((row) => row.status), "All Statuses")} />
              <FilterControl label="Program" value={program} onChange={setProgram} options={options(allRows.map((row) => row.program_code), "All Programs")} />
              <FilterControl label="Block" value={block} onChange={setBlock} options={options(allRows.map((row) => recordType === PROJECT ? row.home_block : row.currentBlock), "All Blocks")} />
              <FilterControl label="Term" value={term} onChange={setTerm} options={options(allRows.map((row) => recordType === PROJECT ? row.current_term_id : row.term_id), "All Terms")} />
              {(search || [status, program, block, term].some((value) => value !== ALL)) ? (
                <Button variant="ghost" onClick={() => { setSearch(""); setStatus(ALL); setProgram(ALL); setBlock(ALL); setTerm(ALL); }}>
                  Clear Filters
                </Button>
              ) : null}
            </div>

            {recordType === OFFICIAL ? (
              <div className="notice" style={{ marginBottom: 14 }}>
                Official records awaiting validation are view-only in this version. Final confirmation is available for validated records.
              </div>
            ) : (
              <div className="notice" style={{ marginBottom: 14 }}>
                Block grouping is for navigation only. Each student enrollment is reviewed and confirmed individually.
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
                { key: "pending", label: "Pending Review" },
                { key: "validated", label: "Validated" },
                { key: "confirmed", label: recordType === PROJECT ? "Confirmed (Demonstration)" : "Confirmed" },
              ]}
            />
          </Panel>
        ) : null}

        {tab === "history" ? (
          <Panel title="Enrollment History" subtitle="Current enrollment activity and official institutional history are shown separately.">
            <div className="toolbar">
              <FilterControl
                label="Record Type"
                value={recordType}
                onChange={setRecordType}
                options={[
                  { value: PROJECT, label: "Project Demonstration" },
                  { value: OFFICIAL, label: "Official Institutional" },
                ]}
              />
            </div>

            <DataTable
              rowKey={recordType === PROJECT ? "project_simulation_id" : "id"}
              rows={recordType === PROJECT ? enrollmentData.project : enrollmentData.official}
              onRowClick={openCase}
              getRowAriaLabel={(row) => `View enrollment ${recordType === PROJECT ? row.student_number : row.reference}`}
              emptyMessage="No enrollment records are available for this record type."
              columns={[
                {
                  key: "reference",
                  label: "Reference",
                  render: (row) => recordType === PROJECT ? (row.project_simulation_id || "Not available") : row.reference,
                },
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
                  render: (row) => <StatusBadge value={row.status === "CONFIRMED_SIMULATION" ? "CONFIRMED" : row.status} label={row.status === "CONFIRMED_SIMULATION" ? "Confirmed (Demonstration)" : titleStatus(row.status)} />,
                },
                {
                  key: "confirmed",
                  label: "Confirmation Date",
                  render: (row) => recordType === PROJECT ? row.confirmedAtLabel : row.confirmedAtLabel,
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
                  recordType === PROJECT && row.status === "VALIDATED" ? (
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
              { key: "program_code", label: "Program" },
              { key: "block", label: "Block", render: (row) => recordType === PROJECT ? row.home_block : row.currentBlock },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status === "CONFIRMED_SIMULATION" ? "CONFIRMED" : row.status} label={row.status === "CONFIRMED_SIMULATION" ? "Confirmed (Demonstration)" : titleStatus(row.status)} /> },
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
                <>
                  {selectedCase.status === "SUBMITTED" ? <Button onClick={() => startDecision("VALIDATE")}>Validate</Button> : null}
                  {selectedCase.status === "VALIDATED" ? (
                    <>
                      <Button variant="secondary" onClick={() => startDecision("RETURN")}>Return for Correction</Button>
                      <Button onClick={() => startDecision("CONFIRM")}>Confirm Demonstration</Button>
                    </>
                  ) : null}
                  {selectedCase.status === "CONFIRMED_SIMULATION" ? <Button onClick={() => openProjectCor(selectedCase)}>View COR</Button> : null}
                </>
              ) : (
                <>
                  {selectedCase.status === "VALIDATED" ? <Button onClick={() => startDecision("CONFIRM")}>Confirm Official Enrollment</Button> : null}
                  {selectedCase.status === "CONFIRMED" ? <Button onClick={() => openOfficialCor(selectedCase)}>View Official COR</Button> : null}
                </>
              )}
            </>
          ) : null
        }
      >
        {caseLoading ? <div className="notice">Loading enrollment record...</div> : null}

        {selectedCase && !caseLoading && recordType === PROJECT ? (
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
                ["Enrollment Status", titleStatus(selectedCase.status)],
              ]}
            />

            <h3 style={{ marginTop: 18 }}>Eligible Subjects</h3>
            <DataTable
              rowKey="subject_code"
              rows={projectDetail?.snapshot?.subjects || []}
              emptyMessage="No project subject eligibility rows are available."
              columns={[
                { key: "subject_code", label: "Subject Code" },
                { key: "subject_name", label: "Subject Name" },
                { key: "academic_units", label: "Units" },
                { key: "eligibility", label: "Eligibility", render: (row) => <StatusBadge value={row.eligibility} /> },
                { key: "reason", label: "Reason", render: (row) => row.reason || "Not available" },
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

            {["FOR_VALIDATION", "REQUIRES_CORRECTION"].includes(selectedCase.status) ? (
              <div className="notice warning" style={{ marginTop: 14 }}>
                Review and return actions are currently unavailable for this record. Final confirmation remains available after validation.
              </div>
            ) : null}

            <h3 style={{ marginTop: 18 }}>Registered Subjects</h3>
            <DataTable
              rowKey={(row) => `${row.subject_code}-${row.section_id}`}
              rows={selectedCase.subjects || []}
              emptyMessage="No subject registration records are available."
              columns={[
                { key: "subject_code", label: "Subject Code" },
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
            ? "Validate Project Enrollment"
            : decisionType === "RETURN"
              ? "Return Project Enrollment for Correction"
              : recordType === PROJECT
                ? "Confirm Project Demonstration Enrollment"
                : "Confirm Official Enrollment"
        }
        onClose={() => setDecisionOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecisionOpen(false)}>Cancel</Button>
            <Button
              disabled={isPending || (["RETURN", "CONFIRM"].includes(decisionType) && !decisionValue.trim())}
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
              This action updates the demonstration enrollment workflow only.
            </div>
            <label className="field full">
              <span>Validation Note</span>
              <textarea value={decisionValue} onChange={(event) => setDecisionValue(event.target.value)} />
            </label>
          </>
        ) : null}

        {decisionType === "RETURN" ? (
          <label className="field full">
            <span>Correction Reason</span>
            <textarea value={decisionValue} onChange={(event) => setDecisionValue(event.target.value)} />
          </label>
        ) : null}

        {decisionType === "CONFIRM" ? (
          <>
            <div className="notice warning">
              <strong>{recordType === PROJECT ? "Confirm for project demonstration only?" : "Confirm official institutional enrollment?"}</strong>
              <p>
                {recordType === PROJECT
                  ? "This confirms the demonstration enrollment and allows a demonstration COR to be generated."
                  : "Final confirmation rechecks enrollment requirements, schedule readiness, and section capacity."}
              </p>
            </div>
            <label className="field full">
              <span>{recordType === PROJECT ? "Confirmation Reference" : "Official Validation Source Reference"}</span>
              <input value={decisionValue} onChange={(event) => setDecisionValue(event.target.value)} />
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

      <RegistrarActionResultModal result={result} onClose={() => setResult(null)} />
    </>
  );
}
