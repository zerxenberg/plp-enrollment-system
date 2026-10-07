"use client";

import { useMemo, useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { findScheduleConflicts, validateStudentEnrollment } from "@/lib/validation/enrollment-validation";
import { Button, Card, DataTable, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

const STAGES = [
  "Enrollment Overview",
  "Academic Eligibility",
  "Subject Registration",
  "Section and Schedule Selection",
  "Review and Validation",
  "Submit Enrollment",
  "Enrollment Status",
  "Enrollment History",
];

const LOCKED_STATUSES = new Set(["SUBMITTED", "FOR_VALIDATION", "NEEDS_ACADEMIC_REVIEW", "VALIDATED", "CONFIRMED"]);

function StageHeader({ title, description }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function StudentEnrollment() {
  const {
    student,
    catalog,
    addStudentSubject,
    removeStudentSubject,
    selectStudentSection,
    submitStudentEnrollment,
  } = useDemoData();
  const [activeStage, setActiveStage] = useState(1);
  const [subjectTab, setSubjectTab] = useState("All");
  const [subjectDetailCode, setSubjectDetailCode] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");

  const selectedSubjects = useMemo(
    () => student.enrollment.selectedSubjectCodes
      .map((code) => catalog.subjects.find((subject) => subject.code === code))
      .filter(Boolean),
    [catalog.subjects, student.enrollment.selectedSubjectCodes],
  );
  const totalUnits = selectedSubjects.reduce((sum, subject) => sum + subject.units, 0);
  const completedCodes = new Set(
    student.academicResults
      .filter((item) => item.status === "COMPLETED" || item.status === "CREDITED")
      .map((item) => item.code),
  );
  const validationChecks = [
    {
      key: "admission",
      label: "Admission Complete",
      result: student.profile.admissionCompletionStatus === "Completed" ? "PASSED" : "FAILED",
      detail: student.profile.admissionCompletionStatus,
    },
    ...validateStudentEnrollment(student, catalog),
  ];
  const allChecksPassed = validationChecks.every((check) => check.result === "PASSED");
  const locked = LOCKED_STATUSES.has(student.enrollment.status);
  const scheduleConflicts = findScheduleConflicts(student.enrollment.selectedSections, catalog.sections);
  const hasAllSections = selectedSubjects.length > 0 && selectedSubjects.every((subject) => student.enrollment.selectedSections[subject.code]);
  const subjectRows = subjectTab === "All"
    ? catalog.subjects
    : catalog.subjects.filter((subject) => subject.category === subjectTab);

  function goToStage(stage) {
    setActiveStage(stage);
    setSubmitMessage("");
  }

  function submitEnrollment() {
    if (!allChecksPassed) {
      setSubmitMessage("Complete every required validation before submitting your enrollment.");
      setActiveStage(5);
      return;
    }
    const result = submitStudentEnrollment();
    if (!result.ok) {
      setSubmitMessage("Enrollment could not be submitted because a current validation failed.");
      setActiveStage(5);
      return;
    }
    setSubmitMessage("Enrollment submitted successfully. Its canonical status is now Submitted and it is ready for official processing.");
    setActiveStage(7);
  }

  function renderOverview() {
    return (
      <>
        <StageHeader title="Enrollment Overview" description="Confirm the active term, student context, and whether you can continue enrollment." />
        <div className="info-grid">
          <div className="info-item"><span>Current Term</span><strong>{student.term.label}</strong></div>
          <div className="info-item"><span>Program</span><strong>{student.profile.program}</strong></div>
          <div className="info-item"><span>Year Level</span><strong>{student.profile.yearLevel}</strong></div>
          <div className="info-item"><span>Student Type</span><strong>{student.profile.studentType}</strong></div>
          <div className="info-item"><span>Academic Classification</span><strong><StatusBadge value={student.profile.academicClassification} /></strong></div>
          <div className="info-item"><span>Enrollment Status</span><strong><StatusBadge value={student.enrollment.status} /></strong></div>
        </div>
        <div className="notice" style={{ marginTop: 14 }}>
          Enrollment is {student.term.status.toLowerCase()} from {student.term.enrollmentStart} to {student.term.enrollmentEnd}.
          Your current eligibility is <strong>{student.enrollment.eligibilityStatus.replaceAll("_", " ")}</strong>.
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <Button onClick={() => goToStage(2)} disabled={student.enrollment.eligibilityStatus !== "ELIGIBLE"}>Review Academic Eligibility</Button>
          <Button variant="secondary" onClick={() => goToStage(7)}>View Current Status</Button>
        </div>
      </>
    );
  }

  function renderEligibility() {
    const completed = student.academicResults.filter((item) => item.status === "COMPLETED");
    const credited = student.academicResults.filter((item) => item.status === "CREDITED");
    const failed = student.academicResults.filter((item) => item.status === "FAILED");
    const incomplete = student.academicResults.filter((item) => item.status === "INCOMPLETE");
    const retake = catalog.subjects.filter((item) => item.eligibility === "RETAKE");
    const restricted = catalog.subjects.filter((item) => item.eligibility === "RESTRICTED");
    const prerequisiteChecks = catalog.subjects
      .filter((item) => item.prerequisites.length)
      .map((subject) => ({
        code: subject.code,
        satisfied: subject.prerequisites.every((code) => completedCodes.has(code)),
      }));
    const satisfiedPrerequisites = prerequisiteChecks.filter((item) => item.satisfied).length;
    return (
      <>
        <StageHeader title="Academic Eligibility" description="Enrollment evaluates completion results, deficiencies, prerequisites, curriculum, and progression before subject registration." />
        <div className="summary-strip">
          <span>Classification: <strong>{student.profile.academicClassification}</strong></span>
          <span>Progression: <strong>{student.profile.progressionStatus.replaceAll("_", " ")}</strong></span>
          <span>Completed: <strong>{completed.length}</strong></span>
          <span>Credited: <strong>{credited.length}</strong></span>
          <span>Prerequisite checks satisfied: <strong>{satisfiedPrerequisites} of {prerequisiteChecks.length}</strong></span>
          <span>Maximum demo load: <strong>{student.enrollment.demoMaximumUnits} units</strong></span>
        </div>
        <div className="content-grid" style={{ marginTop: 14 }}>
          <div className="span-4">
            <div className="list-stack">
              <div className="list-item">
                <div className="list-item-header"><strong>Completed Subjects</strong><StatusBadge value="COMPLETED" label={String(completed.length)} /></div>
                <p>{completed.length ? completed.map((item) => `${item.code} ${item.name}`).join(", ") : "No completed subjects are available."}</p>
              </div>
              <div className="list-item">
                <div className="list-item-header"><strong>Credited Subjects</strong><StatusBadge value="CREDITED" label={String(credited.length)} /></div>
                <p>{credited.length ? credited.map((item) => `${item.code} ${item.name}`).join(", ") : "No credited subjects are available."}</p>
              </div>
            </div>
          </div>
          <div className="span-4">
            <div className="list-stack">
              <div className="list-item">
                <div className="list-item-header"><strong>Failed Subjects</strong><StatusBadge value={failed.length ? "FAILED" : "PASSED"} label={String(failed.length)} /></div>
                <p>{failed.length ? failed.map((item) => `${item.code} ${item.name}`).join(", ") : "No failed subjects in the available records."}</p>
              </div>
              <div className="list-item">
                <div className="list-item-header"><strong>Incomplete Subjects</strong><StatusBadge value={incomplete.length ? "INCOMPLETE" : "PASSED"} label={String(incomplete.length)} /></div>
                <p>{incomplete.length ? incomplete.map((item) => `${item.code} ${item.name}`).join(", ") : "No incomplete subjects in the available records."}</p>
              </div>
            </div>
          </div>
          <div className="span-4">
            <div className="list-stack">
              <div className="list-item">
                <div className="list-item-header"><strong>Recommended Retakes</strong><StatusBadge value={retake.length ? "RETAKE" : "PASSED"} label={String(retake.length)} /></div>
                <p>{retake.length ? retake.map((item) => `${item.code} ${item.name}`).join(", ") : "No retake subjects are currently recommended."}</p>
              </div>
              <div className="list-item">
                <div className="list-item-header"><strong>Restricted Subjects</strong><StatusBadge value={restricted.length ? "RESTRICTED" : "PASSED"} label={String(restricted.length)} /></div>
                <p>{restricted.length ? restricted.map((item) => `${item.code}: ${item.restrictionReason}`).join(" ") : "No subject restrictions are active."}</p>
              </div>
              <div className="list-item">
                <div className="list-item-header"><strong>Prerequisite Completion</strong><StatusBadge value={satisfiedPrerequisites === prerequisiteChecks.length ? "PASSED" : "FAILED"} /></div>
                <p>{prerequisiteChecks.map((item) => `${item.code}: ${item.satisfied ? "Satisfied" : "Not satisfied"}`).join(", ")}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="notice warning" style={{ marginTop: 14 }}>
          A failed prerequisite restricts only the dependent subject. Other eligible subjects remain available for registration.
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <Button onClick={() => goToStage(3)} disabled={locked}>Continue to Subject Registration</Button>
          <Button variant="secondary" onClick={() => goToStage(1)}>Back to Overview</Button>
        </div>
      </>
    );
  }

  function renderSubjectRegistration() {
    const categories = ["All", "Recommended", "Required", "Retake", "Other Eligible", "Restricted"];
    const subjectDetail = catalog.subjects.find((subject) => subject.code === subjectDetailCode);
    return (
      <>
        <StageHeader title="Subject Registration" description="Add only subjects permitted by your curriculum, completion results, prerequisites, and current term offering." />
        {locked ? <div className="notice warning">Subject editing is locked while the enrollment is {student.enrollment.status.replaceAll("_", " ")}.</div> : null}
        <div className="tabs">
          {categories.map((category) => (
            <button key={category} className={`tab-button ${subjectTab === category ? "is-active" : ""}`} type="button" onClick={() => setSubjectTab(category)}>
              {category}
            </button>
          ))}
        </div>
        <DataTable
          rowKey="code"
          rows={subjectRows}
          columns={[
            { key: "code", label: "Subject Code" },
            { key: "name", label: "Subject Name" },
            { key: "units", label: "Units" },
            { key: "category", label: "Category" },
            {
              key: "prerequisites",
              label: "Prerequisites",
              render: (row) => row.prerequisites.length
                ? row.prerequisites.map((code) => `${code} ${completedCodes.has(code) ? "Completed" : "Not completed"}`).join(", ")
                : "None",
            },
            { key: "eligibility", label: "Eligibility", render: (row) => <StatusBadge value={row.eligibility} /> },
            {
              key: "action",
              label: "Action",
              render: (row) => {
                const selected = student.enrollment.selectedSubjectCodes.includes(row.code);
                const restricted = row.eligibility === "RESTRICTED";
                return (
                  <div className="cell-actions">
                    {selected ? (
                      <button className="table-action" type="button" disabled={locked} onClick={() => removeStudentSubject(row.code)}>Remove</button>
                    ) : (
                      <button className="table-action" type="button" disabled={locked || restricted} onClick={() => addStudentSubject(row.code)}>Add Subject</button>
                    )}
                    <button className="table-action" type="button" onClick={() => setSubjectDetailCode(row.code)}>View Subject</button>
                    {row.prerequisites.length ? <button className="table-action" type="button" onClick={() => setSubjectDetailCode(row.code)}>View Prerequisites</button> : null}
                    {restricted ? <button className="table-action" type="button" onClick={() => setSubjectDetailCode(row.code)}>View Restriction Reason</button> : null}
                  </div>
                );
              },
            },
          ]}
        />
        {subjectDetail ? (
          <div className="list-item" style={{ marginTop: 12 }}>
            <div className="list-item-header">
              <strong>{subjectDetail.code} • {subjectDetail.name}</strong>
              <StatusBadge value={subjectDetail.eligibility} />
            </div>
            <div className="info-grid" style={{ marginTop: 10 }}>
              <div className="info-item"><span>Units</span><strong>{subjectDetail.units}</strong></div>
              <div className="info-item"><span>Year and Semester</span><strong>{subjectDetail.yearLevel} • {subjectDetail.semester}</strong></div>
              <div className="info-item"><span>Prerequisites</span><strong>{subjectDetail.prerequisites.length ? subjectDetail.prerequisites.join(", ") : "None"}</strong></div>
              <div className="info-item"><span>Restriction Reason</span><strong>{subjectDetail.restrictionReason || "No active restriction"}</strong></div>
            </div>
          </div>
        ) : null}
        <div className="summary-strip" style={{ marginTop: 12 }}>
          <span>Selected subjects: <strong>{selectedSubjects.length}</strong></span>
          <span>Total units: <strong>{totalUnits}</strong></span>
          <span>Maximum demo units: <strong>{student.enrollment.demoMaximumUnits}</strong></span>
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <Button onClick={() => goToStage(4)} disabled={!selectedSubjects.length}>Continue to Section Selection</Button>
          <Button variant="secondary" onClick={() => goToStage(2)}>Back to Eligibility</Button>
        </div>
      </>
    );
  }

  function renderSectionSelection() {
    return (
      <>
        <StageHeader title="Section and Schedule Selection" description="Choose one open section with remaining capacity for every selected subject." />
        <div className="list-stack">
          {selectedSubjects.map((subject) => {
            const sections = catalog.sections.filter((section) => section.subjectCode === subject.code);
            const selectedId = student.enrollment.selectedSections[subject.code] || "";
            return (
              <div className="list-item" key={subject.code}>
                <div className="list-item-header">
                  <strong>{subject.code} • {subject.name}</strong>
                  <StatusBadge value={selectedId ? "PASSED" : "IN_PROGRESS"} label={selectedId ? "Section Selected" : "Choose Section"} />
                </div>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Available Section</span>
                  <select
                    value={selectedId}
                    disabled={locked}
                    onChange={(event) => selectStudentSection(subject.code, event.target.value)}
                  >
                    <option value="">Select a section</option>
                    {sections.map((section) => {
                      const remaining = section.capacity - section.enrolled;
                      const unavailable = section.status !== "OPEN" || remaining <= 0;
                      return (
                        <option key={section.id} value={section.id} disabled={unavailable}>
                          {section.section} • {section.day} • {section.displayTime} • {section.room} • {remaining} slots
                        </option>
                      );
                    })}
                  </select>
                </label>
                {selectedId ? (() => {
                  const selectedSection = sections.find((section) => section.id === selectedId);
                  if (!selectedSection) return null;
                  const remaining = selectedSection.capacity - selectedSection.enrolled;
                  return (
                    <div className="summary-strip" style={{ marginTop: 10 }}>
                      <span>Status: <strong>{selectedSection.status}</strong></span>
                      <span>Capacity: <strong>{selectedSection.capacity}</strong></span>
                      <span>Available Slots: <strong>{remaining}</strong></span>
                      <span>Schedule: <strong>{selectedSection.day} • {selectedSection.displayTime}</strong></span>
                      <span>Room: <strong>{selectedSection.room}</strong></span>
                    </div>
                  );
                })() : null}
              </div>
            );
          })}
        </div>
        {!selectedSubjects.length ? <div className="notice warning">Select at least one subject before choosing sections.</div> : null}
        {scheduleConflicts.length ? (
          <div className="notice danger" style={{ marginTop: 12 }}>
            <strong>Schedule conflict detected.</strong>
            <p>{scheduleConflicts.map(([first, second]) => `${first.subjectCode} conflicts with ${second.subjectCode} on ${first.day}.`).join(" ")}</p>
          </div>
        ) : hasAllSections ? (
          <div className="notice" style={{ marginTop: 12 }}>Every selected subject has a section and no schedule conflict is currently detected.</div>
        ) : (
          <div className="notice warning" style={{ marginTop: 12 }}>Choose a section for every selected subject before continuing.</div>
        )}
        <div className="action-row" style={{ marginTop: 12 }}>
          <Button onClick={() => goToStage(5)} disabled={!hasAllSections || scheduleConflicts.length > 0}>Review and Validate</Button>
          <Button variant="secondary" onClick={() => goToStage(3)}>Back to Subjects</Button>
        </div>
      </>
    );
  }

  function renderValidation() {
    return (
      <>
        <StageHeader title="Review and Validation" description="Review your complete plan and rerun every required frontend validation before submission." />
        <div className="summary-strip">
          <span>Student: <strong>{student.profile.studentNumber}</strong></span>
          <span>Program: <strong>{student.profile.programCode}</strong></span>
          <span>Curriculum: <strong>{student.profile.curriculum}</strong></span>
          <span>Total units: <strong>{totalUnits}</strong></span>
        </div>
        <DataTable
          rowKey="key"
          rows={validationChecks}
          columns={[
            { key: "label", label: "Validation" },
            { key: "result", label: "Result", render: (row) => <StatusBadge value={row.result} /> },
            { key: "detail", label: "Details" },
          ]}
        />
        <div className={`notice ${allChecksPassed ? "" : "danger"}`} style={{ marginTop: 12 }}>
          {allChecksPassed
            ? "All current frontend checks passed. You can continue to final submission."
            : "One or more required checks failed. Correct the affected subject or section before submission."}
        </div>
        {submitMessage ? <div className="notice warning" style={{ marginTop: 10 }}>{submitMessage}</div> : null}
        <div className="action-row" style={{ marginTop: 12 }}>
          <Button onClick={() => goToStage(6)} disabled={!allChecksPassed || locked}>Continue to Submit</Button>
          <Button variant="secondary" onClick={() => goToStage(3)} disabled={locked}>Return to Subjects</Button>
          <Button variant="ghost" onClick={() => goToStage(4)} disabled={locked}>Change Section</Button>
        </div>
      </>
    );
  }

  function renderSubmit() {
    return (
      <>
        <StageHeader title="Submit Enrollment" description="Confirm your final subject and section selections. Submission sends the transaction to Registrar validation." />
        <div className="info-grid">
          <div className="info-item"><span>Academic Term</span><strong>{student.term.label}</strong></div>
          <div className="info-item"><span>Total Subjects</span><strong>{selectedSubjects.length}</strong></div>
          <div className="info-item"><span>Total Units</span><strong>{totalUnits}</strong></div>
          <div className="info-item"><span>Validation</span><strong><StatusBadge value={allChecksPassed ? "PASSED" : "FAILED"} /></strong></div>
        </div>
        <div className="notice warning" style={{ marginTop: 14 }}>
          Submit Enrollment is not official approval. Your enrollment becomes official only after Registrar validation and final confirmation.
        </div>
        {submitMessage ? <div className="notice" style={{ marginTop: 10 }}>{submitMessage}</div> : null}
        <div className="action-row" style={{ marginTop: 12 }}>
          <Button onClick={submitEnrollment} disabled={!allChecksPassed || locked}>Submit Enrollment</Button>
          <Button variant="secondary" onClick={() => goToStage(5)}>Go Back</Button>
          <Button variant="ghost" onClick={() => goToStage(1)}>Cancel Review</Button>
        </div>
      </>
    );
  }

  function renderStatus() {
    const timeline = ["IN_PROGRESS", "SUBMITTED", "FOR_VALIDATION", "NEEDS_ACADEMIC_REVIEW", "REQUIRES_CORRECTION", "VALIDATED", "CONFIRMED"];
    return (
      <>
        <StageHeader title="Enrollment Status" description="Track the current transaction, Registrar feedback, correction state, and confirmation details." />
        <div className="info-grid">
          <div className="info-item"><span>Enrollment Reference</span><strong>{student.enrollment.reference}</strong></div>
          <div className="info-item"><span>Current Status</span><strong><StatusBadge value={student.enrollment.status} /></strong></div>
          <div className="info-item"><span>Submitted Date</span><strong>{student.enrollment.submittedDate || "Not submitted yet"}</strong></div>
          <div className="info-item"><span>Total Units</span><strong>{totalUnits}</strong></div>
        </div>
        <div className="list-stack" style={{ marginTop: 14 }}>
          {timeline.map((status) => (
            <div className="list-item" key={status}>
              <div className="list-item-header">
                <strong>{status.replaceAll("_", " ")}</strong>
                <StatusBadge value={student.enrollment.status === status ? status : "READ"} label={student.enrollment.status === status ? "Current" : "Stage"} />
              </div>
            </div>
          ))}
        </div>
        {student.enrollment.status === "REQUIRES_CORRECTION" ? (
          <div className="notice danger" style={{ marginTop: 12 }}>
            <strong>Correction required.</strong>
            <p>{student.enrollment.correctionReason || "Review the Registrar feedback and edit the same enrollment transaction."}</p>
            <p>Open Subject Registration, correct the returned item, revalidate the same transaction, then submit it again.</p>
          </div>
        ) : null}
        {student.enrollment.status === "CONFIRMED" ? (
          <div className="notice" style={{ marginTop: 12 }}>
            Confirmation reference: <strong>{student.enrollment.confirmationReference || "Available after confirmation"}</strong>
            {student.enrollment.confirmationDate ? ` • ${student.enrollment.confirmationDate}` : ""}
          </div>
        ) : null}
        {submitMessage ? <div className="notice" style={{ marginTop: 10 }}>{submitMessage}</div> : null}
        <div className="action-row" style={{ marginTop: 12 }}>
          {student.enrollment.status === "REQUIRES_CORRECTION" ? <Button onClick={() => goToStage(3)}>Edit Enrollment</Button> : null}
          <Button variant="secondary" onClick={() => goToStage(8)}>View Enrollment History</Button>
          <Button variant="ghost" onClick={() => window.print()}>{student.enrollment.status === "CONFIRMED" ? "Print Enrollment Summary" : "Print Status Summary"}</Button>
        </div>
      </>
    );
  }

  function renderHistory() {
    return (
      <>
        <StageHeader title="Enrollment History" description="View confirmed enrollment records from previous academic terms." />
        <DataTable
          rowKey={(row) => `${row.term}-${row.confirmationDate}`}
          rows={student.enrollmentHistory}
          columns={[
            { key: "term", label: "Academic Term" },
            { key: "program", label: "Program" },
            { key: "units", label: "Units" },
            { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            { key: "confirmationDate", label: "Confirmation Date" },
          ]}
        />
        <div className="notice" style={{ marginTop: 12 }}>
          Confirmed historical transactions are read only through ordinary Student self service pages.
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={() => window.print()}>Print Enrollment History</Button>
        </div>
      </>
    );
  }

  const renderStage = [
    renderOverview,
    renderEligibility,
    renderSubjectRegistration,
    renderSectionSelection,
    renderValidation,
    renderSubmit,
    renderStatus,
    renderHistory,
  ][activeStage - 1];

  return (
    <>
      <PageHeader
        title="Enrollment"
        description="Complete academic eligibility, subject registration, section selection, validation, submission, status tracking, and history in one guided workflow."
      />
      <Card className="section-card">
        <div className="tabs step-tabs" aria-label="Enrollment stages">
          {STAGES.map((stage, index) => (
            <button
              key={stage}
              className={`tab-button ${activeStage === index + 1 ? "is-active" : ""}`}
              type="button"
              onClick={() => goToStage(index + 1)}
            >
              {index + 1}. {stage}
            </button>
          ))}
        </div>
        {renderStage()}
      </Card>
    </>
  );
}
