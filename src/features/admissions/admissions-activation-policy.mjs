export function verifyAdmissionsActivation({ identity, account, profile, handoff, source }) {
  if (!identity?.id || !identity.email_confirmed_at ||
      !account || account.auth_user_id !== identity.id ||
      account.role_code !== "student" ||
      account.account_status !== "Inactive" || account.login_enabled !== false ||
      !/^PLP_ADMISSIONS:ADM-20\d{2}-\d{6,9}$/.test(account.source_account_key || "") ||
      !profile || profile.user_id !== account.id ||
      profile.record_kind === "PROJECT_ONLY" ||
      !["NEW_STUDENT", "TRANSFEREE"].includes(profile.student_type) ||
      profile.student_status !== "ADMITTED" ||
      !handoff || handoff.student_id !== profile.id ||
      handoff.applicant_reference !== account.source_account_key.slice("PLP_ADMISSIONS:".length) ||
      handoff.source_name !== "PLP Admissions" || handoff.admission_status !== "ACCEPTED" ||
      handoff.synchronization_status !== "Successful" ||
      !source || source.student_id !== profile.id ||
      source.personal_email?.toLowerCase() !== identity.email?.toLowerCase()) {
    return false;
  }
  return true;
}
