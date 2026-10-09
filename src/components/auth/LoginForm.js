"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppIcon from "@/components/ui/AppIcon";
import { authenticateDemoAccount, saveDemoSession } from "@/lib/auth/demo-auth";
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

  function clearFieldError(field) {
    setStatus("");
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const normalizedIdentity = identity.trim();
    const nextErrors = {};

    if (!normalizedIdentity) {
      nextErrors.identity = "Enter your University ID number or registered email.";
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

    const session = authenticateDemoAccount({ identity: normalizedIdentity, password });

    if (!session) {
      setStatus("The ID number, registered email, or password is incorrect for this demo.");
      return;
    }


    if (!saveDemoSession(session)) {
      setStatus("This demo account could not be signed in. Please try again.");
      return;
    }
    const portalLabels = {
      student: "Student",
      registrar: "Registrar",
      "academic-coordinator": "Academic Coordinator",
      "system-administrator": "System Administrator",
    };
    setStatus(`Signed in as ${session.name}. Opening the ${portalLabels[session.role] || "authorized"} Portal.`);
    router.push(session.redirect);
  }

  function handleForgotPassword() {
    setStatus(
      "Password recovery will be connected when Supabase Authentication is configured.",
    );
  }

  return (
    <form className={styles.loginForm} onSubmit={handleSubmit} autoComplete="off" noValidate>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="login-identity">
          {identityLabel}
        </label>
        <div className={`${styles.inputShell} ${errors.identity ? styles.inputShellError : ""}`}>
          <AppIcon name="user" className={styles.inputIcon} />
          <input
            ref={identityRef}
            id="login-identity"
            name="login-identity"
            type="text"
            autoComplete="off"
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
            name="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
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

      <button className={styles.primaryButton} type="submit">
        <AppIcon name="lock" className={styles.buttonIcon} />
        <span>{submitLabel}</span>
      </button>

      <p className={styles.formStatus} role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
