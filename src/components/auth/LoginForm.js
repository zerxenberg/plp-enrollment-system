"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, LockIcon, UserIcon } from "./PortalIcons";
import { authenticateDemoAccount, saveDemoSession } from "@/lib/auth/demo-auth";
import styles from "./auth-portal.module.css";

export default function LoginForm({
  identityLabel,
  identityPlaceholder,
  submitLabel,
  mode,
}) {
  const router = useRouter();
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
      nextErrors.identity = `Enter your ${mode === "staff" ? "username or Staff ID" : "Student ID or registered email"}.`;
    }

    if (!password) {
      nextErrors.password = "Enter your password.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStatus("");
      return;
    }

    const session = authenticateDemoAccount({ mode, identity: normalizedIdentity, password });

    if (!session) {
      setStatus(
        mode === "student"
          ? "The Student ID, registered email, or password does not match the temporary Student demo account."
          : "The username, staff email, Staff ID, or password does not match an authorized staff demo account.",
      );
      return;
    }

    saveDemoSession(session);
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
        <label className={styles.fieldLabel} htmlFor={`${mode}-identity`}>
          {identityLabel}
        </label>
        <div className={`${styles.inputShell} ${errors.identity ? styles.inputShellError : ""}`}>
          <UserIcon className={styles.inputIcon} />
          <input
            id={`${mode}-identity`}
            name={`${mode}-identity`}
            type="text"
            autoComplete="off"
            required
            value={identity}
            placeholder={identityPlaceholder}
            aria-invalid={Boolean(errors.identity)}
            aria-describedby={errors.identity ? `${mode}-identity-error` : undefined}
            onChange={(event) => {
              setIdentity(event.target.value);
              clearFieldError("identity");
            }}
          />
        </div>
        <p
          className={`${styles.fieldError} ${errors.identity ? styles.fieldErrorVisible : ""}`}
          id={`${mode}-identity-error`}
          aria-live="polite"
        >
          {errors.identity || ""}
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`${mode}-password`}>
          Password
        </label>
        <div className={`${styles.inputShell} ${errors.password ? styles.inputShellError : ""}`}>
          <LockIcon className={styles.inputIcon} />
          <input
            id={`${mode}-password`}
            name={`${mode}-password`}
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            required
            value={password}
            placeholder="Enter your password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? `${mode}-password-error` : undefined}
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
            <EyeIcon className={styles.eyeIcon} hidden={showPassword} />
          </button>
        </div>
        <p
          className={`${styles.fieldError} ${errors.password ? styles.fieldErrorVisible : ""}`}
          id={`${mode}-password-error`}
          aria-live="polite"
        >
          {errors.password || ""}
        </p>
      </div>

      <button className={styles.forgotPassword} type="button" onClick={handleForgotPassword}>
        Forgot Password?
      </button>

      <button className={styles.primaryButton} type="submit">
        <LockIcon className={styles.buttonIcon} />
        <span>{submitLabel}</span>
      </button>

      <p className={styles.formStatus} role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
