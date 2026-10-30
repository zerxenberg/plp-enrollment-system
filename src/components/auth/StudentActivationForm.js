"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { completeAdmissionsInvitation } from "@/features/admissions/admissions-invitation-actions";

export default function StudentActivationForm() {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking your Admissions invitation...");

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      const ready = !error && Boolean(data?.user?.email_confirmed_at);
      setVerified(ready);
      setMessage(ready ? "Email verified. Create your student account password to activate login."
        : "Your invitation has expired or has not been verified. Request a new invitation from the Enrollment Administrator.");
    };
    check();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const ready = Boolean(session?.user?.email_confirmed_at);
      if (ready) {
        setVerified(true);
        setMessage("Email verified. Create your student account password to activate login.");
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    const result = await completeAdmissionsInvitation({ password });
    setBusy(false);
    setMessage(result.message);
    if (result.ok) {
      setPassword("");
      setConfirm("");
      router.replace("/student/dashboard");
      router.refresh();
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f2f7f3", padding: 20 }}>
      <section style={{ background: "#fff", padding: 32, maxWidth: 450, width: "100%", borderRadius: 18, boxShadow: "0 8px 40px #16382117" }}>
        <h1 style={{ fontSize: 25, color: "#0e4d35", marginBottom: 8 }}>Activate Student Account</h1>
        <p role="status" style={{ color: "#435c4c", marginBottom: 20 }}>{message}</p>
        {verified ? (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>Create Password
              <input type="password" autoComplete="new-password" minLength={12} maxLength={128}
                required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="12+ characters, upper/lowercase and number"
                style={{ padding: 12, borderRadius: 8, border: "1px solid #b9cfc1" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>Confirm Password
              <input type="password" autoComplete="new-password" required value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={{ padding: 12, borderRadius: 8, border: "1px solid #b9cfc1" }} />
            </label>
            <button type="submit" disabled={busy}
              style={{ padding: 13, borderRadius: 9, border: 0, color: "white", background: "#13734d", cursor: "pointer" }}>
              {busy ? "Activating..." : "Set Password & Activate"}
            </button>
          </form>
        ) : null}
        <p style={{ marginTop: 20, fontSize: 13 }}><Link href="/">Back to Login Portal</Link></p>
      </section>
    </main>
  );
}
