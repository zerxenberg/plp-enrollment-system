import Image from "next/image";
import Link from "next/link";
import AuthPortalShell from "@/components/auth/AuthPortalShell";
import styles from "@/components/auth/auth-portal.module.css";

export const metadata = { title: "Admission System Integration" };

export default function AdmissionInformationPage() {
  return (
    <AuthPortalShell>
      <section className={`${styles.loginCard} ${styles.admissionInformation}`} aria-labelledby="admission-heading">
        <Image
          className={styles.cardLogo}
          src="/assets/images/plp_logo.png"
          alt=""
          width={92}
          height={92}
          priority
        />
        <h1 id="admission-heading">Admission System</h1>
        <p>The application portal for new applicants and transferees is not connected yet.</p>
        <p>Once the official Admission System URL is available, this action will open that system.</p>
        <Link className={styles.primaryButton} href="/">Return to Login Portal</Link>
      </section>
    </AuthPortalShell>
  );
}
