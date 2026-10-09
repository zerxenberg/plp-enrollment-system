import Image from "next/image";
import AuthPortalShell from "./AuthPortalShell";
import AdmissionEntryButton from "./AdmissionEntryButton";
import LoginForm from "./LoginForm";
import styles from "./auth-portal.module.css";

export default function LoginPortal() {
  const admissionUrl = process.env.NEXT_PUBLIC_ADMISSION_SYSTEM_URL || "";

  return (
    <AuthPortalShell>
      <section className={`${styles.loginCard} ${styles.unifiedCard}`} aria-labelledby="login-portal-title">
        <Image
          className={styles.cardLogo}
          src="/assets/images/plp_logo.png"
          alt=""
          width={92}
          height={92}
          priority
        />

        <h1 className={styles.systemTitle} id="login-portal-title">PLP Enrollment System</h1>
        <div className={styles.loginSubtitle}>
          <span aria-hidden="true" />
          <strong>Login Portal</strong>
          <span aria-hidden="true" />
        </div>

        <LoginForm
          identityLabel="University ID Number or Registered Email"
          identityPlaceholder="Enter your University ID number or registered email"
          submitLabel="Login"
        />

        <div className={styles.sectionDivider}>
          <span />
          <strong>New Student Access</strong>
          <span />
        </div>

        <AdmissionEntryButton admissionUrl={admissionUrl} />
      </section>
    </AuthPortalShell>
  );
}
