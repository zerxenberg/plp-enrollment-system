"use client";

import { useMemo, useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { DataTable, FilterControl, InternalTabs, PageHeader, SearchControl, StatusBadge } from "@/components/ui/PortalUI";

const TABS = ["Academic Overview", "Subject History", "Curriculum Progress", "Deficiencies", "Prerequisite Progress"];

export default function StudentAcademicRecords() {
  const { student, catalog } = useDemoData();
  const [activeTab, setActiveTab] = useState("Academic Overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [termFilter, setTermFilter] = useState("ALL");

  const history = useMemo(() => student.academicResults.filter((item) => {
    const matchesSearch = `${item.code} ${item.name}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    const matchesTerm = termFilter === "ALL" || item.term === termFilter;
    return matchesSearch && matchesStatus && matchesTerm;
  }), [search, statusFilter, student.academicResults, termFilter]);

  const completed = student.academicResults.filter((item) => item.status === "COMPLETED");
  const credited = student.academicResults.filter((item) => item.status === "CREDITED");
  const deficiencies = student.academicResults.filter((item) => item.status === "FAILED" || item.status === "INCOMPLETE");
  const restricted = catalog.subjects.filter((item) => item.eligibility === "RESTRICTED");
  const progressPercent = Math.round(((completed.length + credited.length) / Math.max(student.academicResults.length + catalog.subjects.length, 1)) * 100);

  function renderTab() {
    if (activeTab === "Academic Overview") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Program</span><strong>{student.profile.program}</strong></div>
            <div className="info-item"><span>Curriculum</span><strong>{student.profile.curriculum}</strong></div>
            <div className="info-item"><span>Year Level</span><strong>{student.profile.yearLevel}</strong></div>
            <div className="info-item"><span>Classification</span><strong><StatusBadge value={student.profile.academicClassification} /></strong></div>
            <div className="info-item"><span>Progression</span><strong><StatusBadge value={student.profile.progressionStatus} /></strong></div>
            <div className="info-item"><span>Completed or Credited</span><strong>{completed.length + credited.length}</strong></div>
            <div className="info-item"><span>Failed</span><strong>{student.academicResults.filter((item) => item.status === "FAILED").length}</strong></div>
            <div className="info-item"><span>Incomplete</span><strong>{student.academicResults.filter((item) => item.status === "INCOMPLETE").length}</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>Grades imported through the Registrar demo appear in Subject History only after publication. Unpublished or missing grades are never inferred.</div>
          <div className="notice" style={{ marginTop: 14 }}>
            Academic Records is read only enrollment support. It does not provide grade encoding, grade computation, or transcript generation.
          </div>
        </>
      );
    }

    if (activeTab === "Subject History") {
      return (
        <>
          <div className="toolbar">
            <SearchControl value={search} onChange={setSearch} placeholder="Search subject code or name" />
            <FilterControl
              label="Completion Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "ALL", label: "All statuses" },
                { value: "COMPLETED", label: "Completed" },
                { value: "FAILED", label: "Failed" },
                { value: "INCOMPLETE", label: "Incomplete" },
                { value: "CREDITED", label: "Credited" },
              ]}
            />
            <FilterControl
              label="Academic Term"
              value={termFilter}
              onChange={setTermFilter}
              options={[
                { value: "ALL", label: "All terms" },
                ...Array.from(new Set(student.academicResults.map((item) => item.term))).map((term) => ({ value: term, label: term })),
              ]}
            />
          </div>
          <DataTable
            rowKey={(row) => row.resultId || `${row.code}:${row.term}`}
            rows={history}
            columns={[
              { key: "code", label: "Subject Code" },
              { key: "name", label: "Subject Name" },
              { key: "units", label: "Units" },
              { key: "term", label: "Academic Term" },
              { key: "grade", label: "Grade", render: (row) => row.publicationReference ? <strong>{row.grade || "Not recorded"}</strong> : "Awaiting publication" },
              { key: "status", label: "Completion Status", render: (row) => <StatusBadge value={row.status} /> },
              { key: "source", label: "Result Source", render: (row) => row.publicationReference ? <span title={row.amendedAt ? `Corrected on ${new Date(row.amendedAt).toLocaleString()}` : row.publicationReference}>{row.amendedAt ? "Demo published · Corrected" : "Demo published"}</span> : "Historical demo completion" },
            ]}
          />
        </>
      );
    }

    if (activeTab === "Curriculum Progress") {
      return (
        <>
          <div className="summary-strip">
            <span>Curriculum: <strong>{student.profile.curriculum}</strong></span>
            <span>Completion estimate from demo records: <strong>{progressPercent}%</strong></span>
          </div>
          <div className="progress-track" style={{ marginTop: 12 }} aria-label={`${progressPercent}% curriculum progress`}>
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="list-stack" style={{ marginTop: 14 }}>
            {catalog.subjects.map((subject) => {
              const result = student.academicResults.find((item) => item.code === subject.code);
              const status = result?.status || subject.eligibility;
              return (
                <div className="list-item" key={subject.code}>
                  <div className="list-item-header">
                    <strong>{subject.code} • {subject.name}</strong>
                    <StatusBadge value={status} />
                  </div>
                  <p>{subject.yearLevel} • {subject.semester} • {subject.units} units</p>
                </div>
              );
            })}
          </div>
        </>
      );
    }

    if (activeTab === "Deficiencies") {
      return (
        <div className="list-stack">
          {deficiencies.map((item) => (
            <div className="list-item" key={item.code}>
              <div className="list-item-header">
                <strong>{item.code} • {item.name}</strong>
                <StatusBadge value={item.status} />
              </div>
              <p>{item.status === "FAILED" ? "Retake may be required when the subject is offered. Dependent subjects remain restricted until prerequisites are satisfied." : "Incomplete result remains a deficiency and is not treated as completed for prerequisite purposes."}</p>
            </div>
          ))}
          {restricted.map((subject) => (
            <div className="list-item" key={subject.code}>
              <div className="list-item-header">
                <strong>{subject.code} • {subject.name}</strong>
                <StatusBadge value="RESTRICTED" />
              </div>
              <p>{subject.restrictionReason}</p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <DataTable
        rowKey="code"
        rows={catalog.subjects.filter((subject) => subject.prerequisites.length)}
        columns={[
          { key: "code", label: "Future Subject" },
          { key: "prerequisites", label: "Required Prerequisite", render: (row) => row.prerequisites.join(", ") },
          {
            key: "completion",
            label: "Prerequisite Status",
            render: (row) => {
              const satisfied = row.prerequisites.every((code) =>
                student.academicResults.some((item) => item.code === code && (item.status === "COMPLETED" || item.status === "CREDITED")),
              );
              return <StatusBadge value={satisfied ? "PASSED" : "FAILED"} label={satisfied ? "Completed" : "Not Completed"} />;
            },
          },
          { key: "eligibility", label: "Eligibility Result", render: (row) => <StatusBadge value={row.eligibility} /> },
        ]}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Academic Records"
        description="Read only academic information used to explain enrollment eligibility, deficiencies, prerequisite progress, and curriculum progress."
      />
      <InternalTabs
        items={TABS.map((tab) => ({ value: tab, label: tab }))}
        selected={activeTab}
        onSelect={setActiveTab}
        label="Academic records sections"
        panelCard
      >
        {renderTab()}
      </InternalTabs>
    </>
  );
}
