"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/PortalUI";
import { Panel } from "./RegistrarShared";
import {
  previewSandboxGradeImport,
  stageSandboxGradeImport,
} from "@/features/grade-import/registrar-grade-actions";

const SUBJECTS = [
  { code: "P8F26-BSIT-T01-M1", name: "Introduction to Computing" },
  { code: "P8F26-BSIT-T01-M2", name: "Computer Programming 1" },
  { code: "P8F26-BSIT-T01-M3", name: "Digital Systems Fundamentals" },
  { code: "P8F26-BSIT-T01-M4", name: "Computer Systems Servicing" },
  { code: "P8F26-GE-T01-1", name: "Understanding the Self" },
  { code: "P8F26-GE-T01-2", name: "Purposive Communication" },
  { code: "P8F26-GE-T01-3", name: "Mathematics in the Modern World" },
];

export default function RegistrarSandboxGradeImports() {
  const [subjectCode, setSubjectCode] = useState(SUBJECTS[0].code);
  const [file, setFile] = useState(null);
  const [sourceReference, setSourceReference] = useState("PLP-DEMO-SANDBOX-2026-001");
  const [issuer, setIssuer] = useState("PLP Enrollment System Demonstration Sandbox");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function buildFormData() {
    const form = new FormData();
    form.set("file", file);
    form.set("academic_year", "2026 to 2027");
    form.set("semester", "First Semester");
    form.set("college_code", "CCS");
    form.set("program_code", "BSIT");
    form.set("subject_code", subjectCode);
    form.set("section_code", "BSIT-1A");
    form.set("source_reference", sourceReference);
    form.set("issuer", issuer);
    return form;
  }

  function previewFile() {
    if (!file) return;
    setError("");
    setResult(null);
    const form = buildFormData();
    startTransition(async () => {
      try {
        const data = await previewSandboxGradeImport(form);
        setPreview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sandbox preview failed.");
      }
    });
  }

  function stageFile() {
    if (!file || !preview || preview.invalidRows) return;
    setError("");
    const form = buildFormData();
    startTransition(async () => {
      try {
        const data = await stageSandboxGradeImport(form);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sandbox staging failed.");
      }
    });
  }

  return (
    <Panel
      title="Sandbox Grade Import"
      subtitle="Test spreadsheet parsing and database staging with synthetic students. This workflow cannot publish official academic results."
    >
      <div className="notice warning" style={{ marginBottom: 14 }}>
        <strong>Sandbox only. No official grade publication.</strong>
        <p>Files are accepted only for the synthetic PLP demonstration section and are stored in isolated sandbox tables. Every source record must begin with DEMO_ONLY:.</p>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Academic Year</span>
          <input value="2026 to 2027" readOnly />
        </label>
        <label className="field">
          <span>Semester</span>
          <input value="First Semester" readOnly />
        </label>
        <label className="field">
          <span>College</span>
          <input value="CCS · College of Computer Studies" readOnly />
        </label>
        <label className="field">
          <span>Program</span>
          <input value="BSIT · BS Information Technology" readOnly />
        </label>
        <label className="field">
          <span>Subject</span>
          <select value={subjectCode} disabled={pending || Boolean(result)} onChange={(event) => { setSubjectCode(event.target.value); setPreview(null); setResult(null); }}>
            {SUBJECTS.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Subject Section</span>
          <input value="BSIT-1A · Synthetic demonstration section" readOnly />
        </label>
        <label className="field">
          <span>Sandbox Source Reference</span>
          <input value={sourceReference} disabled={pending || Boolean(result)} onChange={(event) => setSourceReference(event.target.value)} required />
        </label>
        <label className="field">
          <span>Issuer</span>
          <input value={issuer} disabled={pending || Boolean(result)} onChange={(event) => setIssuer(event.target.value)} required />
        </label>
        <label className="field full">
          <span>Demonstration Grade File (XLSX or CSV)</span>
          <input type="file" accept=".xlsx,.csv" disabled={pending || Boolean(result)} onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setResult(null); }} />
        </label>
      </div>
      <div className="action-row" style={{ marginTop: 14 }}>
        <Button disabled={pending || !file || !sourceReference.trim() || !issuer.trim()} onClick={previewFile}>
          {pending ? "Checking File..." : "Preview Sandbox File"}
        </Button>
        {preview && preview.invalidRows === 0 && !result ? (
          <Button disabled={pending} onClick={stageFile}>
            {pending ? "Staging..." : "Stage in Sandbox Database"}
          </Button>
        ) : null}
      </div>
      {error ? <div className="notice warning" style={{ marginTop: 12 }}><strong>Sandbox import failed</strong><p>{error}</p></div> : null}
      {preview ? (
        <div style={{ marginTop: 18 }}>
          <h3>Sandbox Preview</h3>
          <div className="detail-list">
            <div className="detail-row"><span>File</span><strong>{preview.fileName}</strong></div>
            <div className="detail-row"><span>Rows</span><strong>{preview.rowCount}</strong></div>
            <div className="detail-row"><span>Valid rows</span><strong>{preview.validRows}</strong></div>
            <div className="detail-row"><span>Rows with issues</span><strong>{preview.invalidRows}</strong></div>
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="portal-table">
              <thead><tr><th>Student Number</th><th>Student Name</th><th>Grade</th><th>Source Reference</th><th>Issues</th></tr></thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={row.student_number + "-" + index}>
                    <td>{row.student_number}</td><td>{row.student_full_name}</td><td>{row.grade_value}</td>
                    <td>{row.source_record_reference}</td><td>{row.issues.length ? row.issues.join("; ") : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="notice" style={{ marginTop: 14 }}>
          <strong>Sandbox batch staged successfully.</strong>
          <p>Batch ID: {result.batch_id}</p>
          <p>Status: {result.status} · Rows stored: {result.row_count}</p>
          <p>Official publication enabled: No</p>
        </div>
      ) : null}
    </Panel>
  );
}
