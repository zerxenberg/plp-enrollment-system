// Called only by the server-only Student Profile loader with a trusted service
// client and the Auth identity returned by auth.getUser(). Never expose the
// privileged client or database records to browser components.
import { formatStudentName } from "../../utils/student-name.mjs";

const COHORT_KEY = "PLP_PROJECT_600_2026_1";
const PROJECT_PREFIX = "PROJECT_ONLY:";
const PROJECT_SOURCE_PREFIX = "PROJECT_ONLY:TERM-2026-1:";
const TYPES = {
  NEW_STUDENT: "New Student",
  TRANSFEREE: "Transferee",
  CONTINUING_STUDENT: "Continuing Student",
};
const UNAVAILABLE = Object.freeze({ mode: "unavailable" });

function isNonemptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function verifiedSex(value) {
  return value === "Male" || value === "Female" ? value : null;
}

function projectDisplay(record, appUser) {
  const proposed = record.synthetic_source_attributes;
  return {
    studentNumber: record.student_number,
    fullName: formatStudentName({ fullName: appUser.full_name }),
    sex: verifiedSex(appUser.sex),
    email: appUser.email,
    program: record.program_code || null,
    yearLevel: isNonemptyText(proposed.year_level_proposed) ? proposed.year_level_proposed : null,
    studentType: TYPES[record.student_type],
    curriculum: isNonemptyText(proposed.curriculum_code_proposed)
      ? proposed.curriculum_code_proposed : null,
    major: isNonemptyText(proposed.major_code_proposed)
      ? proposed.major_code_proposed : null,
    accountStatus: "Active (project account)",
  };
}

function liveDisplay(record, appUser) {
  return {
    studentNumber: record.student_number,
    fullName: formatStudentName({ fullName: appUser.full_name }),
    sex: verifiedSex(appUser.sex),
    email: appUser.email,
    program: record.program_code || null,
    yearLevel: record.year_level || null,
    studentType: record.student_type || null,
    curriculum: record.current_curriculum_code || null,
    academicClassification: record.academic_classification || null,
    studentStatus: record.student_status || null,
    accountStatus: appUser.account_status,
  };
}

/**
 * Resolve exactly one activated PROJECT_ONLY student without client supplied
 * identifiers. A denied or incomplete authenticated lookup never falls back
 * to the shared demo student. Ordinary active Student accounts also use their
 * own PostgreSQL student_profiles row and never inherit mock Student data.
 */
export async function resolveStudentProfile({ adminClient, authUser, verifyProjectAccount }) {
  if (!isNonemptyText(authUser?.id) || !adminClient ||
      typeof verifyProjectAccount !== "function") return UNAVAILABLE;

  try {
    const accountResult = await adminClient.from("app_users")
      .select("id,auth_user_id,source_account_key,role_code,full_name,sex,email,account_status,login_enabled,is_synthetic_demo")
      .eq("auth_user_id", authUser.id).maybeSingle();
    const appUser = accountResult.data;
    if (accountResult.error || !appUser || appUser.auth_user_id !== authUser.id ||
        appUser.role_code !== "student" || appUser.account_status !== "Active" ||
        appUser.login_enabled !== true) return UNAVAILABLE;

    const key = appUser.source_account_key;
    // Project-tagged identities, including malformed tags, cannot use the
    // ordinary student query without passing project approval.
    if (!isNonemptyText(key) || !key.startsWith(PROJECT_PREFIX)) {
      if (appUser.is_synthetic_demo === true ||
          (typeof key === "string" && key.startsWith("PROJECT_ONLY"))) {
        return UNAVAILABLE;
      }
      const ordinaryResult = await adminClient.from("student_profiles")
        .select("id,user_id,student_number,program_code,year_level,student_type,student_status,academic_classification,current_curriculum_code,is_synthetic_demo")
        .eq("user_id", appUser.id)
        .maybeSingle();
      const ordinary = ordinaryResult.data;
      if (ordinaryResult.error || !ordinary || !isNonemptyText(ordinary.id) ||
          ordinary.user_id !== appUser.id || ordinary.is_synthetic_demo !== false ||
          !isNonemptyText(ordinary.student_number) ||
          !isNonemptyText(appUser.full_name) ||
          !isNonemptyText(appUser.email)) {
        return UNAVAILABLE;
      }
      return { mode: "live", profile: liveDisplay(ordinary, appUser) };
    }
    if (!key.startsWith(PROJECT_SOURCE_PREFIX) ||
        appUser.is_synthetic_demo !== true ||
        !isNonemptyText(appUser.id) || !isNonemptyText(appUser.full_name) ||
        !isNonemptyText(appUser.email) ||
        !(await verifyProjectAccount(adminClient, appUser, authUser))) {
      return UNAVAILABLE;
    }

    const [linkResult, profileResult] = await Promise.all([
      adminClient.from("project_auth_student_links")
        .select("app_user_id,auth_user_id,student_id,cohort_id,source_key,source_fingerprint,state")
        .eq("app_user_id", appUser.id)
        .eq("auth_user_id", authUser.id)
        .maybeSingle(),
      adminClient.from("student_profiles")
        .select("id,user_id,student_number,program_code,student_type,student_status,year_level,academic_classification,current_curriculum_code,is_synthetic_demo,synthetic_source_key,synthetic_source_attributes,record_kind,project_cohort_id,institutional_verified_at")
        .eq("user_id", appUser.id)
        .maybeSingle(),
    ]);
    if (linkResult.error || profileResult.error) return UNAVAILABLE;
    const link = linkResult.data;
    const profile = profileResult.data;
    const proposed = profile?.synthetic_source_attributes;
    if (!link || !profile || !proposed || Array.isArray(proposed) ||
        typeof proposed !== "object" ||
        link.app_user_id !== appUser.id ||
        link.auth_user_id !== authUser.id ||
        link.student_id !== profile.id ||
        link.source_key !== key ||
        link.state !== "ACTIVE" ||
        profile.user_id !== appUser.id ||
        profile.synthetic_source_key !== key ||
        key !== PROJECT_SOURCE_PREFIX + profile.student_number ||
        !isNonemptyText(profile.student_number) ||
        !TYPES[profile.student_type] ||
        profile.record_kind !== "PROJECT_ONLY" ||
        profile.project_cohort_id !== COHORT_KEY ||
        profile.is_synthetic_demo !== true ||
        profile.institutional_verified_at != null ||
        profile.student_status != null ||
        profile.year_level != null ||
        profile.academic_classification != null ||
        profile.current_curriculum_code != null ||
        proposed.purpose !== "PROJECT_ONLY" ||
        proposed.cohort_key !== COHORT_KEY ||
        proposed.data_origin !== "GENERATED_PROJECT" ||
        proposed.row_fingerprint !== link.source_fingerprint ||
        proposed.institutional_verified !== false ||
        proposed.admission_approved !== false ||
        proposed.official_enrollment !== false) return UNAVAILABLE;

    const membershipResult = await adminClient.from("student_data_cohort_members")
      .select("cohort_id,student_id,classification,data_origin,source_reference")
      .eq("cohort_id", link.cohort_id)
      .eq("student_id", profile.id)
      .maybeSingle();
    const member = membershipResult.data;
    if (membershipResult.error || !member ||
        member.cohort_id !== link.cohort_id ||
        member.student_id !== profile.id ||
        member.classification !== profile.student_type ||
        member.data_origin !== "GENERATED_PROJECT" ||
        member.source_reference !== key) return UNAVAILABLE;

    return { mode: "project", profile: projectDisplay(profile, appUser) };
  } catch {
    return UNAVAILABLE;
  }
}
