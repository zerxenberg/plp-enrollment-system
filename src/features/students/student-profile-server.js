import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowProjectOnlyLogin } from "@/lib/auth/project-only-login-guard";
import {
  requireProjectOnlyInitialPasswordRotation,
} from "@/lib/auth/project-only-first-login-rotation.mjs";
import { resolveStudentProfile } from "./project-student-profile-lookup.mjs";
import { getStudentContext } from "./student-context-server";
import { isOwnStudentPhotoPath } from "./student-profile-photo-path.mjs";

export async function loadStudentProfileForPage() {
  try {
    // Validated Auth identity is required on each server-rendered request.
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return { mode: "unavailable" };

    const adminClient = createAdminClient();
    const result = await resolveStudentProfile({
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
    if (result.mode !== "project") return result;

    // Resolve the same linked student again at the write-authority boundary;
    // never use a browser-provided student number or another account's photo.
    const ctx = await getStudentContext();
    if (ctx.kind !== "project" ||
        ctx.studentNumber !== result.profile.studentNumber) {
      return { mode: "unavailable" };
    }
    const { data: storedContact, error: contactError } = await ctx.client
      .from("student_profiles")
      .select("contact_number,alternate_contact_number,address")
      .eq("id", ctx.studentId).eq("user_id", ctx.appUserId).single();
    let contact = storedContact;
    let contactEditingReady = true;
    if (contactError?.code === "42703") {
      // The migration adds alternate_contact_number. During the review gap,
      // continue showing the verified student using current schema fields.
      const fallback = await ctx.client.from("student_profiles")
        .select("contact_number,address")
        .eq("id", ctx.studentId).eq("user_id", ctx.appUserId).single();
      if (fallback.error || !fallback.data) return { mode: "unavailable" };
      contact = fallback.data;
      contactEditingReady = false;
    } else if (contactError || !contact) return { mode: "unavailable" };

    // Storage remains private even to browser JWTs. Sign only an image whose
    // path belongs to the verified current student, using trusted server-only
    // credentials after getStudentContext validated the live project link.
    const { data: photo } = await ctx.client.from("student_profile_photos")
      .select("object_path").eq("student_id", ctx.studentId).maybeSingle();
    let photoUrl = null;
    if (photo?.object_path && isOwnStudentPhotoPath(photo.object_path, ctx.authUser.id)) {
      const { data: signed } = await ctx.admin.storage
        .from("student-profile-photos").createSignedUrl(photo.object_path, 900);
      photoUrl = signed?.signedUrl || null;
    }
    // Academic values are fictional and are displayed as simulated only when
    // the trusted owner-scoped project snapshot validates its provenance.
    const [{ data: snapshot, error: snapshotError }, { data: simulation }] = await Promise.all([
      ctx.client.rpc("project_phase8_student_snapshot_v2", { p_student_id: ctx.studentId }),
      ctx.admin.from("project_phase8_enrollment_simulations")
        .select("status").eq("student_id", ctx.studentId)
        .eq("term_id", "TERM-2026-1").maybeSingle(),
    ]);
    const validSnapshot = !snapshotError && snapshot?.project_only === true &&
      snapshot.data_origin === "GENERATED_PROJECT" &&
      snapshot.verified_institutionally === false &&
      snapshot.student_number === ctx.studentNumber;
    const projectEligible = validSnapshot && snapshot.schedule_validated_for_project === true &&
      Array.isArray(snapshot.subjects) && snapshot.subjects.some((subject) =>
        ["ELIGIBLE", "RETAKE"].includes(subject.eligibility));
    return { ...result, profile: { ...result.profile,
      curriculum: validSnapshot ? (snapshot.curriculum_code || result.profile.curriculum) : result.profile.curriculum,
      yearLevel: validSnapshot ? (snapshot.year_level || result.profile.yearLevel) : result.profile.yearLevel,
      academicClassification: validSnapshot && snapshot.academic_classification
        ? `Simulated: ${snapshot.academic_classification}` : "Not verified",
      enrollmentEligibility: validSnapshot
        ? (projectEligible ? "Prepared for project enrollment" : "Project validation pending")
        : "Not yet evaluated",
      projectEnrollmentStatus: simulation?.status ? `Project: ${simulation.status}` : "Project: Not started",
      contactEditingReady,
      contact: {
        contactNumber: contact.contact_number || "",
        alternateContactNumber: contact.alternate_contact_number || "",
        address: contact.address || "",
      }, photoUrl,
    } };
  } catch {
    // Database read failures and absent deployment must not render mock data.
    return { mode: "unavailable" };
  }
}
