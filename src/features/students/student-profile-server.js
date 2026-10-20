import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowProjectOnlyLogin } from "@/lib/auth/project-only-login-guard";
import {
  requireProjectOnlyInitialPasswordRotation,
} from "@/lib/auth/project-only-first-login-rotation.mjs";
import { resolveStudentProfile } from "./project-student-profile-lookup.mjs";

export async function loadStudentProfileForPage() {
  try {
    // Validated Auth identity is required on each server-rendered request.
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return { mode: "unavailable" };

    const adminClient = createAdminClient();
    return await resolveStudentProfile({
      adminClient,
      authUser: data.user,
      // Enforce initial password rotation AGAIN at the actual profile data
      // boundary, not only in the parent layout. Direct RSC/navigation or
      // a concurrently rendered page cannot expose an unrotated identity.
      verifyProjectAccount: async (trustedClient, appUser, authUser) => {
        if (!(await allowProjectOnlyLogin(trustedClient, appUser, authUser))) {
          return false;
        }
        return (await requireProjectOnlyInitialPasswordRotation(
          trustedClient, appUser, authUser,
        )) === false;
      },
    });
  } catch {
    // Database read failures and absent deployment must not render mock data.
    return { mode: "unavailable" };
  }
}
