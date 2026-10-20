"use client";

import { useState } from "react";
import { InternalTabs, PageHeader } from "@/components/ui/PortalUI";

const TABS = ["Student Information", "Contact Information", "Admission Record", "Account and Security", "Preferences"];

const missing = (value) => value || "Not provided";

function ProjectStudentProfile({ profile }) {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  function renderTab() {
    if (activeTab === "Student Information") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Fictional Student ID Number</span><strong>{profile.studentNumber}</strong></div>
            <div className="info-item"><span>Fictional Full Name</span><strong>{profile.fullName}</strong></div>
            <div className="info-item"><span>Proposed Program</span><strong>{missing(profile.program)}</strong></div>
            <div className="info-item"><span>Proposed Year Level</span><strong>{missing(profile.yearLevel)}</strong></div>
            <div className="info-item"><span>Project Student Type</span><strong>{profile.studentType}</strong></div>
            <div className="info-item"><span>Proposed Curriculum</span><strong>{missing(profile.curriculum)}</strong></div>
            <div className="info-item"><span>Proposed Major</span><strong>{missing(profile.major)}</strong></div>
            <div className="info-item"><span>Academic Classification</span><strong>Not verified</strong></div>
            <div className="info-item"><span>Official Enrollment Status</span><strong>No official record</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            Program, year level, curriculum and major are proposed project data only.
            No admission approval, academic eligibility, grades or official enrollment is asserted.
          </div>
        </>
      );
    }

    if (activeTab === "Contact Information") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Project Sign In Email</span><strong>{profile.email}</strong></div>
            <div className="info-item"><span>Contact Number</span><strong>Not provided</strong></div>
            <div className="info-item"><span>Address</span><strong>Not provided</strong></div>
            <div className="info-item"><span>Emergency Contact</span><strong>Not provided</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            This fictional account uses a non-deliverable project email address. Contact
            information is read only until a secure, authorized save feature is available.
          </div>
        </>
      );
    }

    if (activeTab === "Admission Record") {
      return (
        <div className="notice">
          No institutionally verified admission record is linked to this fictional project
          account. Admission approval and applicant details have not been imported.
        </div>
      );
    }

    if (activeTab === "Account and Security") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Project Sign In Email</span><strong>{profile.email}</strong></div>
            <div className="info-item"><span>Project Account Status</span><strong>{profile.accountStatus}</strong></div>
            <div className="info-item"><span>Institutional Verification</span><strong>Not verified</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            Project account activation confirms demo access only. Use the authorized
            authentication flow for first login password changes and account security.
          </div>
        </>
      );
    }

    return (
      <div className="notice">
        Notification and email delivery preferences have not been configured for this
        fictional project account. No email delivery is enabled by this profile.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Student Profile"
        description="View your fictional project identity and proposed student information."
      />
      <div className="notice" role="status" style={{ marginBottom: 14 }}>
        Classroom demonstration record. This student identity is fictional and is
        not an official Pamantasan ng Lungsod ng Pasig student record.
      </div>
      <InternalTabs
        items={TABS.map((tab) => ({ value: tab, label: tab }))}
        selected={activeTab}
        onSelect={setActiveTab}
        label="Project student profile sections"
        panelCard
      >
        {renderTab()}
      </InternalTabs>
    </>
  );
}

function LiveStudentProfile({ profile }) {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  function renderTab() {
    if (activeTab === "Student Information") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Student ID Number</span><strong>{profile.studentNumber}</strong></div>
            <div className="info-item"><span>Full Name</span><strong>{profile.fullName}</strong></div>
            <div className="info-item"><span>Program Code</span><strong>{missing(profile.program)}</strong></div>
            <div className="info-item"><span>Year Level</span><strong>{missing(profile.yearLevel)}</strong></div>
            <div className="info-item"><span>Student Type</span><strong>{missing(profile.studentType)}</strong></div>
            <div className="info-item"><span>Curriculum Code</span><strong>{missing(profile.curriculum)}</strong></div>
            <div className="info-item"><span>Academic Classification</span><strong>{missing(profile.academicClassification)}</strong></div>
            <div className="info-item"><span>Recorded Student Status</span><strong>{missing(profile.studentStatus)}</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            Information above comes from your linked PostgreSQL student record.
            Admission decisions, grades, and term enrollment confirmations are
            separate records and are not inferred from this profile.
          </div>
        </>
      );
    }

    if (activeTab === "Contact Information") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Registered Email</span><strong>{profile.email}</strong></div>
            <div className="info-item"><span>Contact Number</span><strong>Not available in linked profile</strong></div>
            <div className="info-item"><span>Address</span><strong>Not available in linked profile</strong></div>
            <div className="info-item"><span>Emergency Contact</span><strong>Not available in linked profile</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            Contact details remain read only until an authorized database update
            workflow has been connected.
          </div>
        </>
      );
    }

    if (activeTab === "Admission Record") {
      return (
        <div className="notice">
          Verified admission details are not yet available from the linked
          Admission source. No decision or applicant reference is assumed.
        </div>
      );
    }

    if (activeTab === "Account and Security") {
      return (
        <>
          <div className="info-grid">
            <div className="info-item"><span>Registered Email</span><strong>{profile.email}</strong></div>
            <div className="info-item"><span>Account Status</span><strong>{profile.accountStatus}</strong></div>
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            Password changes and account recovery are handled by the secure
            authentication workflow.
          </div>
        </>
      );
    }

    return (
      <div className="notice">
        Individual notification and email preferences are not available from
        this student profile. No changes are saved in the browser.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Student Profile"
        description="View your account and linked PostgreSQL student information."
      />
      <InternalTabs
        items={TABS.map((tab) => ({ value: tab, label: tab }))}
        selected={activeTab}
        onSelect={setActiveTab}
        label="Student profile sections"
        panelCard
      >
        {renderTab()}
      </InternalTabs>
    </>
  );
}
export default function StudentProfile({ mode = "unavailable", profile }) {
  if (mode === "project" && profile) {
    return <ProjectStudentProfile profile={profile} />;
  }
  if (mode === "live" && profile) {
    return <LiveStudentProfile profile={profile} />;
  }
  return (
    <>
      <PageHeader title="Student Profile" description="View your student account information." />
      <div className="notice" role="alert">
        Student Profile is temporarily unavailable. Your student account or profile
        could not be verified. Please sign in again or contact the System Administrator.
      </div>
    </>
  );
}
