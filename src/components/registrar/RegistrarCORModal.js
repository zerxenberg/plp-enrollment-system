"use client";

import { Button, DataTable, Modal } from "@/components/ui/PortalUI";
import { Details } from "./RegistrarShared";
import { displayValue } from "@/features/registrar/registrar-client-utils";

function normalize(cor, isProject) {
  if (!cor) return null;
  if (isProject) {
    const student = cor.student || {};
    return {
      studentNumber: student.student_number,
      studentName: student.student_name,
      program: student.program_code,
      curriculum: student.curriculum_code,
      yearLevel: student.year_level,
      term: student.term_id,
      homeBlock: student.home_block,
      reference: cor.simulation_id,
      confirmedAt: cor.confirmed_at,
      status: cor.registration_status,
      subjects: (student.subjects || []).map((item) => ({
        subjectCode: item.subject_code,
        subjectName: item.subject_name,
        units: item.academic_units,
        section: student.home_block,
      })),
      schedule: (student.class_schedule || []).map((item, index) => ({
        id: `${item.subject_code}-${index}`,
        subjectCode: item.subject_code,
        day: item.day ?? item.day_of_week,
        time: `${displayValue(item.start_time)} to ${displayValue(item.end_time)}`,
        room: item.room,
        professor: item.instructor,
      })),
    };
  }

  return {
    studentNumber: cor.student_number,
    studentName: cor.student_name,
    program: cor.program_name || cor.program_code,
    curriculum: cor.curriculum_code,
    yearLevel: cor.year_level,
    term: cor.academic_term || cor.term_id,
    homeBlock: cor.home_block,
    reference: cor.confirmation_reference || cor.reference,
    confirmedAt: cor.confirmed_at,
    status: cor.status,
    subjects: (cor.subjects || []).map((item) => ({
      subjectCode: item.subject_code,
      subjectName: item.subject_name,
      units: item.units,
      section: item.section_id,
    })),
    schedule: (cor.schedule || []).map((item, index) => ({
      id: `${item.subject_code}-${index}`,
      subjectCode: item.subject_code,
      day: item.day_of_week,
      time: `${displayValue(item.start_time)} to ${displayValue(item.end_time)}`,
      room: item.room,
      professor: item.professor,
    })),
  };
}

function escapeHtml(value) {
  return String(value ?? "Not available")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function printCor(record, isProject) {
  const note = isProject
    ? '<p style="font-size:10px;color:#5f6d66;margin:4px 0 14px">Project demonstration. Not an official PLP enrollment record.</p>'
    : "";
  const subjects = record.subjects.map((item) => `<tr><td>${escapeHtml(item.subjectCode)}</td><td>${escapeHtml(item.subjectName)}</td><td>${escapeHtml(item.units)}</td><td>${escapeHtml(item.section)}</td></tr>`).join("");
  const schedule = record.schedule.map((item) => `<tr><td>${escapeHtml(item.subjectCode)}</td><td>${escapeHtml(item.day)}</td><td>${escapeHtml(item.time)}</td><td>${escapeHtml(item.room)}</td><td>${escapeHtml(item.professor)}</td></tr>`).join("");
  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><title>Certificate of Registration</title><style>body{font-family:Arial,sans-serif;color:#15382b;padding:34px}h1{font-size:24px;margin:0}p{margin:6px 0}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{border:1px solid #cad8d1;padding:7px;text-align:left;font-size:12px}th{background:#e9f5ee}.meta{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:18px}.meta p{border-bottom:1px solid #d6dfda;padding-bottom:5px}</style></head><body><h1>Certificate of Registration</h1>${note}<div class="meta"><p><strong>Student:</strong> ${escapeHtml(record.studentName)}</p><p><strong>Student ID:</strong> ${escapeHtml(record.studentNumber)}</p><p><strong>Program:</strong> ${escapeHtml(record.program)}</p><p><strong>Year Level:</strong> ${escapeHtml(record.yearLevel)}</p><p><strong>Academic Term:</strong> ${escapeHtml(record.term)}</p><p><strong>Block:</strong> ${escapeHtml(record.homeBlock)}</p><p><strong>Reference:</strong> ${escapeHtml(record.reference)}</p><p><strong>Status:</strong> ${escapeHtml(record.status)}</p></div><h2>Registered Subjects</h2><table><thead><tr><th>Code</th><th>Subject</th><th>Units</th><th>Section</th></tr></thead><tbody>${subjects || '<tr><td colspan="4">Not available</td></tr>'}</tbody></table><h2>Schedule</h2><table><thead><tr><th>Subject</th><th>Day</th><th>Time</th><th>Room</th><th>Professor</th></tr></thead><tbody>${schedule || '<tr><td colspan="5">Not available</td></tr>'}</tbody></table></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export default function RegistrarCORModal({ open, cor, isProject = false, onClose }) {
  const record = normalize(cor, isProject);
  if (!record) return null;

  return (
    <Modal
      open={open}
      title="Certificate of Registration"
      onClose={onClose}
      className="registrar-cor-modal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={() => printCor(record, isProject)}>Print</Button>
          {isProject && cor?.simulation_id ? (
            <a className="portal-button" href={`/api/registrar/project-cor/${encodeURIComponent(cor.simulation_id)}`} target="_blank" rel="noreferrer">Download PDF</a>
          ) : null}
        </>
      }
    >
      {isProject ? <p style={{ fontSize: ".7rem", color: "#607168", margin: "0 0 12px" }}>Project demonstration. Not an official PLP enrollment record.</p> : null}
      <Details items={[
        ["Student ID", record.studentNumber],
        ["Student Name", record.studentName],
        ["Program", record.program],
        ["Curriculum", record.curriculum],
        ["Year Level", record.yearLevel],
        ["Academic Term", record.term],
        ["Home Block", record.homeBlock],
        ["Registration Reference", record.reference],
        ["Status", record.status],
        ["Confirmed At", record.confirmedAt ? new Date(record.confirmedAt).toLocaleString() : "Not available"],
      ]} />

      <h3 style={{ marginTop: 18 }}>Registered Subjects</h3>
      <DataTable
        rowKey={(row) => `${row.subjectCode}-${row.section}`}
        rows={record.subjects}
        emptyMessage="Registered subject data is not available."
        columns={[
          { key: "subjectCode", label: "Subject Code" },
          { key: "subjectName", label: "Subject Name" },
          { key: "units", label: "Units" },
          { key: "section", label: "Section" },
        ]}
      />

      <h3 style={{ marginTop: 18 }}>Class Schedule</h3>
      <DataTable
        rowKey="id"
        rows={record.schedule}
        emptyMessage="Class schedule data is not available."
        columns={[
          { key: "subjectCode", label: "Subject" },
          { key: "day", label: "Day" },
          { key: "time", label: "Time" },
          { key: "room", label: "Room" },
          { key: "professor", label: "Professor" },
        ]}
      />
    </Modal>
  );
}
