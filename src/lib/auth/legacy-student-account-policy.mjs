/**
 * Trusted account-state gate for existing, non-PROJECT_ONLY Student sessions.
 * Supabase Auth sessions may outlive a database-side account deactivation.
 * The server must revalidate the current application account on every route.
 */
export function isActiveLegacyStudentAccount(account, authUser) {
  return Boolean(
    account?.id &&
    authUser?.id &&
    account.auth_user_id === authUser.id &&
    account.role_code === "student" &&
    account.account_status === "Active" &&
    account.login_enabled === true &&
    !String(account.source_account_key || "").startsWith("PROJECT_ONLY"),
  );
}
