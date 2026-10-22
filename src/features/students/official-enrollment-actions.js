"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

async function roleAction(role, functionName, args) {
  await requireRole(role);
  const client = await createClient();
  const { data, error } = await client.rpc(functionName, args);
  if (error) {
    // Do not disclose private student details or trusted SQL function bodies.
    throw new Error("The requested enrollment action could not be completed.");
  }
  return data;
}

export async function openStudentEnrollment(termId) {
  if (!termId) throw new Error("An academic term is required.");
  return { enrollmentId: await roleAction("student", "student_open_enrollment_v1",
    { p_term_id: termId }) };
}

export async function selectStudentEnrollmentSubject(enrollmentId, subjectCode, sectionId) {
  if (!enrollmentId || !subjectCode || !sectionId) {
    throw new Error("A student enrollment, subject and class section are required.");
  }
  const selected = await roleAction("student", "student_select_enrollment_subject_v1", {
    p_enrollment_id: enrollmentId,
    p_subject_code: subjectCode,
    p_section_id: sectionId,
  });
  revalidatePath("/student/enrollment");
  return { selected: selected === true };
}

export async function submitStudentEnrollment(enrollmentId) {
  if (!enrollmentId) throw new Error("Enrollment ID required.");
  const submitted = await roleAction("student", "student_submit_enrollment_v1",
    { p_enrollment_id: enrollmentId });
  revalidatePath("/student/enrollment");
  return { submitted: submitted === true };
}

export async function confirmRegistrarValidatedEnrollment(enrollmentId, sourceReference) {
  if (!enrollmentId || !String(sourceReference ?? "").trim()) {
    throw new Error("An enrollment and official validation reference are required.");
  }
  const confirmationReference = await roleAction("registrar",
    "registrar_confirm_validated_enrollment_v1", {
      p_enrollment_id: enrollmentId,
      p_source_reference: sourceReference,
    });
  revalidatePath("/registrar/enrollment");
  revalidatePath("/student/enrollment");
  return { confirmationReference };
}
