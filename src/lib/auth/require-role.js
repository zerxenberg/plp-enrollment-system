
import "server-only";

import { redirect } from "next/navigation";
import { PORTAL_META } from "@/config/portal-navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireRole(expectedRole) {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authUserId = claimsData?.claims?.sub;

  if (claimsError || !authUserId) {
    redirect("/");
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select(`
      id,
      auth_user_id,
      source_account_key,
      role_code,
      full_name,
      email,
      account_status,
      login_enabled
    `)
    .eq("auth_user_id", authUserId)
    .single();

  if (
    appUserError ||
    !appUser ||
    appUser.account_status !== "Active" ||
    !appUser.login_enabled
  ) {
    redirect("/");
  }

  if (appUser.role_code !== expectedRole) {
    redirect(PORTAL_META[appUser.role_code]?.homeHref || "/");
  }

  return appUser;
}
