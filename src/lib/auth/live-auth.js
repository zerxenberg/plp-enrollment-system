import { supabase } from "@/lib/supabase/client";
import { PORTAL_META } from "@/config/portal-navigation";
import { signInPortalUser } from "@/features/auth/auth-actions";

const ACTIVE = new Set(["ACTIVE", "Active"]);

function authorizedProfile(record, user) {
  if (!record || record.auth_user_id !== user?.id ||
      !ACTIVE.has(record.account_status) || record.login_enabled !== true ||
      !PORTAL_META[record.role_code]) {
    return null;
  }
  return {
    id: record.id,
    authUserId: user.id,
    role: record.role_code,
    name: record.full_name,
    identifier: record.email,
    sourceAccountKey: record.source_account_key,
    redirect: PORTAL_META[record.role_code].homeHref,
  };
}

/**
 * Authentication is supplied by Supabase Auth. Role and account activation
 * are always checked against app_users controlled by database RLS.
 * This is a browser-side presentation guard; database RLS remains authoritative.
 */
export async function getLiveSession() {
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity?.user) return null;
  const { data: appUser, error } = await supabase
    .from("app_users")
    .select("id,auth_user_id,role_code,full_name,email,account_status,login_enabled,source_account_key")
    .eq("auth_user_id", identity.user.id)
    .maybeSingle();
  if (error) throw new Error("Account permissions could not be verified.");
  return authorizedProfile(appUser, identity.user);
}

export async function signInLive({ identity, password }) {
  const normalized = String(identity || "").trim();
  if (!normalized.includes("@")) {
    let response;
    try {
      response = await fetch("/api/auth/university-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ identity: normalized, password }),
      });
    } catch {
      return { ok: false, message: "Authentication is temporarily unavailable." };
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !result.accessToken || !result.refreshToken) {
      return { ok: false, message: result?.message || "Invalid credentials or account access." };
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
    if (sessionError) return { ok: false, message: "Invalid credentials or account access." };
    if (result.initialPasswordChangeRequired === true && result.projectOnly === true) {
      // This project student's RLS-protected profile remains locked until
      // the verified initial password change is completed.
      return { ok: true, session: {
        role: "student", name: "Student", identifier: normalized,
        sourceAccountKey: "PROJECT_ONLY:", redirect: "/student/change-password",
      } };
    }
    try {
      const session = await getLiveSession();
      if (session) return { ok: true, session };
    } catch {
      // Treat any role mapping failure as denied, never as a valid sign in.
    }
    await supabase.auth.signOut();
    return { ok: false, message: "This account is not enabled for the Enrollment System." };
  }
  // Use the same trusted server login gate as the main email form. A
  // temporary-password PROJECT_ONLY user intentionally has no app_users RLS
  // self-read before rotation; a browser-only getLiveSession() must not
  // accidentally log this authorized first-login session back out.
  try {
    const result = await signInPortalUser({ email: normalized, password });
    if (!result?.ok || !result.user) {
      return { ok: false, message: result?.message || "Invalid credentials or account access." };
    }
    return { ok: true, session: {
      role: result.user.role,
      name: result.user.name,
      identifier: result.user.identifier,
      sourceAccountKey: result.user.sourceAccountKey,
      redirect: result.user.redirect,
    } };
  } catch {
    return { ok: false, message: "Authentication is temporarily unavailable." };
  }
}

export async function signOutLive() {
  await supabase.auth.signOut();
}
