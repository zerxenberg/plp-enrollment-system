"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

// Academic authority stays with the Coordinator. A browser, Registrar, or
// service-role client must never activate unreviewed classroom sections.
export async function activateReadyProjectClassSections() {
  await requireRole("academic-coordinator");
  const client = await createClient();
  const { data, error } = await client.rpc("project_phase8_activate_ready_sections_v1");
  if (error || data?.project_only !== true ||
      data.actor_role !== "academic-coordinator" ||
      !Number.isInteger(data.activated_sections)) {
    return { ok: false, message: "Verified project class sections could not be activated. Review the academic timetable and retry." };
  }
  for (const route of ["/academic-coordinator/sections-schedules", "/student/enrollment",
    "/student/dashboard", "/student/class-schedule", "/registrar/enrollment"]) {
    revalidatePath(route);
  }
  return { ok: true, message: `${data.activated_sections} verified project subject sections activated for enrollment.`, count: data.activated_sections };
}
