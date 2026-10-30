"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PORTAL_META } from "@/config/portal-navigation";
import { allowProjectOnlyLogin } from "@/lib/auth/project-only-login-guard";
import { requireProjectOnlyInitialPasswordRotation } from "@/lib/auth/project-only-first-login-rotation.mjs";
import { signInFailureMessage } from "@/features/auth/sign-in-error.mjs";
import {
  auditSuccessfulLogin,
  denySignedInAccount,
} from "@/lib/auth/sign-in-audit-safety.mjs";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function auditId() {
  return `AUTH-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

async function recordFailedLogin({
  email,
  actorUserId = null,
  actorLabel = null,
  reason,
}) {
  const adminClient = createAdminClient();

  await adminClient.from("audit_events").insert({
    id: auditId(),
    occurred_at: new Date().toISOString(),
    actor_user_id: actorUserId,
    actor_label: actorLabel || email || "Unknown account",
    module: "Authentication",
    action: "Failed Login",
    entity_type: "app_user",
    entity_key: actorUserId || email || null,
    result: "Failed",
    reason: reason || "Authentication failed.",
  });
}

export async function signInPortalUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const plainPassword = String(password || "");

  if (!normalizedEmail || !normalizedEmail.includes("@") || !plainPassword) {
    return {
      ok: false,
      message: "Enter your registered email and password.",
    };
  }

  // The application-account lookup is mandatory after Auth success. Verify
  // the required trusted backend exists BEFORE accepting a password and
  // potentially creating an Auth session cookie.
  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return { ok: false, message: "Authentication is temporarily unavailable." };
  }
  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: plainPassword,
    });

  if (authError || !authData?.user) {
    await auditSuccessfulLogin(() => recordFailedLogin({
      email: normalizedEmail,
      reason: authError
        ? "Supabase Auth sign-in failed."
        : "Supabase Auth rejected the supplied credentials.",
    }));

    return {
      ok: false,
      message: signInFailureMessage(authError),
    };
  }

  let appUser = null;
  let appUserError = null;
  try {
    const result = await adminClient
      .from("app_users")
      .select(`
        id,
        source_account_key,
        auth_user_id,
        role_code,
        full_name,
        email,
        account_status,
        login_enabled
      `)
      .eq("auth_user_id", authData.user.id)
      .single();
    appUser = result.data;
    appUserError = result.error;
  } catch {
    appUserError = new Error("Trusted application-account lookup unavailable.");
  }

  if (appUserError || !appUser) {
    return denySignedInAccount({
      message:
        "Your Supabase Auth account is not linked to a PLP Enrollment System account.",
      signOut: () => supabase.auth.signOut({ scope: "local" }),
      audit: () => recordFailedLogin({
        email: normalizedEmail,
        actorLabel: authData.user.email || normalizedEmail,
        reason: "Authenticated Supabase user is not linked to an application account.",
      }),
    });
  }
  if (String(appUser.source_account_key || "").startsWith("PLP_ADMISSIONS:") &&
      !authData.user.email_confirmed_at) {
    return denySignedInAccount({
      message: "Verify your Admissions invitation email before signing in.",
      signOut: () => supabase.auth.signOut({ scope: "local" }),
      audit: () => recordFailedLogin({
        email: normalizedEmail,
        actorUserId: appUser.id,
        reason: "Admissions email verification is incomplete.",
      }),
    });
  }

  if (appUser.account_status !== "Active" || !appUser.login_enabled) {
    return denySignedInAccount({
      message: "This PLP Enrollment System account is not enabled for login.",
      signOut: () => supabase.auth.signOut({ scope: "local" }),
      audit: () => recordFailedLogin({
        email: appUser.email,
        actorUserId: appUser.id,
        actorLabel: appUser.full_name,
        reason: "Application account is inactive or login is disabled.",
      }),
    });
  }

  if (!(await allowProjectOnlyLogin(adminClient, appUser, authData.user))) {
    return denySignedInAccount({
      message: "This PLP Enrollment System account is not enabled for login.",
      signOut: () => supabase.auth.signOut({ scope: "local" }),
      audit: () => recordFailedLogin({
        email: appUser.email,
        actorUserId: appUser.id,
        actorLabel: appUser.full_name,
        reason: "PROJECT_ONLY cohort access or Auth linkage is not active.",
      }),
    });
  }

  let initialPasswordChangeRequired;
  try {
    initialPasswordChangeRequired = await requireProjectOnlyInitialPasswordRotation(
      adminClient, appUser, authData.user,
    );
  } catch {
    return denySignedInAccount({
      message: "Account security verification is temporarily unavailable.",
      signOut: () => supabase.auth.signOut({ scope: "local" }),
      audit: () => recordFailedLogin({
        email: appUser.email,
        actorUserId: appUser.id,
        reason: "PROJECT_ONLY initial password state not verified.",
      }),
    });
  }

  const redirect = PORTAL_META[appUser.role_code]?.homeHref;

  if (!redirect) {
    return denySignedInAccount({
      message: "This account does not have a recognized portal role.",
      signOut: () => supabase.auth.signOut({ scope: "local" }),
      audit: () => recordFailedLogin({
        email: appUser.email,
        actorUserId: appUser.id,
        actorLabel: appUser.full_name,
        reason: `Unrecognized portal role: ${appUser.role_code}`,
      }),
    });
  }

  // Persist successful login activity and last_login_at in PostgreSQL.
  // The login remains valid even if the audit write itself fails.
  await auditSuccessfulLogin(() => supabase.rpc("record_own_auth_event", {
    p_event: "LOGIN",
  }));

  return {
    ok: true,
    user: {
      role: appUser.role_code,
      name: appUser.full_name,
      identifier: String(appUser.source_account_key || "").startsWith("PLP_ADMISSIONS:")
        ? normalizedEmail : appUser.email,
      sourceAccountKey: appUser.source_account_key,
      redirect: initialPasswordChangeRequired ? "/student/change-password" : redirect,
      initialPasswordChangeRequired,
    },
  };
}
