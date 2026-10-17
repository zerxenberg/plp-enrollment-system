"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PORTAL_META } from "@/config/portal-navigation";

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

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: plainPassword,
    });

  if (authError || !authData.user) {
    await recordFailedLogin({
      email: normalizedEmail,
      reason: "Supabase Auth rejected the supplied credentials.",
    });

    return {
      ok: false,
      message: "The registered email or password is incorrect.",
    };
  }

  const adminClient = createAdminClient();

  const { data: appUser, error: appUserError } = await adminClient
    .from("app_users")
    .select(`
      id,
      source_account_key,
      role_code,
      full_name,
      email,
      account_status,
      login_enabled
    `)
    .eq("auth_user_id", authData.user.id)
    .single();

  if (appUserError || !appUser) {
    await recordFailedLogin({
      email: normalizedEmail,
      actorLabel: authData.user.email || normalizedEmail,
      reason: "Authenticated Supabase user is not linked to an application account.",
    });

    await supabase.auth.signOut({ scope: "local" });

    return {
      ok: false,
      message:
        "Your Supabase Auth account is not linked to a PLP Enrollment System account.",
    };
  }

  if (appUser.account_status !== "Active" || !appUser.login_enabled) {
    await recordFailedLogin({
      email: appUser.email,
      actorUserId: appUser.id,
      actorLabel: appUser.full_name,
      reason: "Application account is inactive or login is disabled.",
    });

    await supabase.auth.signOut({ scope: "local" });

    return {
      ok: false,
      message: "This PLP Enrollment System account is not enabled for login.",
    };
  }

  const redirect = PORTAL_META[appUser.role_code]?.homeHref;

  if (!redirect) {
    await recordFailedLogin({
      email: appUser.email,
      actorUserId: appUser.id,
      actorLabel: appUser.full_name,
      reason: `Unrecognized portal role: ${appUser.role_code}`,
    });

    await supabase.auth.signOut({ scope: "local" });

    return {
      ok: false,
      message: "This account does not have a recognized portal role.",
    };
  }

  // Persist successful login activity and last_login_at in PostgreSQL.
  // The login remains valid even if the audit write itself fails.
  await supabase.rpc("record_own_auth_event", {
    p_event: "LOGIN",
  });

  return {
    ok: true,
    user: {
      role: appUser.role_code,
      name: appUser.full_name,
      identifier: appUser.email,
      sourceAccountKey: appUser.source_account_key,
      redirect,
    },
  };
}
