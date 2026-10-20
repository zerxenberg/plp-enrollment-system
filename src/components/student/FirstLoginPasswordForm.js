"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changeInitialProjectOnlyPassword } from "@/features/auth/project-only-password-actions";

export default function FirstLoginPasswordForm() {
  const [state, action, pending] = useActionState(async (_previous, fields) =>
    changeInitialProjectOnlyPassword(fields), { ok: false, message: "" });
  return (
    <div className="portal-app portal-role-student">
      <main className="portal-content" style={{ maxWidth: 620, margin: "48px auto" }}>
        <section className="portal-card" style={{ padding: 28 }}>
          <h1>Set your Student Portal password</h1>
          <p>For account security, change your temporary password before accessing your student records.</p>
          <form action={action} className="form-grid" style={{ marginTop: 20 }}>
            <label className="field full"><span>New Password</span>
              <input name="password" type="password" autoComplete="new-password" minLength={14} maxLength={128} required />
            </label>
            <label className="field full"><span>Confirm New Password</span>
              <input name="confirmation" type="password" autoComplete="new-password" minLength={14} maxLength={128} required />
            </label>
            <p className="full">Use at least 14 characters, including uppercase and lowercase letters, a number and a symbol.</p>
            {state.message ? <p className="full" role="status">{state.message}</p> : null}
            <div className="full action-row">
              <button type="submit" className="portal-button portal-button-primary" disabled={pending || state.ok}>
                {pending ? "Updating password..." : "Change Password"}
              </button>
              {state.ok ? <Link href="/student/student-profile">Open Student Profile</Link> : null}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
