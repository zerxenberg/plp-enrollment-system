// This policy is called only through the server-only module. Keep its data
// source a trusted service-role Supabase client, never a browser-provided one.
const PROJECT_PREFIX = "PROJECT_ONLY:";
const PROJECT_SOURCE = /^PROJECT_ONLY:TERM-2026-1:[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const COHORT = "PLP_PROJECT_600_2026_1";
const MANIFEST_SHA256 =
  "592b2c56baf3334ffc4898996bb3a3976c808ada5652d564141096e150cb66bc";

/**
 * Existing institutional/student/staff logins intentionally do not access
 * PROJECT_ONLY tables or new schema columns. Only namespaced fictional
 * identities require this additional fail-closed server-side check.
 */
export async function allowProjectOnlyLogin(adminClient, account, authUser) {
  const sourceKey = account?.source_account_key;
  // Malformed project-prefixed identities must never fall through to legacy
  // login handling or gain a shared demonstration Student view.
  if (typeof sourceKey === "string" &&
      sourceKey.startsWith("PROJECT_ONLY") &&
      !sourceKey.startsWith(PROJECT_PREFIX)) {
    return false;
  }
  if (typeof sourceKey !== "string" || !sourceKey.startsWith(PROJECT_PREFIX)) {
    return true;
  }

  const authUserId = authUser?.id;
  if (!PROJECT_SOURCE.test(sourceKey) ||
      !account.id || !authUserId ||
      !authUser?.email_confirmed_at ||
      authUser?.email?.toLowerCase() !== account.email?.toLowerCase() ||
      account.auth_user_id !== authUserId ||
      account.role_code !== "student" ||
      account.account_status !== "Active" ||
      account.login_enabled !== true) {
    return false;
  }

  try {
    // Only the service-role RPC may inspect the complete approved project
    // provenance, exact 600-manifest, one-to-one profile and membership.
    // An absent (not-yet-deployed) RPC is a DENY, never a fallback to login.
    const { data: eligible, error: eligibilityError } = await adminClient.rpc(
      "project_auth_eligible_v1", { p_app_user_id: account.id },
    );
    if (eligibilityError || eligible !== true) return false;

    const { data: link, error: linkError } = await adminClient
      .from("project_auth_student_links")
      .select(
        "app_user_id,auth_user_id,source_key,cohort_id,state,activated_at," +
        "operator_approval_reference,approved_by",
      )
      .eq("app_user_id", account.id)
      .maybeSingle();
    if (linkError || !link || link.app_user_id !== account.id ||
        link.auth_user_id !== authUserId ||
        link.source_key !== sourceKey ||
        link.state !== "ACTIVE" || !link.cohort_id ||
        !link.activated_at || !link.operator_approval_reference) {
      return false;
    }

    // These fields exist only for the 600 new project accounts. Query them
    // conditionally to preserve all existing four-role login paths on the
    // current production database, before the new migrations are deployed.
    const [controlResult, cohortResult, projectAccountResult] = await Promise.all([
      adminClient.from("project_auth_cohort_control")
        .select(
          "cohort_id,enabled,purpose,source_type,manifest_sha256," +
          "activation_approval_reference,manual_activation_guarded," +
          "production_write_approved,approved_by,approved_via,approved_at",
        )
        .eq("cohort_id", link.cohort_id).maybeSingle(),
      adminClient.from("student_data_cohorts")
        .select("id,cohort_key,is_project_data,expected_count")
        .eq("id", link.cohort_id).maybeSingle(),
      adminClient.from("app_users")
        .select(
          "id,auth_user_id,source_account_key,account_kind,project_cohort_id," +
          "is_synthetic_demo,institutional_verified_at,project_activation_approved_at",
        )
        .eq("id", account.id).maybeSingle(),
    ]);
    const control = controlResult.data;
    const cohort = cohortResult.data;
    const projectAccount = projectAccountResult.data;
    return !controlResult.error && !cohortResult.error &&
      !projectAccountResult.error &&
      control?.cohort_id === link.cohort_id &&
      control.enabled === true &&
      control.purpose === "PROJECT_ONLY" &&
      control.source_type === "GENERATED_PROJECT" &&
      control.manifest_sha256?.toLowerCase() === MANIFEST_SHA256 &&
      control.manual_activation_guarded === true &&
      control.production_write_approved === true &&
      Boolean(control.approved_at) &&
      // A nullable SYSTEM_MIGRATION approver is legal in the SQL draft,
      // but is not evidence of administrator-controlled account activation.
      // Only a named, consistently recorded administrator approval permits a
      // PROJECT_ONLY login; one-use independent approval still requires SQL.
      control.approved_via === "AUTHORIZED_SYSTEM_ADMIN" &&
      Boolean(control.approved_by) &&
      control.approved_by === link.approved_by &&
      control.activation_approval_reference === link.operator_approval_reference &&
      cohort?.id === link.cohort_id &&
      cohort.cohort_key === COHORT &&
      cohort.is_project_data === true &&
      cohort.expected_count === 600 &&
      projectAccount?.id === account.id &&
      projectAccount.auth_user_id === authUserId &&
      projectAccount.source_account_key === sourceKey &&
      projectAccount.account_kind === "PROJECT_ONLY" &&
      projectAccount.project_cohort_id === COHORT &&
      projectAccount.is_synthetic_demo === true &&
      projectAccount.institutional_verified_at == null &&
      Boolean(projectAccount.project_activation_approved_at);
  } catch {
    // A SQL migration, network error, or missing project table may not
    // accidentally enable a fictional student or affect ordinary logins.
    return false;
  }
}
