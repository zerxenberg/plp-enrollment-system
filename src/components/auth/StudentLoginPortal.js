import Image from "next/image";
import Link from "next/link";
import AuthPortalShell from "./AuthPortalShell";
import AdmissionEntryButton from "./AdmissionEntryButton";
import LoginForm from "./LoginForm";
import { ArrowLeftIcon } from "./PortalIcons";
import styles from "./auth-portal.module.css";

export default function StudentLoginPortal() {
  const admissionUrl = process.env.NEXT_PUBLIC_ADMISSION_SYSTEM_URL || "";

  return (
    <AuthPortalShell>
      <section className={`${styles.loginCard} ${styles.studentCard}`} aria-labelledby="student-login-title">
        <Image
          className={styles.cardLogo}
          src="/assets/images/plp_logo.png"
          alt=""
          width={92}
          height={92}
          priority
        />

        <h1 className={styles.studentPortalTitle} id="student-login-title">
          PLP Student Portal
        </h1>
        <p className={styles.studentPortalSubtitle}>Unified Admission and Enrollment Access</p>
        <span className={styles.titleRule} aria-hidden="true" />
        <p className={styles.studentAudience}>
          For New Applicants, Transferees, Admitted Students, and Continuing Students
        </p>

        <LoginForm
          mode="student"
          identityLabel="Student ID Number or Registered Email"
          identityPlaceholder="Enter your Student ID number or email address"
          submitLabel="Sign In"
        />

        <div className={styles.orDivider}>
          <span />
          <strong>OR</strong>
          <span />
        </div>

        <AdmissionEntryButton admissionUrl={admissionUrl} />

        <Link className={styles.backToStaff} href="/">
          <ArrowLeftIcon className={styles.backIcon} />
          <span>Back to Staff Login</span>
        </Link>
      </section>
    </AuthPortalShell>
  );
}
