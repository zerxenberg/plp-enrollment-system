/**
 * Trusted PROJECT_ONLY first-login state. This module is used only by
 * server-only entry points with a privileged database client. The source key
 * is not proof of authorization by itself.
 */
export async function requireProjectOnlyInitialPasswordRotation(admin, account, user) {
  if (!String(account?.source_account_key || "").startsWith("PROJECT_ONLY:")) {
    return false;
  }
  if (!account?.id || !user?.id || account.auth_user_id !== user.id ||
      account.role_code !== "student" || account.account_status !== "Active" ||
      account.login_enabled !== true || !user.email_confirmed_at) {
    throw new Error("PROJECT_ONLY identity not authorized");
  }
  const { data: link, error } = await admin.from("project_auth_student_links")
    .select("app_user_id,auth_user_id,state,initial_password_changed_at")
    .eq("app_user_id", account.id).maybeSingle();
  if (error || !link || link.app_user_id !== account.id ||
      link.auth_user_id !== user.id || link.state !== "ACTIVE") {
    throw new Error("PROJECT_ONLY first-login state unavailable");
  }
  return link.initial_password_changed_at == null;
}

/** Caller must successfully update the verified user's Auth password first. */
export async function recordProjectOnlyPasswordRotation(admin, account, user) {
  if (!account?.id || !user?.id || account.auth_user_id !== user.id ||
      !String(account.source_account_key || "").startsWith("PROJECT_ONLY:")) {
    throw new Error("PROJECT_ONLY identity mismatch");
  }
  const { data, error } = await admin.rpc(
    "project_auth_record_initial_password_change_v1", {
      p_app_user_id: account.id,
      p_auth_user_id: user.id,
    },
  );
  if (error || data !== true) {
    throw new Error("Password was changed, but security confirmation failed");
  }
  return true;
}
