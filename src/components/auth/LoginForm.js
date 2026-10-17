
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppIcon from "@/components/ui/AppIcon";
import { PORTAL_META } from "@/config/portal-navigation";
import { clearDemoSession, saveDemoSession } from "@/lib/auth/demo-auth";
import { signInPortalUser } from "@/features/auth/auth-actions";
import styles from "./auth-portal.module.css";

export default function LoginForm({
  identityLabel,
  identityPlaceholder,
  submitLabel,
}) {
  const router = useRouter();
  const identityRef = useRef(null);
  const passwordRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFieldError(field) {
    setStatus("");
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const email = identity.trim().toLowerCase();
    const nextErrors = {};

    if (!email) {
      nextErrors.identity = "Enter your registered email.";
    } else if (!email.includes("@")) {
      nextErrors.identity = "Use your registered PLP email for Supabase sign in.";
    }

    if (!password) {
      nextErrors.password = "Enter your password.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStatus("");
      if (nextErrors.identity) {
        identityRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    setStatus("Signing in...");

    const result = await signInPortalUser({
      email,
      password,
    });

    if (!result?.ok || !result.user) {
      setIsSubmitting(false);
      setStatus(
        result?.message || "The registered email or password is incorrect.",
      );
      return;
    }

    // Other portals still use their temporary local compatibility context
    // until their own database migration is complete. The System Administrator
    // portal does not receive or consume that context.
    if (result.user.role === "system-administrator") {
      clearDemoSession();
    } else {
      saveDemoSession({
        role: result.user.role,
        name: result.user.name,
        identifier: result.user.identifier,
        redirect: result.user.redirect,
      });
    }

    setStatus(`Signed in as ${result.user.name}. Opening your portal.`);
    router.replace(result.user.redirect);
    router.refresh();
  }

  function handleForgotPassword() {
    setStatus(
      "Contact the System Administrator if you need a password reset.",
    );
  }

  return (
    <form className={styles.loginForm} onSubmit={handleSubmit} autoComplete="on" noValidate>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="login-identity">
          {identityLabel}
        </label>
        <div className={`${styles.inputShell} ${errors.identity ? styles.inputShellError : ""}`}>
          <AppIcon name="user" className={styles.inputIcon} />
          <input
            ref={identityRef}
            id="login-identity"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={identity}
            placeholder={identityPlaceholder}
            aria-invalid={Boolean(errors.identity)}
            aria-describedby={errors.identity ? "login-identity-error" : undefined}
            onChange={(event) => {
              setIdentity(event.target.value);
              clearFieldError("identity");
            }}
          />
        </div>
        <p
          className={`${styles.fieldError} ${errors.identity ? styles.fieldErrorVisible : ""}`}
          id="login-identity-error"
          aria-live="polite"
        >
          {errors.identity || ""}
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="login-password">
          Password
        </label>
        <div className={`${styles.inputShell} ${errors.password ? styles.inputShellError : ""}`}>
          <AppIcon name="lock" className={styles.inputIcon} />
          <input
            ref={passwordRef}
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            placeholder="Enter your password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFieldError("password");
            }}
          />
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
          >
            <AppIcon name={showPassword ? "eyeOff" : "eye"} className={styles.eyeIcon} />
          </button>
        </div>
        <p
          className={`${styles.fieldError} ${errors.password ? styles.fieldErrorVisible : ""}`}
          id="login-password-error"
          aria-live="polite"
        >
          {errors.password || ""}
        </p>
      </div>

      <button className={styles.forgotPassword} type="button" onClick={handleForgotPassword}>
        Forgot Password?
      </button>

      <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
        <AppIcon name="lock" className={styles.buttonIcon} />
        <span>{isSubmitting ? "Signing in..." : submitLabel}</span>
      </button>

      <p className={styles.formStatus} role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
