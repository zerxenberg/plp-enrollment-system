"use client";

import { useState } from "react";
import { AdmissionIcon, ArrowRightIcon } from "./PortalIcons";
import styles from "./auth-portal.module.css";

export default function AdmissionEntryButton({ admissionUrl }) {
  const [message, setMessage] = useState("");

  if (admissionUrl) {
    return (
      <a className={styles.secondaryActionButton} href={admissionUrl}>
        <AdmissionIcon className={styles.secondaryActionIcon} />
        <span>Apply for Admission</span>
        <ArrowRightIcon className={styles.actionArrow} />
      </a>
    );
  }

  return (
    <div>
      <button
        className={styles.secondaryActionButton}
        type="button"
        onClick={() =>
          setMessage("The external Admission System link is ready to be connected once its official URL is provided.")
        }
      >
        <AdmissionIcon className={styles.secondaryActionIcon} />
        <span>Apply for Admission</span>
        <ArrowRightIcon className={styles.actionArrow} />
      </button>
      <p className={styles.admissionStatus} role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
