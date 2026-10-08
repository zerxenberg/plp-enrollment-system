import Link from "next/link";
import AppIcon from "@/components/ui/AppIcon";
import styles from "./auth-portal.module.css";

export default function AdmissionEntryButton({ admissionUrl }) {
  const destination = /^https?:\/\//i.test(admissionUrl) ? admissionUrl : "/admission";

  return (
    <Link className={styles.studentPortalAction} href={destination}>
      <span className={styles.studentPortalIconBox}>
        <AppIcon name="admission" className={styles.studentPortalIcon} />
      </span>
      <span className={styles.studentPortalActionText}>
        <strong>Apply for Admission</strong>
        <small>For new applicants and transferees</small>
      </span>
      <span className={styles.admissionArrowCircle} aria-hidden="true">
        <AppIcon name="chevronRight" className={styles.actionArrow} />
      </span>
    </Link>
  );
}
