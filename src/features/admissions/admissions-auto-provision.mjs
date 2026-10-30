// Server-only by contract: callers must supply the trusted Enrollment admin
// client. Never expose this function or the service key to the browser.
const REFERENCE = /^ADM-20\d{2}-\d{6,9}$/;
const VALID_TYPES = new Set(["NEW_STUDENT", "TRANSFEREE"]);

export function configuredAdmissionsInvitation({ enabled, redirectUrl }) {
  if (!enabled) return { enabled: false };
  try {
    const parsed = new URL(redirectUrl);
    const validOrigin = parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
    if (!validOrigin || parsed.username || parsed.password ||
        parsed.pathname !== "/activate-student-account" ||
        parsed.search || parsed.hash) {
      return { enabled: false, error: "Invalid invitation redirect URL." };
    }
    return { enabled: true, redirectTo: parsed.href };
  } catch {
    return { enabled: false, error: "Invitation redirect URL is missing." };
  }
}

export async function autoProvisionAdmissionsStudent({ admin, applicantRef, email, configuration }) {
  if (!configuration?.enabled) {
    return { status: configuration?.error ? "configuration_error" : "disabled" };
  }
  if (!REFERENCE.test(applicantRef)) return { status: "manual_review" };

  const { data: handoff, error: handoffError } = await admin.from("admission_handoffs")
    .select("student_id,admission_status,synchronization_status")
    .eq("applicant_reference", applicantRef)
    .eq("source_name", "PLP Admissions").maybeSingle();
  if (handoffError || !handoff || handoff.admission_status !== "ACCEPTED" ||
      handoff.synchronization_status !== "Successful") return { status: "manual_review" };

  const { data: profile, error: profileError } = await admin.from("student_profiles")
    .select("id,user_id,record_kind,student_type,student_status")
    .eq("id", handoff.student_id).maybeSingle();
  if (profileError || !profile || profile.record_kind === "PROJECT_ONLY" ||
      !VALID_TYPES.has(profile.student_type) || profile.student_status !== "ADMITTED") {
    return { status: "manual_review" };
  }
  // The institutional app_users.email is an assigned @plp.edu.ph address;
  // it is NOT necessarily a working mailbox. Use the verified source contact
  // address for an invitation, never silently send it to the school alias.
  const { data: sourceContact, error: sourceError } = await admin
    .from("admissions_student_source_details")
    .select("personal_email,student_id")
    .eq("applicant_reference", applicantRef).maybeSingle();
  if (sourceError || sourceContact?.student_id !== profile.id ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)) ||
      sourceContact.personal_email?.toLowerCase() !== String(email).toLowerCase()) {
    return { status: "manual_review" };
  }
  const { data: user, error: userError } = await admin.from("app_users")
    .select("id,email,role_code,source_account_key,auth_user_id,account_status,login_enabled")
    .eq("id", profile.user_id).maybeSingle();
  if (userError || !user || user.role_code !== "student" ||
      user.source_account_key !== `PLP_ADMISSIONS:${applicantRef}`) {
    return { status: "manual_review" };
  }
  if (user.auth_user_id) return { status: "already_linked" };
  // Never activate a user or silently take over an identity which already
  // has a nonstandard access state. Existing Auth email collisions are manual.
  if (user.account_status !== "Inactive" || user.login_enabled !== false) {
    return { status: "manual_review" };
  }

  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email, { redirectTo: configuration.redirectTo },
  );
  if (inviteError || !invite?.user?.id ||
      invite.user.email?.toLowerCase() !== email.toLowerCase()) {
    return { status: "manual_review" };
  }
  const invitedId = invite.user.id;
  const { data: linked, error: linkError } = await admin.from("app_users")
    .update({ auth_user_id: invitedId })
    .eq("id", user.id)
    .is("auth_user_id", null)
    .eq("account_status", "Inactive")
    .eq("login_enabled", false)
    .select("id,auth_user_id").maybeSingle();
  if (linkError || linked?.auth_user_id !== invitedId) {
    // This invite was just created by this attempt. Avoid deleting an Auth
    // account that some concurrent request has already linked successfully.
    const { data: owner } = await admin.from("app_users")
      .select("id").eq("auth_user_id", invitedId).maybeSingle();
    if (!owner) await admin.auth.admin.deleteUser(invitedId);
    return { status: "manual_review" };
  }
  const { error: auditError } = await admin.from("audit_events").insert({
    id: `AUD-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`,
    occurred_at: new Date().toISOString(),
    actor_label: "PLP Admissions integration",
    module: "Admissions Integration",
    action: "Automatic student Auth invitation",
    entity_type: "app_user",
    entity_key: user.id,
    result: "Successful",
    reason: "Accepted Admissions handoff; student must verify email and choose a password before activation.",
  });
  if (auditError) {
    // Identity is already linked; never retry invitation just for audit failure.
    console.error("Admissions invitation audit unavailable", { code: auditError.code });
  }
  return { status: "invitation_sent" };
}
