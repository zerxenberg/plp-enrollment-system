"use server";

import { getProjectOnlyInitialPasswordState } from "@/lib/auth/project-only-first-login-server";
import { recordProjectOnlyPasswordRotation } from "@/lib/auth/project-only-first-login-rotation.mjs";

export async function changeInitialProjectOnlyPassword(formData) {
  const password = formData.get("password");
  const confirmation = formData.get("confirmation");
  if (typeof password !== "string" || password.length < 14 || password.length > 128 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password) ||
      password !== confirmation) {
    return { ok: false, message: "Use 14 to 128 characters with uppercase, lowercase, number and symbol. Both entries must match." };
  }

  const state = await getProjectOnlyInitialPasswordState()
    .catch(() => ({ kind: "denied" }));
  if (state.kind !== "required") {
    return { ok: false, message: "This account is not eligible for initial password setup." };
  }

  // The password update is executed using the authenticated session, never
  // the service key. Only after success may the trusted server record rotation.
  const { error } = await state.supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: "Unable to update password. Please try again." };
  try {
    await recordProjectOnlyPasswordRotation(state.admin, state.account, state.user);
  } catch {
    return { ok: false, message: "Password updated but confirmation is pending. Contact your System Administrator." };
  }
  return { ok: true, message: "Password changed successfully. You can now open the Student Portal." };
}
