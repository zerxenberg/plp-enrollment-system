"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, DataTable, FilterControl, Modal, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";
import { Panel, Tabs, Info, Details, Feedback } from "./RegistrarShared";
import AcademicFilterBar from "@/components/shared/AcademicFilterBar";
import { ALL_ACADEMIC_FILTERS, filterAcademicRecords, updateAcademicFilters } from "@/features/students/academic-student-filters";

const QUEUES = [
  {value:"ALL",label:"All"}, {value:"PENDING",label:"Pending (Submitted)"},
  {value:"FOR_VALIDATION",label:"For Validation"},
  {value:"NEEDS_ACADEMIC_REVIEW",label:"Needs Academic Review"},
  {value:"REQUIRES_CORRECTION",label:"Requires Correction"},
  {value:"VALIDATED",label:"Validated"}, {value:"CONFIRMED",label:"Confirmed"},
];
const CHECKS = ["Program Match", "Curriculum Match", "Duplicate Subject Check", "Prerequisite Check", "Unit Validation", "Section Slot Check", "Schedule Conflict Check"];
const CATEGORIES = ["Student Information", "Subject Registration", "Prerequisite", "Section Availability", "Schedule Conflict", "Unit Load", "Other"];

export default function RegistrarEnrollment() {
  const { registrar, catalog, runRegistrarValidation, returnForCorrection, confirmRegistrarEnrollment, applyAuthorizedCorrection } = useDemoData();
  const [queue, setQueue] = useState("ALL");
  const [search, setSearch] = useState("");
  const [academicFilters, setAcademicFilters] = useState(ALL_ACADEMIC_FILTERS);
  const [historyAcademicFilters, setHistoryAcademicFilters] = useState(ALL_ACADEMIC_FILTERS);
  const [sort, setSort] = useState("newest");
  const params = useSearchParams();
  const [referenceOverride, setReference] = useState(undefined);
  const reference = referenceOverride === undefined ? params.get("reference") : referenceOverride;
  const [detailTab, setDetailTab] = useState("subjects");
  const [dialog, setDialog] = useState(null);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [explanation, setExplanation] = useState("");
  const [affected, setAffected] = useState("");
  const [correctedInformation, setCorrectedInformation] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [feedback, setFeedback] = useState("");

  const enrollment = registrar.enrollments.find((item) => item.reference === reference);
  const canValidate = Boolean(enrollment && ["SUBMITTED", "FOR_VALIDATION", "VALIDATED"].includes(enrollment.status));
  const canReturn = Boolean(enrollment && ["FOR_VALIDATION", "VALIDATED"].includes(enrollment.status));
  const canConfirm = enrollment?.status === "VALIDATED";
  const histories = registrar.activity.filter((item) => item.reference === reference);

  const queueFiltered = registrar.enrollments.filter((item) => {
    const matchQueue = queue === "ALL" || (queue === "PENDING" ? item.status === "SUBMITTED" : item.status === queue);
    return matchQueue && `${item.reference} ${item.studentName} ${item.studentNumber} ${item.program}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const filtered = filterAcademicRecords(queueFiltered, academicFilters, [], catalog.programs)
    .sort((a,b)=>sort==="name" ? a.studentName.localeCompare(b.studentName) : sort==="program" ? a.program.localeCompare(b.program) : sort==="oldest" ? a.reference.localeCompare(b.reference) : b.reference.localeCompare(a.reference));
  const historicalTransactions = registrar.enrollments.filter((item) => ["CONFIRMED","CANCELLED"].includes(item.status));
  const historyRows = filterAcademicRecords(historicalTransactions, historyAcademicFilters, [], catalog.programs);
  const changeAcademicFilter = (key, value) => setAcademicFilters((previous) => key ? updateAcademicFilters(previous, key, value) : value);
  const changeHistoryAcademicFilter = (key, value) => setHistoryAcademicFilters((previous) => key ? updateAcademicFilters(previous, key, value) : value);

  function openReview(nextReference, nextTab = "subjects") {
    setReference(nextReference);
    setDetailTab(nextTab);
    setFeedback("");
  }

  function validate() {
    if (!canValidate) {setFeedback("Only Submitted, For Validation or Validated transactions can be validated in this demo.");return;}
    const previousStatus = enrollment.status;
    const result = runRegistrarValidation(enrollment.reference);
    setFeedback(result
      ? previousStatus === "SUBMITTED" && result === "FOR_VALIDATION"
        ? "Validation started. The enrollment is now For Validation. Run validation again to complete the demo checks."
        : `Demo validation completed. Enrollment status: ${result.replaceAll("_", " ")}.`
      : "Validation could not be completed.");
    setDetailTab("validation");
  }

  function sendCorrection(event) {
    event.preventDefault();
    if (!canReturn || !explanation.trim()) {setFeedback("This transaction cannot be returned, or its explanation is missing.");return;}
    const success = returnForCorrection(enrollment.reference, {category, explanation: explanation.trim(), affected: affected.trim()});
    setFeedback(success ? "Enrollment returned for correction. The reason is recorded in transaction history." : "The correction request was not saved.");
    if (success) setDialog(null);
  }

  function confirm() {
    if (!canConfirm) {setFeedback("Only a Validated enrollment can be confirmed.");return;}
    const success = confirmRegistrarEnrollment(enrollment.reference);
    setFeedback(success ? "Enrollment confirmed. The demo generated its confirmation reference and transaction history." : "Confirmation could not be completed.");
    if (success) setDialog(null);
  }

  function saveAuthorizedCorrection(event) {
    event.preventDefault();
    if (!enrollment || !correctedInformation.trim() || !correctionReason.trim()) {setFeedback("Corrected information and a reason are required.");return;}
    const success = applyAuthorizedCorrection(enrollment.reference, correctedInformation.trim(), correctionReason.trim());
    setFeedback(success ? "Authorized correction recorded in the transaction history." : "Authorized correction could not be saved.");
    if (success) setDialog(null);
  }

  return (
    <>
      <PageHeader title="Enrollment" description="Review official enrollment transactions, run demo validation, return corrections and confirm validated records." />
      <Tabs items={QUEUES.map((item) => ({...item,label:`${item.label} (${registrar.enrollments.filter((row) => item.value === "ALL" || (item.value === "PENDING" ? row.status === "SUBMITTED" : row.status === item.value)).length})`}))} selected={queue} onSelect={setQueue} label="Filter enrollment queue by status" filter />
      <Panel title="Enrollment Queue" subtitle="Pending is a queue view for Submitted only. Every stored enrollment retains its canonical status.">
        <div className="toolbar">
          <SearchControl label="Search enrollment" value={search} onChange={setSearch} placeholder="Search reference, student name or student number" />
          <FilterControl label="Sort By" value={sort} onChange={setSort} options={[{value:"newest",label:"Newest Reference"},{value:"oldest",label:"Oldest Reference"},{value:"name",label:"Student Name"},{value:"program",label:"Program"}]} />
          <Button type="button" variant="ghost" onClick={() => {setSearch("");setAcademicFilters(ALL_ACADEMIC_FILTERS);setQueue("ALL");setSort("newest");}}>Clear Filters</Button>
        </div>
        <AcademicFilterBar records={queueFiltered} programs={catalog.programs} departments={catalog.departments} value={academicFilters} onChange={changeAcademicFilter} matchingCount={filtered.length} label="Enrollment queue academic filters" />
        <DataTable rowKey="reference" rows={filtered} emptyMessage="No enrollment transactions match the selected filters." columns={[
          {key:"reference",label:"Enrollment Ref."},{key:"studentNumber",label:"Student No."},{key:"studentName",label:"Student"},
          {key:"program",label:"Program"},{key:"term",label:"Academic Term"},{key:"units",label:"Units"},
          {key:"status",label:"Status",render:(row)=><StatusBadge value={row.status} />},
          {key:"submittedDate",label:"Submitted"},
          {key:"actions",label:"Actions",render:(row)=><div className="cell-actions"><button className="table-action" type="button" onClick={() => openReview(row.reference)}>Review</button><Link className="table-action" href="/registrar/students">Students</Link><button className="table-action" type="button" onClick={() => openReview(row.reference,"history")}>History</button></div>}
        ]} />
      </Panel>

      {enrollment ? <div style={{marginTop:16}}>
        <Tabs selected={detailTab} onSelect={setDetailTab} label="Enrollment review sections" title={`Enrollment Review · ${enrollment.reference}`} subtitle="Current record, registered subjects, validation results and Registrar actions." actions={<Button type="button" variant="ghost" onClick={() => {setReference(null);setFeedback("");}}>Close Review</Button>} items={[{value:"subjects",label:"Registered Subjects"},{value:"validation",label:"Validation Summary"},{value:"history",label:"Transaction History"}]}>
        <div className="info-grid" style={{marginBottom:16}}>
          <Info label="Student Number" value={enrollment.studentNumber} />
          <Info label="Student" value={enrollment.studentName} />
          <Info label="Program" value={enrollment.program} />
          <Info label="Curriculum" value={enrollment.curriculum} />
          <Info label="Academic Term" value={enrollment.term} />
          <Info label="Total Units" value={enrollment.units} />
          <div className="info-item"><span>Current Enrollment Status</span><strong><StatusBadge value={enrollment.status} /></strong></div>
          <Info label="Submitted" value={enrollment.submittedDate} />
        </div>
        {detailTab === "subjects" ? <DataTable rowKey="code" rows={enrollment.subjects} columns={[{key:"code",label:"Subject Code"},{key:"name",label:"Subject Name"},{key:"units",label:"Units"},{key:"section",label:"Section"},{key:"schedule",label:"Schedule"},{key:"room",label:"Room"}]} /> : null}
        {detailTab === "validation" ? <>
          <div className="notice" style={{marginBottom:12}}>Demo validation uses the existing record validation preset. It does not independently verify live academic or section data.</div>
          <DataTable rowKey="rule" rows={CHECKS.map((rule) => ({rule,result:enrollment.lastValidatedAt ? enrollment.validationPreset === "pass" ? "PASSED" : enrollment.validationPreset === "review" ? "REQUIRES_REVIEW" : "FAILED" : "NOT_RUN"}))} columns={[{key:"rule",label:"Rule"},{key:"result",label:"Validation Result",render:(row)=><StatusBadge value={row.result} />}]} />
          <div className="summary-strip" style={{marginTop:12}}><span>Overall Validation Result: <strong><StatusBadge value={enrollment.lastValidatedAt ? enrollment.validationPreset === "pass" ? "PASSED" : enrollment.validationPreset === "review" ? "REQUIRES_REVIEW" : "FAILED" : "NOT_RUN"} /></strong></span><span>Last validated: <strong>{enrollment.lastValidatedAt || "Not run during this demo session"}</strong></span></div>
        </> : null}
        {detailTab === "history" ? <><DataTable rowKey="id" rows={histories} emptyMessage="No transaction history is recorded yet." columns={[{key:"date",label:"Date & Time"},{key:"registrar",label:"Responsible Registrar"},{key:"action",label:"Action"},{key:"previousStatus",label:"Previous"},{key:"newStatus",label:"Result"},{key:"reason",label:"Reason"}]} />{enrollment.confirmationReference ? <div className="summary-strip" style={{marginTop:12}}><span>Confirmation: <strong>{enrollment.confirmationReference}</strong></span><span>Date: <strong>{enrollment.confirmationDate}</strong></span></div> : null}</> : null}
        {enrollment.correctionReason ? <div className="notice warning" style={{marginTop:12}}>Correction reason: {enrollment.correctionReason}</div> : null}
        {enrollment.authorizedCorrection ? <div className="notice" style={{marginTop:12}}>Last authorized correction: {enrollment.authorizedCorrection}. Reason: {enrollment.authorizedCorrectionReason}</div> : null}
        <div className="action-row" style={{marginTop:16}}>
          <Button type="button" disabled={!canValidate} onClick={validate}>{enrollment.lastValidatedAt || enrollment.status === "VALIDATED" ? "Revalidate" : "Run Validation"}</Button>
          <Button type="button" variant="secondary" disabled={!canReturn} onClick={() => {setCategory(CATEGORIES[0]);setExplanation("");setAffected("");setDialog("return");}}>Return for Correction</Button>
          <Button type="button" variant="secondary" disabled={enrollment.status === "CANCELLED"} onClick={() => {setCorrectedInformation("");setCorrectionReason("");setDialog("correct");}}>Authorized Correction</Button>
          <Button type="button" disabled={!canConfirm} onClick={() => setDialog("confirm")}>Confirm Enrollment</Button>
          <Button type="button" variant="ghost" onClick={() => setDetailTab("history")}>View History</Button>
        </div>
        {enrollment.status === "NEEDS_ACADEMIC_REVIEW" ? <p className="notice warning" style={{marginTop:12}}>An Academic Coordinator decision is required before Registrar validation can continue.</p> : null}
        {enrollment.status === "CONFIRMED" ? <p className="notice" style={{marginTop:12}}>This confirmed transaction is protected from ordinary edits and deletion. Only traceable, authorized corrections are permitted.</p> : null}
        <Feedback message={feedback} />
        </Tabs>
      </div> : reference ? <p className="notice warning" role="status">Enrollment reference {reference} was not found. Select another transaction from the queue.</p> : null}

      <div style={{marginTop:16}}><Panel title="Enrollment History" subtitle="Official confirmed and past transaction records stay available for review and audit.">
        <AcademicFilterBar records={historicalTransactions} programs={catalog.programs} departments={catalog.departments} value={historyAcademicFilters} onChange={changeHistoryAcademicFilter} matchingCount={historyRows.length} label="Enrollment history academic filters" />
        <DataTable rowKey="reference" rows={historyRows} emptyMessage="No historical enrollment records match the selected academic filters." columns={[{key:"reference",label:"Reference"},{key:"studentName",label:"Student"},{key:"term",label:"Term"},{key:"status",label:"Status",render:(row)=><StatusBadge value={row.status} />},{key:"confirmationReference",label:"Confirmation Reference"},{key:"confirmationDate",label:"Confirmed On"},{key:"actions",label:"Actions",render:(row)=><button type="button" className="table-action" onClick={() => openReview(row.reference,"history")}>View Details</button>}]} />
      </Panel></div>

      <Modal open={dialog === "return" && Boolean(enrollment)} title="Return for Correction" onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="registrar-return-form">Return for Correction</Button></>}>
        <form id="registrar-return-form" className="form-grid" onSubmit={sendCorrection}>
          <label className="field full">Reason Category<select required value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field full">Explanation<textarea required value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Describe what the student must correct" /></label>
          <label className="field full">Affected Subject, Section or Field (optional)<input value={affected} onChange={(event) => setAffected(event.target.value)} placeholder="e.g. IT302 / CTC 205" /></label>
        </form>
        <p className="notice warning" style={{marginTop:12}}>This records a Registrar correction reason and sets the transaction to Requires Correction.</p>
      </Modal>
      <Modal open={dialog === "correct" && Boolean(enrollment)} title="Authorized Enrollment Correction" onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" form="registrar-correction-form">Record Correction</Button></>}>
        <form id="registrar-correction-form" className="form-grid" onSubmit={saveAuthorizedCorrection}>
          <div className="field full"><Details items={[["Enrollment",enrollment?.reference],["Current Status",enrollment?.status]]} /></div>
          <label className="field full">Corrected Information<textarea required value={correctedInformation} onChange={(event) => setCorrectedInformation(event.target.value)} placeholder="Describe the approved record correction" /></label>
          <label className="field full">Correction Reason<textarea required value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Why was this correction authorized?" /></label>
        </form>
        <p className="notice" style={{marginTop:12}}>This demo records a correction annotation and audit entry; official confirmed record fields remain intact.</p>
      </Modal>
      <Modal open={dialog === "confirm" && Boolean(enrollment)} title="Confirm Enrollment" onClose={() => setDialog(null)} footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={!canConfirm} onClick={confirm}>Confirm Enrollment</Button></>}>
        <Details items={[["Student", enrollment?.studentName],["Academic Term",enrollment?.term],["Subject Count",enrollment?.subjects.length],["Total Units",enrollment?.units],["Current Status",enrollment?.status]]} />
        <p className="notice" style={{marginTop:12}}>Confirmation completes official term enrollment and generates a confirmation reference.</p>
      </Modal>
    </>
  );
}
