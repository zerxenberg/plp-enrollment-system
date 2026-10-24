import "server-only";

import { createClient } from "@/lib/supabase/server";

const PROJECT_TERM_ID = "TERM-2026-1";
const PROJECT_COHORT_ID = "PLP_PROJECT_600_2026_1";
const PROJECT_CURRICULUM_PREFIX = "P8F26-";
const PROJECT_BLOCK_SOURCE_PREFIX = "PHASE8_PROJECT_2026:";
const PROJECT_SCHEDULE_SOURCE_SYSTEM = "PHASE8_FICTIONAL_GENERATOR";
const PROJECT_SCHEDULE_SOURCE_PREFIX = "PHASE8_FICTIONAL_SCHEDULE_V1:";

function assertQuery(error, label) {
  if (!error) return;
  console.error(`[Registrar][Query][ERROR] ${label}`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
  throw new Error("Registrar data could not be loaded. Please try again or contact the system administrator if the problem continues.");
}

function formatDateTime(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

function enrichTerms(rows) {
  return (rows || []).map((row) => ({
    ...row,
    enrollmentStartLabel: formatDate(row.enrollment_start),
    enrollmentEndLabel: formatDate(row.enrollment_end),
    createdAtLabel: formatDateTime(row.created_at),
    updatedAtLabel: formatDateTime(row.updated_at),
  }));
}

async function loadRowsByInChunks(
  supabase,
  table,
  select,
  column,
  values,
  orderBy = null,
  chunkSize = 100,
) {
  const uniqueValues = [...new Set((values || []).filter(Boolean))];
  if (!uniqueValues.length) return [];

  const rows = [];
  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    const chunk = uniqueValues.slice(index, index + chunkSize);
    let query = supabase.from(table).select(select).in(column, chunk);
    if (orderBy) query = query.order(orderBy);

    const { data, error } = await query;
    assertQuery(error, `Load filtered ${table}`);
    rows.push(...(data || []));
  }

  return rows;
}

async function loadOwnNotifications(supabase, userId) {
  const { data: deliveries, error: deliveryError } = await supabase
    .from("user_notifications")
    .select("notification_id,is_read,read_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  assertQuery(deliveryError, "Load Registrar notification deliveries");

  if (!deliveries?.length) return [];

  const ids = deliveries.map((item) => item.notification_id);
  const { data: messages, error: messageError } = await supabase
    .from("notifications")
    .select("id,title,message,category,related_path,published_at,created_at")
    .in("id", ids);
  assertQuery(messageError, "Load Registrar notifications");

  const byId = new Map((messages || []).map((item) => [item.id, item]));
  return deliveries
    .map((delivery) => {
      const message = byId.get(delivery.notification_id);
      if (!message) return null;
      return {
        id: message.id,
        title: message.title,
        message: message.message,
        category: message.category,
        relatedHref: message.related_path || "/registrar/notifications",
        date: formatDateTime(message.published_at || message.created_at),
        read: Boolean(delivery.is_read),
        publishedAt: message.published_at,
      };
    })
    .filter(Boolean);
}

async function loadProjectQueue(supabase) {
  const { data, error } = await supabase.rpc("project_phase8_registrar_simulation_queue_v1");
  assertQuery(error, "Load protected project enrollment queue");
  return data?.records || [];
}


async function loadVisibleStudentProfiles(supabase) {
  const selection =
    "id,user_id,student_number,program_code,current_term_id,current_curriculum_code,contact_number,address,emergency_contact_name,emergency_contact_number,alternate_contact_number,year_level,year_level_number,student_type,student_status,academic_classification,progression_status,record_kind,project_cohort_id,is_synthetic_demo,institutional_verified_at,created_at,updated_at";

  const [projectResult, institutionalResult] = await Promise.all([
    supabase
      .from("student_profiles")
      .select(selection)
      .eq("record_kind", "PROJECT_ONLY")
      .eq("project_cohort_id", PROJECT_COHORT_ID)
      .eq("is_synthetic_demo", true)
      .order("student_number"),
    supabase
      .from("student_profiles")
      .select(selection)
      .eq("is_synthetic_demo", false)
      .order("student_number"),
  ]);

  assertQuery(projectResult.error, "Load Phase 8 PROJECT_ONLY student profiles");
  assertQuery(institutionalResult.error, "Load institutional student profiles");

  return [
    ...(projectResult.data || []),
    ...(institutionalResult.data || []),
  ];
}


async function loadProjectBlocksAndRosters(supabase, { strict = false } = {}) {
  const { data: blocks, error } = await supabase
    .from("block_sections")
    .select("id,term_id,code,program_code,curriculum_code,year_level,section_letter,capacity,planning_status,synthetic_source_key,is_synthetic_demo")
    .eq("term_id", PROJECT_TERM_ID)
    .like("curriculum_code", `${PROJECT_CURRICULUM_PREFIX}%`)
    .like("synthetic_source_key", `${PROJECT_BLOCK_SOURCE_PREFIX}%`)
    .eq("is_synthetic_demo", true)
    .order("code");
  assertQuery(error, "Load Phase 8 project block sections");

  const rosterResults = await Promise.all(
    (blocks || []).map(async (block) => {
      const { data, error: rosterError } = await supabase.rpc(
        "project_phase8_block_roster_v1",
        { p_block_id: block.id },
      );
      if (rosterError) {
        if (strict) assertQuery(rosterError, `Load protected roster for ${block.code}`);
        return { block, students: [], unavailable: true };
      }
      if (data?.fictional_only !== true || data?.block_id !== block.id ||
          !Array.isArray(data?.students)) {
        if (strict) throw new Error("A protected Phase 8 student roster returned invalid data.");
        return { block, students: [], unavailable: true };
      }
      return { block, students: data.students, unavailable: false };
    }),
  );

  return rosterResults;
}


async function loadOfficialGradeImportContexts(supabase) {
  const { data: enrollmentRows, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id,student_id,term_id,program_code,curriculum_code,status")
    .eq("status", "CONFIRMED");
  assertQuery(enrollmentError, "Load confirmed official grade import attempts");

  if (!enrollmentRows?.length) return [];

  const studentIds = [...new Set(enrollmentRows.map((row) => row.student_id).filter(Boolean))];
  const profiles = await loadRowsByInChunks(
    supabase,
    "student_profiles",
    "id,student_number,is_synthetic_demo,record_kind",
    "id",
    studentIds,
    "student_number",
  );
  const officialStudentIds = new Set(
    profiles
      .filter((row) => row.is_synthetic_demo === false && row.record_kind !== "PROJECT_ONLY")
      .map((row) => row.id),
  );

  const officialEnrollments = enrollmentRows.filter((row) => officialStudentIds.has(row.student_id));
  const enrollmentMap = new Map(officialEnrollments.map((row) => [row.id, row]));
  const enrollmentIds = officialEnrollments.map((row) => row.id);
  if (!enrollmentIds.length) return [];

  const enrollmentSubjects = (
    await loadRowsByInChunks(
      supabase,
      "enrollment_subjects",
      "enrollment_id,subject_code,section_id,registration_status,units_at_enrollment",
      "enrollment_id",
      enrollmentIds,
    )
  ).filter(
    (row) => row.registration_status === "CONFIRMED" && row.section_id && enrollmentMap.has(row.enrollment_id),
  );

  const sectionIds = [...new Set(enrollmentSubjects.map((row) => row.section_id).filter(Boolean))];
  const sections = (
    await loadRowsByInChunks(
      supabase,
      "sections",
      "id,term_id,subject_code,section_code,source_system,is_synthetic_demo,status,schedule_status",
      "id",
      sectionIds,
      "section_code",
    )
  ).filter((row) => row.is_synthetic_demo === false);
  const sectionMap = new Map(sections.map((row) => [row.id, row]));

  const usableAttempts = enrollmentSubjects.filter((row) => {
    const enrollment = enrollmentMap.get(row.enrollment_id);
    const section = sectionMap.get(row.section_id);
    return Boolean(
      enrollment &&
      section &&
      section.term_id === enrollment.term_id &&
      section.subject_code === row.subject_code
    );
  });

  const termIds = [...new Set(officialEnrollments.map((row) => row.term_id).filter(Boolean))];
  const programCodes = [...new Set(officialEnrollments.map((row) => row.program_code).filter(Boolean))];
  const subjectCodes = [...new Set(usableAttempts.map((row) => row.subject_code).filter(Boolean))];

  const [terms, programs, subjects, sectionInstructors, assignments] = await Promise.all([
    loadRowsByInChunks(
      supabase,
      "academic_terms",
      "id,label,short_label,academic_year,semester,status",
      "id",
      termIds,
      "id",
    ),
    loadRowsByInChunks(
      supabase,
      "programs",
      "code,name,organizational_unit_code,status",
      "code",
      programCodes,
      "code",
    ),
    loadRowsByInChunks(
      supabase,
      "subjects",
      "code,name,units,status",
      "code",
      subjectCodes,
      "code",
    ),
    loadRowsByInChunks(
      supabase,
      "section_instructors",
      "section_id,instructor_id,assignment_role",
      "section_id",
      sectionIds,
      "section_id",
    ),
    loadRowsByInChunks(
      supabase,
      "block_student_assignments",
      "student_id,block_id,term_id,status,assigned_at,ended_at",
      "student_id",
      studentIds,
    ),
  ]);

  const primaryInstructorLinks = sectionInstructors.filter((row) => row.assignment_role === "PRIMARY");
  const instructorIds = [...new Set(primaryInstructorLinks.map((row) => row.instructor_id).filter(Boolean))];
  const blockIds = [...new Set(assignments.map((row) => row.block_id).filter(Boolean))];
  const orgUnitCodes = [...new Set(programs.map((row) => row.organizational_unit_code).filter(Boolean))];

  const [instructors, blocks, organizationalUnits] = await Promise.all([
    loadRowsByInChunks(
      supabase,
      "instructors",
      "id,display_name,is_synthetic_demo",
      "id",
      instructorIds,
      "display_name",
    ),
    loadRowsByInChunks(
      supabase,
      "block_sections",
      "id,term_id,code,program_code,curriculum_code,is_synthetic_demo",
      "id",
      blockIds,
      "code",
    ),
    loadRowsByInChunks(
      supabase,
      "organizational_units",
      "code,name,unit_type,is_active",
      "code",
      orgUnitCodes,
      "name",
    ),
  ]);

  const termMap = new Map(terms.map((row) => [row.id, row]));
  const programMap = new Map(programs.map((row) => [row.code, row]));
  const subjectMap = new Map(subjects.map((row) => [row.code, row]));
  const instructorMap = new Map(instructors.map((row) => [row.id, row]));
  const blockMap = new Map(blocks.filter((row) => row.is_synthetic_demo === false).map((row) => [row.id, row]));
  const unitMap = new Map(organizationalUnits.map((row) => [row.code, row]));
  const primaryInstructorBySection = new Map(
    primaryInstructorLinks.map((row) => [row.section_id, instructorMap.get(row.instructor_id) || null]),
  );

  const assignmentByStudentTerm = new Map();
  for (const row of assignments) {
    const block = blockMap.get(row.block_id);
    if (!block || block.term_id !== row.term_id) continue;
    assignmentByStudentTerm.set(`${row.student_id}|${row.term_id}`, block);
  }

  const contexts = new Map();
  for (const attempt of usableAttempts) {
    const enrollment = enrollmentMap.get(attempt.enrollment_id);
    const section = sectionMap.get(attempt.section_id);
    const term = termMap.get(enrollment.term_id);
    const program = programMap.get(enrollment.program_code);
    const college = unitMap.get(program?.organizational_unit_code);
    const subject = subjectMap.get(attempt.subject_code);
    const instructor = primaryInstructorBySection.get(section.id);
    const block = assignmentByStudentTerm.get(`${enrollment.student_id}|${enrollment.term_id}`) || null;
    const previousBlockCode = block?.code || "";
    const key = [enrollment.term_id, enrollment.program_code, previousBlockCode || "NO_BLOCK", attempt.subject_code, section.id].join("|");

    if (!contexts.has(key)) {
      contexts.set(key, {
        id: key,
        termId: enrollment.term_id,
        termLabel: term?.label || enrollment.term_id,
        academicYear: term?.academic_year || "Not available",
        semester: term?.semester || "Not available",
        collegeCode: program?.organizational_unit_code || "Not available",
        collegeName: college?.name || "Not available",
        programCode: enrollment.program_code,
        programName: program?.name || "Not available",
        previousBlockCode: previousBlockCode || "Not available",
        previousBlockAvailable: Boolean(previousBlockCode),
        subjectCode: attempt.subject_code,
        subjectName: subject?.name || "Not available",
        sectionId: section.id,
        sectionCode: section.section_code || "Not available",
        instructorId: instructor?.id || "",
        instructorName: instructor?.display_name || "Not available",
        sourceSystem: section.source_system || "Not available",
        confirmedStudentCount: 0,
      });
    }

    contexts.get(key).confirmedStudentCount += 1;
  }

  return [...contexts.values()].sort((a, b) =>
    `${a.academicYear}|${a.semester}|${a.collegeName}|${a.programCode}|${a.previousBlockCode}|${a.subjectCode}`
      .localeCompare(`${b.academicYear}|${b.semester}|${b.collegeName}|${b.programCode}|${b.previousBlockCode}|${b.subjectCode}`),
  );
}

async function loadOfficialEnrollmentRows(supabase) {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id,reference,student_id,program_code,term_id,curriculum_code,status,eligibility_status,declared_units,validation_preset,submitted_at,last_validated_at,confirmation_reference,confirmed_at,current_correction_reason,created_at,updated_at")
    .eq("term_id", PROJECT_TERM_ID)
    .order("created_at", { ascending: false });
  assertQuery(error, "Load current-term official enrollments");
  return data || [];
}

async function loadCurrentActorId(supabase) {
  const { data, error } = await supabase.rpc("current_app_user_id");
  if (error || !data) return null;
  return data;
}

function statusCounts(rows) {
  return (rows || []).reduce((map, row) => {
    const key = row.status || "UNKNOWN";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function mapProjectQueue(queue, blockMap) {
  return queue.map((row) => {
    const block = blockMap.get(row.home_block_id);
    return {
      ...row,
      full_name: row.student_name || "Not available",
      current_term_id: row.term_id,
      home_block: block?.code || "Not available",
      program_code: block?.program_code || "Not available",
      curriculum_code: block?.curriculum_code || "Not available",
      year_level: block?.year_level || "Not available",
      status: row.status,
      project_only: true,
      project_simulation_id: row.id,
      submittedAtLabel: formatDateTime(row.submitted_at),
      validatedAtLabel: formatDateTime(row.validated_at),
      confirmedAtLabel: formatDateTime(row.confirmed_at),
    };
  });
}


export async function getRegistrarShellData(userId) {
  const supabase = await createClient();
  const [termResult, notifications] = await Promise.all([
    supabase
      .from("academic_terms")
      .select("id,label,short_label,academic_year,semester,enrollment_start,enrollment_end,status,source_inferred")
      .eq("id", PROJECT_TERM_ID)
      .maybeSingle(),
    loadOwnNotifications(supabase, userId),
  ]);
  assertQuery(termResult.error, "Load current project academic term");

  const term = termResult.data
    ? enrichTerms([termResult.data])[0]
    : null;

  return {
    term: term
      ? {
          id: term.id,
          label: term.label,
          shortLabel: term.short_label,
          academicYear: term.academic_year,
          semester: term.semester,
          enrollmentStart: term.enrollmentStartLabel,
          enrollmentEnd: term.enrollmentEndLabel,
          status: term.status,
        }
      : null,
    notifications,
  };
}

export async function getRegistrarDashboardData() {
  const supabase = await createClient();

  const [
    profiles,
    termsResult,
    official,
    projectQueue,
    projectBlocks,
    activityResult,
    actorId,
  ] = await Promise.all([
    loadVisibleStudentProfiles(supabase),
    supabase.from("academic_terms").select("*").eq("id", PROJECT_TERM_ID).maybeSingle(),
    loadOfficialEnrollmentRows(supabase),
    loadProjectQueue(supabase),
    loadProjectBlocksAndRosters(supabase),
    supabase
      .from("academic_change_history")
      .select("id,module,record_reference,action,occurred_at,actor_role_code,reason")
      .eq("actor_role_code", "registrar")
      .order("occurred_at", { ascending: false })
      .limit(12),
    loadCurrentActorId(supabase),
  ]);

  assertQuery(termsResult.error, "Load academic terms");
  assertQuery(activityResult.error, "Load Registrar activity");

  const currentTerm = termsResult.data
    ? enrichTerms([termsResult.data])[0]
    : null;

  const capacityConcerns = projectBlocks
    .map(({ block, students }) => ({
      id: block.id,
      code: block.code,
      programCode: block.program_code || "Not available",
      yearLevel: block.year_level || "Not available",
      capacity: block.capacity || 0,
      assigned: students.length,
    }))
    .filter((row) => row.capacity > 0 && row.capacity - row.assigned <= 5)
    .sort((a, b) => (a.capacity - a.assigned) - (b.capacity - b.assigned));

  return {
    currentTerm,
    studentCount: profiles.length,
    projectStudentCount: profiles.filter((row) => row.record_kind === "PROJECT_ONLY").length,
    officialCounts: statusCounts(official),
    projectCounts: statusCounts(projectQueue),
    gradeImportSummary: {
      available: false,
      total: null,
      awaitingValidation: null,
      awaitingVerification: null,
      readyToPublish: null,
      published: null,
    },
    capacityConcerns,
    recentActivity: (activityResult.data || []).map((item) => ({
      ...item,
      occurredAtLabel: formatDateTime(item.occurred_at),
    })),
    notifications: actorId ? (await loadOwnNotifications(supabase, actorId)).slice(0, 5) : [],
  };
}


export async function getRegistrarStudentsData() {
  const supabase = await createClient();

  const [
    profiles,
    projectBlocks,
    termResult,
    curriculaResult,
    gradeImportContexts,
  ] = await Promise.all([
    loadVisibleStudentProfiles(supabase),
    loadProjectBlocksAndRosters(supabase, { strict: true }),
    supabase
      .from("academic_terms")
      .select("id,label,short_label,academic_year,semester,status")
      .eq("id", PROJECT_TERM_ID)
      .maybeSingle(),
    supabase
      .from("curricula")
      .select("code,program_code,name,effective_year_start,status,version_label,effective_academic_year")
      .like("code", `${PROJECT_CURRICULUM_PREFIX}%`)
      .order("code"),
    loadOfficialGradeImportContexts(supabase),
  ]);

  assertQuery(termResult.error, "Load current academic term");
  assertQuery(curriculaResult.error, "Load Phase 8 curricula");

  const p8Curricula = curriculaResult.data || [];
  const projectProfiles = profiles.filter((row) =>
    row.record_kind === "PROJECT_ONLY" && row.project_cohort_id === PROJECT_COHORT_ID);
  const projectProfilesById = new Map(projectProfiles.map((row) => [row.id, row]));
  const visibleProgramCodes = [
    ...new Set([
      ...p8Curricula.map((row) => row.program_code),
      ...projectBlocks.map(({ block }) => block.program_code),
      ...gradeImportContexts.map((row) => row.programCode),
    ].filter(Boolean)),
  ];

  const programsResult = visibleProgramCodes.length
    ? await supabase
        .from("programs")
        .select("code,name,organizational_unit_code,status")
        .in("code", visibleProgramCodes)
        .order("code")
    : { data: [], error: null };
  assertQuery(programsResult.error, "Load programs used by current Registrar datasets");

  const organizationalUnitCodes = [
    ...new Set((programsResult.data || []).map((row) => row.organizational_unit_code).filter(Boolean)),
  ];
  const unitsResult = organizationalUnitCodes.length
    ? await supabase
        .from("organizational_units")
        .select("code,name,is_active")
        .in("code", organizationalUnitCodes)
        .order("name")
    : { data: [], error: null };
  assertQuery(unitsResult.error, "Load organizational units used by current programs");

  const programMap = new Map((programsResult.data || []).map((row) => [row.code, row]));
  const unitMap = new Map((unitsResult.data || []).map((row) => [row.code, row]));

  // A PROJECT_ONLY student profile deliberately has no authoritative current
  // block, year, classification, or progression values. The staff-authorized
  // Phase 8 roster RPC supplies verified placement information instead.
  const seenStudentIds = new Set();
  const students = [];
  const groups = [];

  for (const { block, students: roster } of projectBlocks) {
    const program = programMap.get(block.program_code);
    const college = unitMap.get(program?.organizational_unit_code);
    groups.push({
      id: block.id,
      blockId: block.id,
      blockSection: block.code,
      college: college?.name || "Not available",
      programCode: block.program_code,
      programName: program?.name || block.program_code,
      curriculumCode: block.curriculum_code,
      termId: block.term_id,
      yearLevel: block.year_level,
      capacity: block.capacity,
      assignedStudents: roster.length,
      confirmedStudents: 0,
      source: "Demonstration",
    });

    for (const member of roster) {
      const profile = projectProfilesById.get(member.student_id);
      if (!profile || seenStudentIds.has(member.student_id) ||
          member.student_number !== profile.student_number) {
        throw new Error("Phase 8 student roster and cohort profiles are inconsistent.");
      }
      seenStudentIds.add(member.student_id);
      students.push({
        student_id: profile.id,
        user_id: profile.user_id,
        student_number: member.student_number,
        full_name: member.full_name || "Not available",
        program_code: block.program_code,
        program_name: program?.name || block.program_code,
        college: college?.name || "Not available",
        current_term_id: block.term_id,
        curriculum_code: block.curriculum_code,
        year_level: member.year_level ?? block.year_level,
        student_type: profile.student_type || "Not available",
        student_status: profile.student_status || "Not available",
        academic_classification: member.academic_classification || "Not available",
        progression_status: profile.progression_status || "Not available",
        enrollment_status: member.enrollment_status || "Not available",
        project_only: true,
        home_block_id: block.id,
        home_block: block.code,
        block_capacity: block.capacity,
        block_planning_status: block.planning_status || "Not available",
      });
    }
  }

  if (projectProfiles.length !== seenStudentIds.size || (projectProfiles.length > 0 && !groups.length)) {
    throw new Error("The verified Phase 8 roster does not cover the current project cohort.");
  }

  return {
    students,
    groups: groups.sort((a, b) =>
      a.programCode.localeCompare(b.programCode) ||
      a.yearLevel - b.yearLevel ||
      a.blockSection.localeCompare(b.blockSection)),
    terms: termResult.data ? [termResult.data] : [],
    programs: programsResult.data || [],
    curricula: p8Curricula,
    colleges: unitsResult.data || [],
    gradeImportContexts,
    gradeHistoryAvailable: false,
  };
}

export async function getRegistrarEnrollmentData() {
  const supabase = await createClient();

  const [
    termResult,
    officialRows,
    projectQueueRaw,
    projectBlocks,
    profiles,
  ] = await Promise.all([
    supabase
      .from("academic_terms")
      .select("*")
      .eq("id", PROJECT_TERM_ID)
      .maybeSingle(),
    loadOfficialEnrollmentRows(supabase),
    loadProjectQueue(supabase),
    loadProjectBlocksAndRosters(supabase),
    loadVisibleStudentProfiles(supabase),
  ]);

  assertQuery(termResult.error, "Load current enrollment term");

  const projectBlockMap = new Map(
    projectBlocks.map(({ block }) => [block.id, block]),
  );
  const project = mapProjectQueue(projectQueueRaw, projectBlockMap);
  const profileMap = new Map(profiles.map((row) => [row.id, row]));

  const officialStudentIds = [
    ...new Set(officialRows.map((row) => row.student_id).filter(Boolean)),
  ];

  let assignments = [];
  if (officialStudentIds.length) {
    const { data, error } = await supabase
      .from("block_student_assignments")
      .select("student_id,block_id,term_id,status,assigned_at,ended_at")
      .in("student_id", officialStudentIds)
      .eq("term_id", PROJECT_TERM_ID)
      .is("ended_at", null);
    assertQuery(error, "Load current institutional block assignments");
    assignments = data || [];
  }

  const assignmentMap = new Map(assignments.map((row) => [row.student_id, row]));
  const institutionalBlockIds = [
    ...new Set(assignments.map((row) => row.block_id).filter(Boolean)),
  ];

  let institutionalBlocks = [];
  if (institutionalBlockIds.length) {
    const { data, error } = await supabase
      .from("block_sections")
      .select("id,term_id,code,program_code,curriculum_code,year_level,capacity,planning_status,is_synthetic_demo")
      .in("id", institutionalBlockIds);
    assertQuery(error, "Load current institutional blocks referenced by enrollments");
    institutionalBlocks = data || [];
  }

  const blockMap = new Map([
    ...[...projectBlockMap.entries()],
    ...institutionalBlocks.map((row) => [row.id, row]),
  ]);

  const enrollmentIds = officialRows.map((row) => row.id);
  let subjectRows = [];
  let historyRows = [];
  let correctionRows = [];

  if (enrollmentIds.length) {
    const [subjectsResult, historyResult, correctionsResult] = await Promise.all([
      supabase
        .from("enrollment_subjects")
        .select("enrollment_id,subject_code,section_id,units_at_enrollment,registration_status")
        .in("enrollment_id", enrollmentIds),
      supabase
        .from("enrollment_status_history")
        .select("id,enrollment_id,actor_label,action,previous_status,new_status,reason,changed_at")
        .in("enrollment_id", enrollmentIds)
        .order("changed_at", { ascending: false }),
      supabase
        .from("enrollment_corrections")
        .select("id,enrollment_id,correction_type,reason,affected_information,corrected_information,requested_at,applied_at")
        .in("enrollment_id", enrollmentIds)
        .order("requested_at", { ascending: false }),
    ]);
    assertQuery(subjectsResult.error, "Load current enrollment subjects");
    assertQuery(historyResult.error, "Load current enrollment status history");
    assertQuery(correctionsResult.error, "Load current enrollment corrections");
    subjectRows = subjectsResult.data || [];
    historyRows = historyResult.data || [];
    correctionRows = correctionsResult.data || [];
  }

  const subjectCodes = [
    ...new Set(subjectRows.map((row) => row.subject_code).filter(Boolean)),
  ];
  const sectionIds = [
    ...new Set(subjectRows.map((row) => row.section_id).filter(Boolean)),
  ];

  let subjectMap = new Map();
  let sectionMap = new Map();

  if (subjectCodes.length) {
    const result = await supabase
      .from("subjects")
      .select("code,name,units")
      .in("code", subjectCodes);
    assertQuery(result.error, "Load subjects referenced by current official enrollments");
    subjectMap = new Map((result.data || []).map((row) => [row.code, row]));
  }

  if (sectionIds.length) {
    const result = await supabase
      .from("sections")
      .select("id,section_code,subject_code,schedule_status,status,capacity,term_id,is_synthetic_demo")
      .in("id", sectionIds)
      .eq("is_synthetic_demo", false);
    assertQuery(result.error, "Load sections referenced by current official enrollments");
    sectionMap = new Map((result.data || []).map((row) => [row.id, row]));
  }

  const official = officialRows.map((row) => {
    const profile = profileMap.get(row.student_id);
    const assignment = assignmentMap.get(row.student_id);
    const block = assignment ? blockMap.get(assignment.block_id) : null;
    const subjects = subjectRows
      .filter((item) => item.enrollment_id === row.id)
      .map((item) => ({
        ...item,
        subjectName: subjectMap.get(item.subject_code)?.name || "Not available",
        sectionCode: sectionMap.get(item.section_id)?.section_code || "Not available",
        scheduleStatus: sectionMap.get(item.section_id)?.schedule_status || "Not available",
      }));

    const history = historyRows
      .filter((item) => item.enrollment_id === row.id)
      .map((item) => ({
        ...item,
        changedAtLabel: formatDateTime(item.changed_at),
      }));

    const corrections = correctionRows
      .filter((item) => item.enrollment_id === row.id)
      .map((item) => ({
        ...item,
        requestedAtLabel: formatDateTime(item.requested_at),
        appliedAtLabel: formatDateTime(item.applied_at),
      }));

    return {
      ...row,
      studentNumber: profile?.student_number || "Not available",
      studentName: "Not available",
      academicClassification: profile?.academic_classification || "Not available",
      currentBlock: block?.code || "Not available",
      targetBlock: block?.code || "Not available",
      submittedAtLabel: formatDateTime(row.submitted_at),
      validatedAtLabel: formatDateTime(row.last_validated_at),
      confirmedAtLabel: formatDateTime(row.confirmed_at),
      subjects,
      history,
      corrections,
    };
  });

  const visibleProgramCodes = [
    ...new Set([
      ...official.map((row) => row.program_code),
      ...project.map((row) => row.program_code),
    ].filter(Boolean)),
  ];

  const programsResult = visibleProgramCodes.length
    ? await supabase
        .from("programs")
        .select("code,name,status")
        .in("code", visibleProgramCodes)
        .order("code")
    : { data: [], error: null };
  assertQuery(programsResult.error, "Load programs represented in current enrollment data");

  return {
    terms: termResult.data ? enrichTerms([termResult.data]) : [],
    official,
    project,
    programs: programsResult.data || [],
    projectTermId: PROJECT_TERM_ID,
    projectCohortId: PROJECT_COHORT_ID,
    capabilities: {
      enrollmentPeriodMutation: false,
      officialReviewMutation: false,
      officialConfirmation: true,
      projectProcessing: true,
    },
  };
}


export async function getRegistrarAcademicData() {
  const supabase = await createClient();

  const [curriculaResult, termResult, projectBlocks] = await Promise.all([
    supabase
      .from("curricula")
      .select("code,program_code,name,effective_year_start,status,program_track_code,version_label,effective_academic_year")
      .like("code", `${PROJECT_CURRICULUM_PREFIX}%`)
      .order("code"),
    supabase
      .from("academic_terms")
      .select("*")
      .eq("id", PROJECT_TERM_ID)
      .maybeSingle(),
    loadProjectBlocksAndRosters(supabase),
  ]);

  assertQuery(curriculaResult.error, "Load Phase 8 project curricula");
  assertQuery(termResult.error, "Load Phase 8 project term");

  const curricula = curriculaResult.data || [];
  const curriculumCodes = curricula.map((row) => row.code);
  const programCodes = [...new Set(curricula.map((row) => row.program_code).filter(Boolean))];

  const [programsResult, curriculumSubjectsResult, prerequisitesResult, subjectsResult] =
    await Promise.all([
      programCodes.length
        ? supabase
            .from("programs")
            .select("code,name,organizational_unit_code,status")
            .in("code", programCodes)
            .order("code")
        : Promise.resolve({ data: [], error: null }),
      curriculumCodes.length
        ? supabase
            .from("curriculum_subjects")
            .select("curriculum_code,subject_code,year_level,semester,is_required,display_category,display_order,units_override,year_level_number")
            .in("curriculum_code", curriculumCodes)
            .order("curriculum_code")
            .order("display_order")
        : Promise.resolve({ data: [], error: null }),
      curriculumCodes.length
        ? supabase
            .from("subject_prerequisites")
            .select("curriculum_code,subject_code,prerequisite_subject_code,is_active,created_at")
            .in("curriculum_code", curriculumCodes)
            .eq("is_active", true)
            .order("curriculum_code")
            .order("subject_code")
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("subjects")
        .select("code,name,units,description,status")
        .like("code", `${PROJECT_CURRICULUM_PREFIX}%`)
        .order("code"),
    ]);

  assertQuery(programsResult.error, "Load programs represented by P8F26 curricula");
  assertQuery(curriculumSubjectsResult.error, "Load P8F26 curriculum subjects");
  assertQuery(prerequisitesResult.error, "Load P8F26 prerequisites");
  assertQuery(subjectsResult.error, "Load P8F26 subjects");

  const blockIds = projectBlocks.map(({ block }) => block.id);
  const blockLinks = await loadRowsByInChunks(
    supabase,
    "block_subject_sections",
    "block_id,section_id,created_at",
    "block_id",
    blockIds,
    "created_at",
  );

  const linkedSectionIds = [...new Set(blockLinks.map((row) => row.section_id).filter(Boolean))];
  const rawSections = await loadRowsByInChunks(
    supabase,
    "sections",
    "id,source_system,source_key,term_id,subject_code,section_code,capacity,status,schedule_status,is_synthetic_demo,created_at,updated_at",
    "id",
    linkedSectionIds,
    "section_code",
  );

  const sections = rawSections.filter(
    (row) =>
      row.term_id === PROJECT_TERM_ID &&
      row.source_system === PROJECT_SCHEDULE_SOURCE_SYSTEM &&
      row.is_synthetic_demo === true &&
      String(row.subject_code || "").startsWith(PROJECT_CURRICULUM_PREFIX) &&
      String(row.source_key || "").startsWith(PROJECT_SCHEDULE_SOURCE_PREFIX),
  );

  const sectionIds = sections.map((row) => row.id);
  const [meetingsResult, sectionInstructors] = await Promise.all([
    supabase
      .from("section_meetings")
      .select("id,section_id,day_of_week,start_time,end_time,room_id,display_time,meeting_status,is_synthetic_demo,synthetic_source_key,meeting_component_type,meeting_contact_minutes")
      .eq("is_synthetic_demo", true)
      .like("synthetic_source_key", `${PROJECT_SCHEDULE_SOURCE_PREFIX}MEETING:%`)
      .order("day_of_week")
      .order("start_time"),
    loadRowsByInChunks(
      supabase,
      "section_instructors",
      "section_id,instructor_id,assignment_role,created_at",
      "section_id",
      sectionIds,
      "section_id",
    ),
  ]);

  assertQuery(meetingsResult.error, "Load Phase 8 schedule meetings");

  const sectionIdSet = new Set(sectionIds);
  const meetings = (meetingsResult.data || []).filter((row) =>
    sectionIdSet.has(row.section_id),
  );

  const instructorIds = [
    ...new Set(
      sectionInstructors
        .filter((row) => row.assignment_role === "PRIMARY")
        .map((row) => row.instructor_id)
        .filter(Boolean),
    ),
  ];
  const roomIds = [...new Set(meetings.map((row) => row.room_id).filter(Boolean))];

  const [rawInstructors, rawRooms] = await Promise.all([
    loadRowsByInChunks(
      supabase,
      "instructors",
      "id,display_name,is_synthetic_demo,synthetic_source_key",
      "id",
      instructorIds,
      "display_name",
    ),
    loadRowsByInChunks(
      supabase,
      "rooms",
      "id,room_code,building_name,is_active,is_synthetic_demo,synthetic_source_key",
      "id",
      roomIds,
      "room_code",
    ),
  ]);

  const instructors = rawInstructors.filter(
    (row) =>
      row.is_synthetic_demo === true &&
      String(row.synthetic_source_key || "").startsWith(
        `${PROJECT_SCHEDULE_SOURCE_PREFIX}FACULTY:`,
      ),
  );
  const rooms = rawRooms.filter(
    (row) =>
      row.is_synthetic_demo === true &&
      String(row.synthetic_source_key || "").startsWith(
        `${PROJECT_SCHEDULE_SOURCE_PREFIX}ROOM:`,
      ),
  );

  const subjectMap = new Map((subjectsResult.data || []).map((item) => [item.code, item]));
  const sectionMap = new Map(sections.map((item) => [item.id, item]));
  const roomMap = new Map(rooms.map((item) => [item.id, item]));
  const instructorMap = new Map(instructors.map((item) => [item.id, item]));
  const instructorBySection = new Map();

  for (const link of sectionInstructors) {
    if (link.assignment_role === "PRIMARY") {
      instructorBySection.set(
        link.section_id,
        instructorMap.get(link.instructor_id)?.display_name || "Not available",
      );
    }
  }

  const meetingsBySection = new Map();
  for (const meeting of meetings) {
    if (meeting.meeting_status !== "ACTIVE") continue;
    const list = meetingsBySection.get(meeting.section_id) || [];
    list.push({
      ...meeting,
      roomCode: roomMap.get(meeting.room_id)?.room_code || "Not available",
    });
    meetingsBySection.set(meeting.section_id, list);
  }

  const rosterCountByBlock = new Map(
    projectBlocks.map(({ block, students }) => [block.id, students.length]),
  );

  const blockRows = projectBlocks.map(({ block }) => {
    const linkedSections = blockLinks
      .filter((link) => link.block_id === block.id)
      .map((link) => sectionMap.get(link.section_id))
      .filter(Boolean);

    return {
      ...block,
      projectAssignedCount: rosterCountByBlock.get(block.id) || 0,
      officialConfirmedCount: 0,
      sections: linkedSections.map((section) => ({
        ...section,
        subjectName: subjectMap.get(section.subject_code)?.name || "Not available",
        meetings: meetingsBySection.get(section.id) || [],
        instructor: instructorBySection.get(section.id) || "Not available",
      })),
    };
  });

  return {
    dataset: {
      label: "Curriculum Project 2026",
      curriculumPrefix: PROJECT_CURRICULUM_PREFIX,
      cohortId: PROJECT_COHORT_ID,
      termId: PROJECT_TERM_ID,
    },
    programs: programsResult.data || [],
    curricula,
    subjects: subjectsResult.data || [],
    curriculumSubjects: curriculumSubjectsResult.data || [],
    prerequisites: prerequisitesResult.data || [],
    terms: termResult.data ? enrichTerms([termResult.data]) : [],
    blocks: blockRows,
  };
}


export async function getRegistrarReportsData() {
  const supabase = await createClient();
  const [studentsData, enrollmentData, activityResult] = await Promise.all([
    getRegistrarStudentsData(),
    getRegistrarEnrollmentData(),
    supabase
      .from("academic_change_history")
      .select("id,module,record_reference,action,previous_value,new_value,occurred_at,actor_role_code,entity_type,reason")
      .eq("actor_role_code", "registrar")
      .order("occurred_at", { ascending: false })
      .limit(1000),
  ]);

  assertQuery(activityResult.error, "Load Registrar activity history");

  return {
    students: studentsData.students,
    groups: studentsData.groups,
    officialEnrollments: enrollmentData.official,
    projectEnrollments: enrollmentData.project,
    gradeBatches: [],
    gradeHistoryAvailable: false,
    terms: enrollmentData.terms,
    programs: enrollmentData.programs,
    // The existing data_quality_issues table is a historical normalization
    // ledger and is not scoped to P8F26. Do not surface it as current Phase 8
    // operational data.
    dataQualityIssues: [],
    activity: (activityResult.data || []).map((item) => ({
      ...item,
      occurredAtLabel: formatDateTime(item.occurred_at),
    })),
  };
}


export async function getRegistrarNotificationsData(userId) {
  const supabase = await createClient();
  const notifications = await loadOwnNotifications(supabase, userId);

  return {
    notifications,
    announcements: [],
    announcementsAvailable: false,
    terms: [],
    programs: [],
  };
}


export async function getRegistrarProfileData(userId) {
  const supabase = await createClient();

  const [userResult, staffResult, preferencesResult] = await Promise.all([
    supabase
      .from("app_users")
      .select("id,source_account_key,full_name,email,role_code,account_status,login_enabled,last_login_at,created_at")
      .eq("id", userId)
      .single(),
    supabase
      .from("staff_profiles")
      .select("user_id,employee_id,organizational_unit_code,position_title,office_name,created_at,updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_preferences")
      .select("preference_key,preference_value,updated_at")
      .eq("user_id", userId),
  ]);

  assertQuery(userResult.error, "Load Registrar profile");
  assertQuery(staffResult.error, "Load Registrar staff profile");
  assertQuery(preferencesResult.error, "Load Registrar preferences");

  let organization = null;
  const organizationalUnitCode = staffResult.data?.organizational_unit_code;
  if (organizationalUnitCode) {
    const { data, error } = await supabase
      .from("organizational_units")
      .select("code,name,is_active")
      .eq("code", organizationalUnitCode)
      .maybeSingle();
    assertQuery(error, "Load Registrar organizational unit");
    organization = data || null;
  }

  const preferences = Object.fromEntries(
    (preferencesResult.data || []).map((item) => [
      item.preference_key,
      item.preference_value,
    ]),
  );

  return {
    user: {
      ...userResult.data,
      lastLoginLabel: formatDateTime(userResult.data.last_login_at),
      createdAtLabel: formatDateTime(userResult.data.created_at),
    },
    staff: staffResult.data || null,
    organization,
    preferences,
    capabilities: {
      editIdentity: false,
      changePassword: true,
      updatePreferences: true,
    },
  };
}

export async function getRegistrarProjectEnrollmentDetail(studentId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_phase8_student_snapshot_v2", {
    p_student_id: studentId,
  });
  assertQuery(error, "Load protected project student snapshot");
  return {
    snapshot: data,
    events: null,
    eventHistoryAvailable: false,
  };
}

export async function getRegistrarStudentRecordDetail(studentId, projectOnly = false) {
  const supabase = await createClient();

  if (projectOnly) {
    const { data, error } = await supabase.rpc("project_phase8_student_snapshot_v2", {
      p_student_id: studentId,
    });
    assertQuery(error, "Load protected PROJECT_ONLY student record");
    return {
      source: "PROJECT_ONLY",
      snapshot: data,
      profile: {
        student_number: data?.student_number || "Not available",
        full_name: data?.student_name || "Not available",
        program_code: data?.program_code || "Not available",
        current_curriculum_code: data?.curriculum_code || "Not available",
        current_term_id: data?.term_id || "Not available",
        year_level: data?.year_level || "Not available",
        academic_classification: data?.academic_classification || "Not available",
        progression_status: data?.progression_status || "Not available",
      },
      officialEnrollments: [],
      academicResults: [],
    };
  }

  const [profileResult, enrollmentsResult, academicResultsResult, handoffResult] =
    await Promise.all([
      supabase
        .from("student_profiles")
        .select("*")
        .eq("id", studentId)
        .single(),
      supabase
        .from("enrollments")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
      supabase
        .from("academic_results")
        .select("id,subject_code,term_id,units,result_status,source_name,official_grade_value,created_at,updated_at")
        .eq("student_id", studentId)
        .order("term_id", { ascending: false }),
      supabase
        .from("admission_handoffs")
        .select("applicant_reference,approved_program_code,admission_status,admission_date,admission_type,synchronization_status,received_at,source_name")
        .eq("student_id", studentId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  assertQuery(profileResult.error, "Load institutional student profile");
  assertQuery(enrollmentsResult.error, "Load institutional enrollment history");
  assertQuery(academicResultsResult.error, "Load institutional academic results");
  if (handoffResult.error) {
    // The handoff is supplementary. Preserve its labels as unavailable rather
    // than failing the entire student record when no admission row is visible.
  }

  return {
    source: "INSTITUTIONAL",
    profile: {
      ...profileResult.data,
      full_name: "Not available",
    },
    admission: handoffResult.data || null,
    officialEnrollments: (enrollmentsResult.data || []).map((row) => ({
      ...row,
      submittedAtLabel: formatDateTime(row.submitted_at),
      confirmedAtLabel: formatDateTime(row.confirmed_at),
    })),
    academicResults: academicResultsResult.data || [],
  };
}
