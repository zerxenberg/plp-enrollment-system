"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export async function approveSubjectContactRequirement({
  curriculumCode, subjectCode, componentType, weeklyMinutes, sourceReference,
}) {
  await requireRole("academic-coordinator");
  if (!curriculumCode || !subjectCode || !sourceReference ||
    !["LECTURE", "LABORATORY", "OTHER"].includes(componentType) ||
    !Number.isInteger(weeklyMinutes) || weeklyMinutes < 30 || weeklyMinutes > 900) {
    throw new Error("An approved curricular source and valid weekly contact hours are required.");
  }
  const client = await createClient();
  const { data, error } = await client.rpc("coordinator_set_subject_contact_requirement_v1", {
    p_curriculum: curriculumCode,
    p_subject: subjectCode,
    p_component: componentType,
    p_minutes: weeklyMinutes,
    p_source_reference: sourceReference,
  });
  if (error || data !== true) throw new Error("Contact requirement approval was rejected.");
  return { saved: true };
}

export async function classifyApprovedDraftMeeting(meetingId, componentType) {
  await requireRole("academic-coordinator");
  if (!meetingId || !["LECTURE", "LABORATORY", "OTHER"].includes(componentType)) {
    throw new Error("An existing meeting and approved component classification are required.");
  }
  const client = await createClient();
  const { data, error } = await client.rpc("coordinator_classify_draft_meeting_v1", {
    p_meeting_id: meetingId,
    p_component: componentType,
  });
  if (error || data !== true) throw new Error("Draft meeting classification was rejected.");
  revalidatePath("/academic-coordinator/sections-schedules");
  return { saved: true };
}

export async function getAuthorizedCanonicalCollegePrograms(role) {
  if (!["student", "registrar", "academic-coordinator", "system-administrator"].includes(role)) {
    throw new Error("Unsupported PLP role.");
  }
  await requireRole(role);
  const client = await createClient();
  const { data, error } = await client.rpc("authorized_college_program_catalog_v1");
  if (error) throw new Error("College and program reference data are not available.");
  return data || [];
}
