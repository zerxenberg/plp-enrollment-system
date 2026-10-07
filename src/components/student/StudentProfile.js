"use client";

import { useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

const TABS = ["Student Information", "Contact Information", "Admission Record", "Account and Security", "Preferences"];

export default function StudentProfile() {
  const { student, updateStudentContact } = useDemoData();
  const [activeTab, setActiveTab] = useState("Student Information");
  const [form, setForm] = useState({
    email: student.profile.email,
    contactNumber: student.profile.contactNumber,
    address: student.profile.address,
    emergencyContact: student.profile.emergencyContact,
  });
  const [saved, setSaved] = useState(false);

  function updateField(field, value) {
    setSaved(false);
    setForm((current) => ({ ...current, [field]: value }));
  }

  function saveContact(event) {
    event.preventDefault();
    updateStudentContact(form);
    setSaved(true);
  }

  function renderTab() {
    if (activeTab === "Student Information") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Student ID Number</span><strong>{student.profile.studentNumber}</strong></div>
            <div className="info-item"><span>Full Name</span><strong>{student.profile.fullName}</strong></div>
            <div className="info-item"><span>Program</span><strong>{student.profile.program}</strong></div>
            <div className="info-item"><span>Year Level</span><strong>{student.profile.yearLevel}</strong></div>
            <div className="info-item"><span>Student Type</span><strong>{student.profile.studentType}</strong></div>
            <div className="info-item"><span>Curriculum</span><strong>{student.profile.curriculum}</strong></div>
            <div className="info-item"><span>Academic Classification</span><strong><StatusBadge value={student.profile.academicClassification} /></strong></div>
            <div className="info-item"><span>Enrollment Status</span><strong><StatusBadge value={student.enrollment.status} /></strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            Institutional fields such as Student ID, approved program, curriculum, and official status are read only in Student self service.
          </div>
        </>
      );
    }

    if (activeTab === "Contact Information") {
      return (
        <form onSubmit={saveContact}>
          <div className="form-grid">
            <label className="field">
              <span>Email Address</span>
              <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
            </label>
            <label className="field">
              <span>Contact Number</span>
              <input value={form.contactNumber} onChange={(event) => updateField("contactNumber", event.target.value)} required />
            </label>
            <label className="field full">
              <span>Address</span>
              <input value={form.address} onChange={(event) => updateField("address", event.target.value)} />
            </label>
            <label className="field full">
              <span>Emergency Contact</span>
              <input value={form.emergencyContact} onChange={(event) => updateField("emergencyContact", event.target.value)} />
            </label>
          </div>
          {saved ? <div className="notice" style={{ marginTop: 12 }}>Contact information saved in the current demo session.</div> : null}
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button type="submit">Save Contact Information</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm({
                  email: student.profile.email,
                  contactNumber: student.profile.contactNumber,
                  address: student.profile.address,
                  emergencyContact: student.profile.emergencyContact,
                });
                setSaved(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      );
    }

    if (activeTab === "Admission Record") {
      return (
        <div className="detail-list">
          <div className="detail-row"><span>Admission Date</span><strong>{student.profile.admissionDate}</strong></div>
          <div className="detail-row"><span>Admission Type</span><strong>{student.profile.admissionType}</strong></div>
          <div className="detail-row"><span>Original Applicant Number</span><strong>{student.profile.applicantReference}</strong></div>
          <div className="detail-row"><span>Student ID Number</span><strong>{student.profile.studentNumber}</strong></div>
          <div className="detail-row"><span>Approved Program</span><strong>{student.profile.program}</strong></div>
          <div className="detail-row"><span>Admission Completion</span><strong><StatusBadge value="COMPLETED" label={student.profile.admissionCompletionStatus} /></strong></div>
        </div>
      );
    }

    if (activeTab === "Account and Security") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Registered Email</span><strong>{student.profile.email}</strong></div>
            <div className="info-item"><span>Account Status</span><strong><StatusBadge value="ACTIVE" label={student.profile.accountStatus} /></strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            Password changes, password recovery, active session management, and secure reset flows belong to the authentication layer and are not simulated on this frontend page.
          </div>
        </>
      );
    }

    return (
      <div className="list-stack">
        <div className="list-item">
          <div className="list-item-header"><strong>Notification Preferences</strong><StatusBadge value="ACTIVE" label="Enabled" /></div>
          <p>Portal notifications are available through the Notifications module. Delivery preferences can be connected when backend notification settings are implemented.</p>
        </div>
        <div className="list-item">
          <div className="list-item-header"><strong>Email Preferences</strong><StatusBadge value="READ" label="Demo only" /></div>
          <p>Email delivery preferences are reserved for the backend notification service and are not persisted by this frontend demo.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Student Profile"
        description="View institutional student information, update allowed contact fields, review Admission history, and see account settings."
      />
      <Card className="section-card">
        <div className="tabs">
          {TABS.map((tab) => (
            <button key={tab} className={`tab-button ${activeTab === tab ? "is-active" : ""}`} type="button" onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>
        {renderTab()}
      </Card>
    </>
  );
}
