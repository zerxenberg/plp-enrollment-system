
"use client";

import { useMemo, useState } from "react";
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

export default function AcademicCoordinatorAcademicReview() {
  const { registrar, decideAcademicReview } = useDemoData();
  const [view, setView] = useState("pending");
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState("ALL");
  const [selectedReference, setSelectedReference] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [decision, setDecision] = useState("APPROVED");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");

  const pending = useMemo(
    () => registrar.enrollments
      .filter((item) => item.status === "NEEDS_ACADEMIC_REVIEW")
      .map((item) => ({
        ...item,
        caseReference: `ACR-${item.reference}`,
        studentReference: item.studentNumber,
        curriculumVersion: item.curriculum,
        subject: item.subjects?.[0]?.code || "Academic Exception",
        exceptionType: "Defined Academic Exception",
        failedAcademicRule: item.validationPreset === "review" ? "Automated rule requires academic judgment" : "Academic rule exception",
        dateSubmitted: item.submittedDate,
      }))
      .filter((item) =>
        `${item.caseReference} ${item.studentReference} ${item.studentName} ${item.program} ${item.subject}`.toLowerCase().includes(search.toLowerCase()) &&
        (program === "ALL" || item.program === program)
      ),
    [program, registrar.enrollments, search],
  );

  const resolved = registrar.enrollments
    .filter((item) => item.academicReviewDecision)
    .filter((item) =>
      `${item.reference} ${item.studentNumber} ${item.studentName} ${item.program}`.toLowerCase().includes(search.toLowerCase()) &&
      (program === "ALL" || item.program === program)
    );

  const current = registrar.enrollments.find((item) => item.reference === selectedReference);
  const programOptions = [{ value: "ALL", label: "All Programs" }, ...new Set(registrar.enrollments.map((item) => item.program))].map((item) => typeof item === "string" ? { value: item, label: item } : item);

  function confirmDecision() {
    const result = decideAcademicReview(selectedReference, { decision, note });
    setFeedback(result.ok ? `Academic decision recorded. Enrollment status is now ${result.nextStatus.replaceAll("_", " ")}.` : result.message);
    if (result.ok) {
      setDialog(false);
      setNote("");
    }
  }

  return (
    <>
      <PageHeader
        title="Academic Review"
        description="Review defined academic exceptions that automated rules cannot decide without Academic Coordinator judgment."
      />

      <Panel title="Academic Review Queue" subtitle="Only the academic context required for the decision is displayed.">
        <Tabs
          selected={view}
          onSelect={(next) => { setView(next); setSelectedReference(null); setFeedback(""); }}
          items={[
            { value: "pending", label: `Pending Reviews (${registrar.enrollments.filter((item) => item.status === "NEEDS_ACADEMIC_REVIEW").length})` },
            { value: "resolved", label: `Resolved Reviews (${registrar.enrollments.filter((item) => item.academicReviewDecision).length})` },
          ]}
        />

        <div className="toolbar">
          <SearchControl value={search} onChange={setSearch} label="Search academic review" placeholder="Search case, student, program, or subject" />
          <FilterControl label="Program" value={program} onChange={setProgram} options={programOptions} />
        </div>

        <Feedback message={feedback} warning={feedback.toLowerCase().includes("cannot") || feedback.toLowerCase().includes("required") || feedback.toLowerCase().includes("not")} />

        {view === "pending" ? (
          <DataTable
            rowKey="caseReference"
            rows={pending}
            emptyMessage="No academic review cases are currently waiting for a decision."
            columns={[
              { key: "caseReference", label: "Case Reference" },
              { key: "studentReference", label: "Student Reference" },
              { key: "studentName", label: "Student Name" },
              { key: "program", label: "Program" },
              { key: "curriculumVersion", label: "Curriculum" },
              { key: "subject", label: "Subject" },
              { key: "exceptionType", label: "Exception Type" },
              { key: "failedAcademicRule", label: "Failed Academic Rule" },
              { key: "dateSubmitted", label: "Date Submitted" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
              { key: "actions", label: "Actions", render: (row) => <div className="cell-actions"><button className="table-action" type="button" onClick={() => setSelectedReference(row.reference)}>Review Case</button><button className="table-action" type="button" onClick={() => setSelectedReference(row.reference)}>View Academic Context</button></div> },
            ]}
          />
        ) : (
          <DataTable
            rowKey="reference"
            rows={resolved}
            emptyMessage="No academic review decisions have been recorded in this demo session."
            columns={[
              { key: "reference", label: "Case Reference", render: (row) => `ACR-${row.reference}` },
              { key: "studentNumber", label: "Student Reference" },
              { key: "program", label: "Program" },
              { key: "subject", label: "Subject", render: (row) => row.subjects?.[0]?.code || "Academic Exception" },
              { key: "academicReviewDecision", label: "Decision", render: (row) => <StatusBadge value={row.academicReviewDecision === "APPROVED" ? "PASSED" : row.academicReviewDecision === "REJECTED" ? "FAILED" : "REQUIRES_REVIEW"} label={row.academicReviewDecision.replaceAll("_", " ")} /> },
              { key: "academicReviewReason", label: "Academic Reason" },
              { key: "academicReviewCoordinator", label: "Coordinator" },
              { key: "academicReviewDate", label: "Decision Date" },
              { key: "actions", label: "Actions", render: (row) => <button className="table-action" type="button" onClick={() => setSelectedReference(row.reference)}>View Details</button> },
            ]}
          />
        )}
      </Panel>

      {current ? (
        <div style={{ marginTop: 16 }}>
          <Panel
            title={`Academic Exception Review · ACR-${current.reference}`}
            subtitle="The Academic Coordinator does not perform final enrollment confirmation."
            actions={<Button variant="ghost" onClick={() => setSelectedReference(null)}>Close</Button>}
          >
            <div className="info-grid" style={{ marginBottom: 14 }}>
              <Info label="Student Reference" value={current.studentNumber} />
              <Info label="Program" value={current.program} />
              <Info label="Curriculum Version" value={current.curriculum} />
              <Info label="Year Level" value="Based on current student academic record" />
              <Info label="Academic Term" value={current.term} />
              <Info label="Subject" value={current.subjects?.[0]?.code || "Academic Exception"} />
              <Info label="Failed Rule" value={current.validationPreset === "review" ? "Automated rule requires academic judgment" : "Academic exception rule"} />
              <Info label="Required Prerequisite" value="See related subject rule" />
              <Info label="Existing Academic Condition" value={current.correctionReason || "Reviewable academic condition"} />
              <Info label="Exception Type" value="Defined Academic Exception" />
            </div>

            <Details
              items={[
                ["Registrar or System Note", current.correctionReason || "Enrollment validation routed this case for academic review."],
                ["Relevant Curriculum Requirement", current.curriculum],
                ["Related Prerequisite Rule", current.subjects?.[0]?.code ? `Review rules for ${current.subjects[0].code}` : "Not specified"],
                ["Submitted Date", current.submittedDate],
              ]}
            />

            {current.status === "NEEDS_ACADEMIC_REVIEW" ? (
              <div className="action-row" style={{ marginTop: 16 }}>
                <Button onClick={() => { setDecision("APPROVED"); setNote(""); setDialog(true); }}>Approve Exception</Button>
                <Button variant="danger" onClick={() => { setDecision("REJECTED"); setNote(""); setDialog(true); }}>Reject Exception</Button>
                <Button variant="secondary" onClick={() => { setDecision("RETURNED_FOR_CLARIFICATION"); setNote(""); setDialog(true); }}>Return for Clarification</Button>
              </div>
            ) : (
              <div className="notice" style={{ marginTop: 14 }}>
                Decision: {current.academicReviewDecision?.replaceAll("_", " ")}. Reason: {current.academicReviewReason}
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      <Modal
        open={dialog && Boolean(current)}
        title="Confirm Academic Decision"
        onClose={() => setDialog(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={confirmDecision}>Confirm Decision</Button>
          </>
        }
      >
        <Details
          items={[
            ["Case Reference", current ? `ACR-${current.reference}` : ""],
            ["Decision", decision.replaceAll("_", " ")],
            ["Effective Scope", "This student and this enrollment transaction only"],
          ]}
        />
        <label className="field full" style={{ marginTop: 14 }}>
          Academic Reason or Decision Note
          <textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain the academic basis for the decision" />
        </label>
        <p className="notice" style={{ marginTop: 12 }}>
          Approved exceptions return to Registrar validation. Rejected exceptions return the transaction for correction. The Academic Coordinator does not confirm enrollment.
        </p>
      </Modal>
    </>
  );
}
