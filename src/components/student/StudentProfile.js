"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import AppIcon from "@/components/ui/AppIcon";
import { Modal, PageHeader } from "@/components/ui/PortalUI";
import { displayCurriculumCode } from "@/features/academic/project-academic-display-aliases.mjs";
import { formatStudentName } from "@/utils/student-name.mjs";
import {
  changeStudentProfilePassword,
  removeStudentPhoto,
  saveStudentContact,
  uploadStudentPhoto,
} from "@/features/students/student-profile-actions";
import styles from "./student-profile.module.css";

const missing = (value) => value || "Not provided";

function Detail({ label, value }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{missing(value)}</dd>
    </div>
  );
}

function InfoCard({ icon, title, action, footer, children }) {
  return (
    <section className={`portal-card ${styles.infoCard}`} aria-label={title}>
      <header className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <span className={styles.cardIcon}><AppIcon name={icon} size={19} /></span>
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      <dl className={styles.details}>{children}</dl>
      {footer}
    </section>
  );
}

function Field({ label, name, value, onChange, textarea = false, ...props }) {
  const Component = textarea ? "textarea" : "input";
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <Component name={name} value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

const EMPTY_PASSWORD = { currentPassword: "", newPassword: "", confirmation: "" };

export default function StudentProfile({ mode = "unavailable", profile }) {
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [contact, setContact] = useState(profile?.contact || {
    contactNumber: "", alternateContactNumber: "", address: "",
  });
  const [draftContact, setDraftContact] = useState(contact);
  const [photoUrl, setPhotoUrl] = useState(profile?.photoUrl || null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [password, setPassword] = useState(EMPTY_PASSWORD);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef(null);
  const canEdit = mode === "project";
  const canEditContact = canEdit && profile?.contactEditingReady !== false;

  useEffect(() => {
    if (!selectedPhoto || selectedPhoto.size > 2 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(selectedPhoto.type)) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setPhotoPreview(null);
    reader.readAsDataURL(selectedPhoto);
    return () => reader.abort();
  }, [selectedPhoto]);

  function closeDialog() {
    if (isPending) return;
    setDialog(null);
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setPassword(EMPTY_PASSWORD);
  }

  function resultMessage(result) {
    setFeedback({ message: result.message, ok: result.ok });
    return result.ok;
  }

  function saveContacts(event) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveStudentContact(draftContact);
      if (resultMessage(result)) {
        setContact(result.contact);
        setDialog(null);
      }
    });
  }

  function savePhoto(event) {
    event.preventDefault();
    if (!selectedPhoto) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("photo", selectedPhoto);
      const result = await uploadStudentPhoto(form);
      if (resultMessage(result)) {
        setPhotoUrl(result.photoUrl);
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setDialog(null);
      }
    });
  }

  function removePhoto() {
    startTransition(async () => {
      const result = await removeStudentPhoto();
      if (resultMessage(result)) {
        setPhotoUrl(null);
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setDialog(null);
      }
    });
  }

  function savePassword(event) {
    event.preventDefault();
    startTransition(async () => {
      const result = await changeStudentProfilePassword(password);
      if (resultMessage(result)) {
        setPassword(EMPTY_PASSWORD);
        setDialog(null);
      }
    });
  }

  if (!profile || !["project", "live"].includes(mode)) {
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

  const isProject = mode === "project";
  const displayName = formatStudentName({ fullName: profile.fullName });
  const classification = isProject ? (profile.academicClassification || "Not verified") : missing(profile.academicClassification);
  const academicStatus = isProject ? "No official record" : missing(profile.officialEnrollmentStatus || "Pending");

  return (
    <>
      <PageHeader
        title="Student Profile"
        description="Review your student identity, contact details, academic information, admission record and account security."
      />
      {isProject ? (
        <p className={`${styles.projectNotice} notice`} role="note">
          Classroom demonstration. This fictional student identity and its proposed academic
          information are not official Pamantasan ng Lungsod ng Pasig records.
        </p>
      ) : null}
      {feedback ? (
        <p className={`${styles.feedback} ${feedback.ok ? styles.success : styles.error}`} role="status">
          {feedback.message}
        </p>
      ) : null}

      <div className={styles.layout}>
        <aside className={`${styles.identityCard} portal-card`} aria-label="Student identity">
          <div className={styles.identityAccent} aria-hidden="true" />
          <div className={styles.photoShell}>
            {photoUrl ? (
              /* The image URL is signed by Supabase for this verified student only. */
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={`Profile photo of ${displayName}`} className={styles.photo} />
            ) : (
              <AppIcon name="user" className={styles.photoPlaceholder} size={68} />
            )}
          </div>
          {canEdit ? (
            <button type="button" className={styles.photoAction} onClick={() => { setFeedback(null); setDialog("photo"); }}>
              <AppIcon name="edit" size={16} /> {photoUrl ? "Change Photo" : "Upload Photo"}
            </button>
          ) : null}
          <h2 className={styles.studentName}>{displayName}</h2>
          <p className={styles.studentNumber}>{profile.studentNumber}</p>
          <span className={styles.studentBadge}>{isProject ? "Demonstration Student" : "Student"}</span>

          <dl className={styles.identityDetails}>
            <div><dt>Program</dt><dd>{missing(profile.program)}</dd></div>
            <div><dt>Year Level</dt><dd>{missing(profile.yearLevel)}</dd></div>
            <div><dt>Student Type</dt><dd>{missing(profile.studentType)}</dd></div>
            <div><dt>Sex</dt><dd>{profile.sex === "Male" || profile.sex === "Female" ? profile.sex : "Not recorded"}</dd></div>
            <div><dt>Curriculum</dt><dd>{missing(displayCurriculumCode(profile.curriculum))}</dd></div>
            <div><dt>Academic Classification</dt><dd>{classification}</dd></div>
            <div><dt>Enrollment Eligibility</dt><dd>{missing(profile.enrollmentEligibility || (isProject ? "Not yet evaluated" : null))}</dd></div>
            <div><dt>Enrollment Status</dt><dd>{isProject ? missing(profile.projectEnrollmentStatus === "CONFIRMED_SIMULATION" ? "Enrolled (Project)" : profile.projectEnrollmentStatus || "Not started") : academicStatus}</dd></div>
          </dl>
          {isProject ? <p className={styles.proposedNote}>Program and year are proposed project data only.</p> : null}
        </aside>

        <div className={styles.cards}>
          <InfoCard icon="user" title="Contact Information" action={canEditContact ? (
            <button className={styles.editButton} type="button" onClick={() => {
              setDraftContact({ ...contact }); setFeedback(null); setDialog("contact");
            }}><AppIcon name="edit" size={15} /> Edit</button>
          ) : null}>
            <Detail label="Registered Email" value={profile.email} />
            <Detail label="Mobile Number" value={contact.contactNumber} />
            <Detail label="Alternate Contact Number" value={contact.alternateContactNumber} />
            <Detail label="Address" value={contact.address} />
          </InfoCard>

          <InfoCard icon="academic" title="Academic Information">
            <Detail label={isProject ? "Proposed Program" : "Program Code"} value={profile.program} />
            <Detail label={isProject ? "Proposed Curriculum" : "Curriculum Code"} value={displayCurriculumCode(profile.curriculum)} />
            <Detail label={isProject ? "Proposed Major" : "Academic Classification"}
              value={isProject ? profile.major : profile.academicClassification} />
            <Detail label="Academic Classification" value={classification} />
            <Detail label="Official Enrollment Status" value={academicStatus} />
          </InfoCard>
          {!isProject && profile.admissionsDemonstration?.block ? (
            <InfoCard icon="academic" title="Phase 8 Project Demonstration Assignment">
              <p className={styles.cardNote}>
                These are fictional classroom resources shared with your real Admissions
                student account. They are not official academic assignments or a university COR.
              </p>
              <Detail label="Demonstration Curriculum" value={profile.admissionsDemonstration.curriculum} />
              <Detail label="Project Block Section" value={profile.admissionsDemonstration.block} />
              <Detail label="Project Term" value={profile.admissionsDemonstration.term} />
              <Detail label="Demo Registration Status" value={profile.admissionsDemonstration.status} />
            </InfoCard>
          ) : null}

          <InfoCard icon="admission" title="Admission Record" footer={(
            <p className={styles.cardNote}>
              {isProject
                ? "No verified admission approval or applicant record has been imported for this fictional student."
                : profile.admissionSource === "PLP Admissions"
                  ? "Your admission was received from PLP Admissions. Official enrollment is a separate Registrar decision."
                  : "Admission details are not available from an identified source."}
            </p>
          )}>
            <Detail label="Admission Source" value={isProject ? "Not institutionally verified" : profile.admissionSource} />
            <Detail label="Admission Decision" value={isProject ? "Not applicable" : profile.admissionDecision} />
          </InfoCard>

          <InfoCard icon="lock" title="Account & Security">
            <Detail label="Registered Email" value={profile.email} />
            <Detail label="Password" value="••••••••••••" />
            {canEdit ? (
              <button type="button" className={styles.changePassword} onClick={() => {
                setFeedback(null); setPassword(EMPTY_PASSWORD); setDialog("password");
              }}><AppIcon name="lock" size={16} /> Change Password</button>
            ) : null}
          </InfoCard>
        </div>
      </div>

      <Modal open={dialog === "contact"} title="Edit Contact Information" onClose={closeDialog}>
        <form className={styles.modalForm} onSubmit={saveContacts}>
          <p className={styles.formHint}>Update your mobile number, alternate contact number and address. Your registered email is read only.</p>
          <Field label="Mobile Number" name="contactNumber" type="tel" maxLength={24}
            value={draftContact.contactNumber} onChange={(value) => setDraftContact((old) => ({ ...old, contactNumber: value }))} />
          <Field label="Alternate Contact Number" name="alternateContactNumber" type="tel" maxLength={24}
            value={draftContact.alternateContactNumber} onChange={(value) => setDraftContact((old) => ({ ...old, alternateContactNumber: value }))} />
          <Field label="Address" name="address" textarea rows={3} maxLength={240}
            value={draftContact.address} onChange={(value) => setDraftContact((old) => ({ ...old, address: value }))} />
          {feedback && dialog === "contact" ? <p role="status" className={`${styles.feedback} ${feedback.ok ? styles.success : styles.error}`}>{feedback.message}</p> : null}
          <div className={styles.modalActions}>
            <button type="button" className={styles.secondaryButton} onClick={closeDialog} disabled={isPending}>Cancel</button>
            <button type="submit" className={styles.primaryButton} disabled={isPending}>{isPending ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "photo"} title="Profile Photo" onClose={closeDialog}>
        <form className={styles.modalForm} onSubmit={savePhoto}>
          <p className={styles.formHint}>Choose a JPG, PNG or WebP photo, up to 2 MB. Your photo is stored privately.</p>
          <label className={styles.field}>
            <span>Choose Photo</span>
            <input ref={fileRef} type="file" name="photo" accept="image/png,image/jpeg,image/webp" required
              onChange={(event) => {
                setPhotoPreview(null);
                setSelectedPhoto(event.target.files?.[0] || null);
              }} />
          </label>
          {selectedPhoto ? <p className={styles.selectedFile}>Selected: {selectedPhoto.name}</p> : null}
          {photoPreview ? (
            <div className={styles.previewBox}>
              {/* Data URL represents only the student's selected local image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Selected profile photo preview" className={styles.photoPreview} />
              <span>Preview before saving</span>
            </div>
          ) : null}
          {feedback && dialog === "photo" ? <p role="status" className={`${styles.feedback} ${feedback.ok ? styles.success : styles.error}`}>{feedback.message}</p> : null}
          <div className={styles.modalActions}>
            {photoUrl ? (
              <button type="button" className={styles.removeButton} onClick={removePhoto} disabled={isPending}>
                <AppIcon name="delete" size={15} /> Remove Photo
              </button>
            ) : null}
            <button type="button" className={styles.secondaryButton} onClick={closeDialog} disabled={isPending}>Cancel</button>
            <button type="submit" className={styles.primaryButton} disabled={isPending || !selectedPhoto}>
              {isPending ? "Uploading..." : "Save Photo"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "password"} title="Change Password" onClose={closeDialog}>
        <form className={styles.modalForm} onSubmit={savePassword}>
          <p className={styles.formHint}>Confirm your current password to protect your account. Your new password must have at least 14 characters, including uppercase, lowercase, a number and a symbol.</p>
          <Field label="Current Password" name="currentPassword" type="password" autoComplete="current-password" required
            value={password.currentPassword} onChange={(value) => setPassword((old) => ({ ...old, currentPassword: value }))} />
          <Field label="New Password" name="newPassword" type="password" autoComplete="new-password" minLength={14} maxLength={128} required
            value={password.newPassword} onChange={(value) => setPassword((old) => ({ ...old, newPassword: value }))} />
          <Field label="Confirm New Password" name="confirmation" type="password" autoComplete="new-password" minLength={14} maxLength={128} required
            value={password.confirmation} onChange={(value) => setPassword((old) => ({ ...old, confirmation: value }))} />
          {feedback && dialog === "password" ? <p role="status" className={`${styles.feedback} ${feedback.ok ? styles.success : styles.error}`}>{feedback.message}</p> : null}
          <div className={styles.modalActions}>
            <button type="button" className={styles.secondaryButton} onClick={closeDialog} disabled={isPending}>Cancel</button>
            <button type="submit" className={styles.primaryButton} disabled={isPending}>{isPending ? "Updating..." : "Change Password"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
