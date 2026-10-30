"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmissionsActivation } from "./admissions-activation-policy.mjs";

const fail = () => ({ ok: false, message: "Invitation verification failed. Contact the Enrollment System Administrator." });

export async function completeAdmissionsInvitation({ password }) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: "Use a password of 12–128 characters with uppercase, lowercase and a number." };
  }
  try {
    const client = await createClient();
    // getUser independently verifies the Auth token with Supabase; never trust
    // a submitted user/account identifier or editable JWT metadata.
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth?.user?.email_confirmed_at) return fail();
    const admin = createAdminClient();
    const { data: account, error: userError } = await admin.from("app_users")
      .select("id,auth_user_id,role_code,source_account_key,account_status,login_enabled")
      .eq("auth_user_id", auth.user.id).maybeSingle();
    if (userError || !account) return fail();
    const ref = String(account.source_account_key || "").replace(/^PLP_ADMISSIONS:/, "");
    const [profileResult, handoffResult, sourceResult] = await Promise.all([
      admin.from("student_profiles")
        .select("id,user_id,record_kind,student_type,student_status")
        .eq("user_id", account.id).maybeSingle(),
      admin.from("admission_handoffs")
        .select("applicant_reference,student_id,source_name,admission_status,synchronization_status")
        .eq("applicant_reference", ref).eq("source_name", "PLP Admissions").maybeSingle(),
      admin.from("admissions_student_source_details")
        .select("student_id,personal_email").eq("applicant_reference", ref).maybeSingle(),
    ]);
    if (profileResult.error || handoffResult.error || sourceResult.error ||
        !verifyAdmissionsActivation({
          identity: auth.user, account, profile: profileResult.data,
          handoff: handoffResult.data, source: sourceResult.data,
        })) return fail();

    // Password cannot be set until the invitation's email has been verified.
    // A failed application-state write leaves the user disabled for safe retry.
    const { error: passwordError } = await client.auth.updateUser({ password });
    if (passwordError) {
      return { ok: false, message: "Password could not be saved. Retry from the verification link." };
    }
    const { data: activated, error: activationError } = await admin.from("app_users")
      .update({ account_status: "Active", login_enabled: true })
      .eq("id", account.id).eq("auth_user_id", auth.user.id)
      .eq("account_status", "Inactive").eq("login_enabled", false)
      .select("id").maybeSingle();
    if (activationError || !activated) return fail();
    const { error: auditError } = await admin.from("audit_events").insert({
      id: `AUD-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`,
      occurred_at: new Date().toISOString(),
      actor_user_id: account.id,
      actor_label: "Verified Admissions student",
      module: "Admissions Integration",
      action: "Verified invitation and activated student login",
      entity_type: "app_user",
      entity_key: account.id,
      result: "Successful",
      reason: "Auth email was verified and a student-selected password was stored.",
    });
    if (auditError) console.error("Admissions activation audit unavailable", { code: auditError.code });
    return { ok: true, message: "Your student account is now active." };
  } catch {
    return fail();
  }
}
