import Image from "next/image";
import styles from "./auth-portal.module.css";

export default function AuthPortalShell({ children }) {
  return (
    <div className={styles.portalPage}>
      <div className={styles.backgroundOverlay} aria-hidden="true" />

      <header className={styles.siteHeader}>
        <div className={styles.universityBrand}>
          <Image
            className={styles.headerLogo}
            src="/assets/images/plp_logo.png"
            alt="Pamantasan ng Lungsod ng Pasig seal"
            width={74}
            height={74}
            priority
          />
          <div className={styles.brandText}>
            <span className={styles.universityName}>Pamantasan ng Lungsod ng Pasig</span>
            <span className={styles.universitySubtitle}>Pasig City University</span>
          </div>
        </div>
      </header>

      <main className={styles.portalMain}>{children}</main>

      <footer className={styles.siteFooter}>
        <span className={styles.footerAccent} aria-hidden="true" />
        <p>© 2026 Pamantasan ng Lungsod ng Pasig. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
