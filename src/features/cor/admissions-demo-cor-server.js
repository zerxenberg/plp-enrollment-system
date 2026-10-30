import "server-only";

import { buildVerifiedCorDocument } from "./cor-document.mjs";
import { verifiedCorSubjectDisplayCodes } from "./cor-subjects.mjs";

const SOURCE = "ADMISSIONS_PHASE8_DEMONSTRATION";

// The caller must authorize the actual Student owner or Registrar role before
// using this privileged reader. Both roles receive the same saved document.
export async function admissionsDemoCorDocument(admin, enrollmentId, expectedStudentId = null) {
  if (!admin || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enrollmentId)) {
    throw new Error("Invalid demonstration registration reference.");
  }

  let enrollmentQuery = admin.from("admissions_phase8_demo_enrollments")
    .select("*").eq("id", enrollmentId);
  if (expectedStudentId) enrollmentQuery = enrollmentQuery.eq("student_id", expectedStudentId);
  const record = await enrollmentQuery.maybeSingle();
  const saved = record.data;
  if (record.error || !saved || saved.source_kind !== SOURCE ||
      saved.status !== "CONFIRMED_SIMULATION" || !saved.confirmed_at || !saved.confirmed_by ||
      saved.simulation_only !== true || saved.is_official !== false ||
      !Array.isArray(saved.subject_snapshot) || saved.subject_snapshot.length === 0) {
    throw new Error("A confirmed nonofficial Admissions registration is required.");
  }

  const [studentR, blockR, termR, registrarR, handoffR] = await Promise.all([
    admin.from("student_profiles")
      .select("id,user_id,student_number,program_code,year_level_number,is_synthetic_demo,record_kind")
      .eq("id", saved.student_id).maybeSingle(),
    admin.from("block_sections")
      .select("id,code,term_id,program_code,year_level,curriculum_code,is_synthetic_demo")
      .eq("id", saved.block_id).maybeSingle(),
    admin.from("academic_terms")
      .select("id,academic_year,semester").eq("id", saved.term_id).maybeSingle(),
    admin.from("app_users")
      .select("id,full_name,role_code")
      .eq("id", saved.confirmed_by).maybeSingle(),
    admin.from("admission_handoffs")
      .select("student_id,source_name,admission_status,synchronization_status")
      .eq("student_id", saved.student_id).eq("source_name", "PLP Admissions").maybeSingle(),
  ]);
  const student = studentR.data;
  const block = blockR.data;
  if ([studentR, blockR, termR, registrarR, handoffR].some((result) => result.error) ||
      !student?.user_id || student.is_synthetic_demo !== false ||
      student.record_kind === "PROJECT_ONLY" ||
      !block?.is_synthetic_demo || block.term_id !== saved.term_id ||
      block.program_code !== student.program_code ||
      block.curriculum_code !== saved.curriculum_code ||
      (Number.isInteger(student.year_level_number) && block.year_level !== student.year_level_number) ||
      !termR.data?.academic_year || !termR.data.semester ||
      registrarR.data?.role_code !== "registrar" ||
      handoffR.data?.admission_status !== "ACCEPTED" ||
      handoffR.data?.synchronization_status !== "Successful") {
    throw new Error("The confirmed Admissions registration provenance could not be verified.");
  }

  const [identityR, catalogR] = await Promise.all([
    admin.from("app_users")
      .select("id,full_name,sex,role_code,is_synthetic_demo,source_account_key")
      .eq("id", student.user_id).maybeSingle(),
    admin.from("subjects")
      .select("code,name").in("code", saved.subject_snapshot.map((item) => item.code)),
  ]);
  if (identityR.error || catalogR.error ||
      identityR.data?.id !== student.user_id ||
      identityR.data?.role_code !== "student" ||
      identityR.data?.is_synthetic_demo !== false ||
      !identityR.data?.source_account_key?.startsWith("PLP_ADMISSIONS:") ||
      !identityR.data?.full_name) {
    throw new Error("The registered student identity could not be verified.");
  }
  const subjectSnapshot = saved.subject_snapshot.map((subject) => ({
    subject_code: subject.code, subject_name: subject.name,
    section_id: subject.section_id, section_code: subject.section_code,
    academic_units: subject.units,
  }));
  const verifiedCatalog = verifiedCorSubjectDisplayCodes(subjectSnapshot, catalogR.data);
  const catalogNames = new Map(catalogR.data.map((subject) => [subject.code, subject.name]));
  if (subjectSnapshot.some((subject) =>
    !subject.section_id || !subject.section_code ||
    subject.subject_name !== catalogNames.get(subject.subject_code))) {
    throw new Error("The saved registration does not match the verified subject catalog.");
  }

  const meetings = saved.subject_snapshot.flatMap((subject) =>
    (subject.meetings || []).map((meeting) => ({
      subject_code: subject.code,
      day_of_week: meeting.day ?? meeting.day_of_week,
      start_time: meeting.start ?? meeting.start_time,
      end_time: meeting.end ?? meeting.end_time,
      room: meeting.room,
      professor: meeting.instructor || meeting.professor,
      lecture_lab_type: meeting.component || meeting.lecture_lab_type,
    })));
  if (!meetings.length || meetings.some((meeting) =>
    !meeting.room || !meeting.professor ||
    meeting.day_of_week == null || !meeting.start_time || !meeting.end_time)) {
    throw new Error("The confirmed classroom meeting snapshot is incomplete.");
  }

  const fee = saved.fee_estimate;
  const units = subjectSnapshot.reduce((sum, subject) => sum + Number(subject.academic_units || 0), 0);
  const totalFees = saved.subject_snapshot.reduce((sum, subject) => sum + Number(subject.feeEstimate || 0), 0);
  if (fee?.simulation_only !== true || fee.official !== false || fee.currency !== "PHP" ||
      fee.missingRateCount !== 0 || fee.verifiedRateCount !== subjectSnapshot.length ||
      Number(fee.totalUnits) !== units ||
      !Number.isFinite(Number(fee.estimatedAmount)) ||
      Math.abs(totalFees - Number(fee.estimatedAmount)) > 0.001) {
    throw new Error("The saved demonstration fee estimate is incomplete.");
  }
  const projectFeeEstimate = {
    official: false, assessmentIssued: false, subjectCount: subjectSnapshot.length,
    estimatedAmount: Number(fee.estimatedAmount), totalUnits: units,
    subjects: saved.subject_snapshot.map((subject) => ({
      code: subject.code, units: Number(subject.units),
      ratePerUnit: Number(subject.ratePerUnit),
      estimatedFee: Number(subject.feeEstimate),
    })),
  };
  const registration = {
    simulation_only: true, official: false, certificate_of_official_registration: false,
    registration_snapshot_complete: true,
    registration_status: "CONFIRMED FOR PROJECT SIMULATION",
    simulation_id: saved.id, confirmed_at: saved.confirmed_at,
    confirmed_by_registrar: registrarR.data.full_name,
    registration_reference: `DEMO-${saved.id.slice(0, 8).toUpperCase()}`,
    student: {
      student_number: student.student_number,
      student_name: identityR.data.full_name,
      program_code: student.program_code,
      year_level: student.year_level_number,
      home_block: block.code,
    },
    registered_subjects: subjectSnapshot,
    registered_schedule: meetings,
    registered_units: units,
    academic_year: termR.data.academic_year,
    semester: termR.data.semester,
  };
  return buildVerifiedCorDocument(registration, {
    studentSex: ["Male", "Female"].includes(identityR.data.sex) ? identityR.data.sex : null,
    subjectDisplayCodes: verifiedCatalog,
    projectFeeEstimate,
  });
}
