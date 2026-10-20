import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowProjectOnlyLogin } from "@/lib/auth/project-only-login-guard";
import {
  requireProjectOnlyInitialPasswordRotation,
} from "@/lib/auth/project-only-first-login-rotation.mjs";

/** Always resolves identity on the server. No client-provided user ID. */
export async function getProjectOnlyInitialPasswordState() {
  const supabase = await createClient();
  const { data: identity, error: authError } = await supabase.auth.getUser();
  if (authError || !identity?.user) {
    return { kind: "anonymous", supabase };
  }
  const admin = createAdminClient();
  const { data: account, error } = await admin.from("app_users")
    .select("id,auth_user_id,role_code,account_status,login_enabled,source_account_key,email")
    .eq("auth_user_id", identity.user.id).maybeSingle();
  if (error || !account) {
    return { kind: "denied", supabase };
  }
  if (typeof account.source_account_key === "string" &&
      account.source_account_key.startsWith("PROJECT_ONLY") &&
      !account.source_account_key.startsWith("PROJECT_ONLY:")) {
    return { kind: "denied", supabase };
  }
  if (!String(account.source_account_key || "").startsWith("PROJECT_ONLY:")) {
    return { kind: "legacy", supabase, account, user: identity.user };
  }
  if (!(await allowProjectOnlyLogin(admin, account, identity.user))) {
    return { kind: "denied", supabase };
  }
  try {
    const required = await requireProjectOnlyInitialPasswordRotation(
      admin, account, identity.user,
    );
    return { kind: required ? "required" : "complete",
      supabase, admin, account, user: identity.user };
  } catch {
    return { kind: "denied", supabase };
  }
}
