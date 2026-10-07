import Image from "next/image";
import Link from "next/link";
import AuthPortalShell from "./AuthPortalShell";
import LoginForm from "./LoginForm";
import {
  ArrowRightIcon,
  GraduationCapIcon,
  StaffIcon,
} from "./PortalIcons";
import styles from "./auth-portal.module.css";

export default function StaffLoginPortal() {
  return (
    <AuthPortalShell>
      <section className={`${styles.loginCard} ${styles.staffCard}`} aria-labelledby="staff-login-title">
        <Image
          className={styles.cardLogo}
          src="/assets/images/plp_logo.png"
          alt=""
          width={92}
          height={92}
          priority
        />

        <p className={styles.systemTitle}>PLP Enrollment System</p>
        <span className={styles.titleRule} aria-hidden="true" />

        <div className={styles.staffHeadingRow}>
          <StaffIcon className={styles.staffIcon} />
          <h1 id="staff-login-title">Staff Login</h1>
        </div>
        <p className={styles.staffSubtitle}>For authorized staff only</p>
        <p className={styles.rolePill}>Authorized Staff Access</p>

        <LoginForm
          mode="staff"
          identityLabel="Username / Staff ID"
          identityPlaceholder="Enter your username or Staff ID"
          submitLabel="Login"
        />

        <div className={styles.sectionDivider}>
          <span />
          <strong>Student Access</strong>
          <span />
        </div>

        <Link className={styles.studentPortalAction} href="/student-portal">
          <span className={styles.studentPortalIconBox}>
            <GraduationCapIcon className={styles.studentPortalIcon} />
          </span>
          <span className={styles.studentPortalActionText}>
            <strong>PLP Student Portal</strong>
            <small>For New Applicants, Transferees, Admitted Students, and Continuing Students</small>
          </span>
          <ArrowRightIcon className={styles.actionArrow} />
        </Link>
      </section>
    </AuthPortalShell>
  );
}
