import { supabase } from "@/lib/supabase/client";
import { getLiveSession } from "@/lib/auth/live-auth";
import { loadCoordinatorCurriculumProvenance } from "./coordinator-curriculum-provenance";
import { scopeCoordinatorPhase8Records } from "./coordinator-phase8-scope.mjs";
import {
  ACADEMIC_HISTORY_MODULES, ACADEMIC_HISTORY_PREVIEW_SIZE,
  toAcademicHistoryRow,
} from "./academic-history-pagination.mjs";

// Backend-to-existing-GUI adapter. It contains no synthetic fallback records.
// The caller must display loading/error states when the authorized read fails.
const titleStatus = (value) => !value ? "Unknown" :
  value.toLowerCase().replace(/(^|_)\w/g, (part) => part.replace("_", " ").toUpperCase());
const displayYear = (value) => value ? `${value}${Number(value) === 1 ? "st" : Number(value) === 2 ? "nd" : Number(value) === 3 ? "rd" : "th"} Year` : "";
const defaultTerm = { id: "", label: "No active academic term", shortLabel: "", academicYear: "",
  semester: "", enrollmentStart: "", enrollmentEnd: "", status: "Closed" };
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fatal(error, table) {
  if (error) throw new Error(`Unable to load authorized ${table} records. ${error.code || ""}`.trim());
}
function rows(result, table) {
  fatal(result.error, table);
  return result.data || [];
}
// PostgREST limits a single response to a maximum page size. Fetch the full
// authorized dataset before deriving roster occupancy or planning reports.
async function loadAllRows(table, sortBy = "id", descending = false) {
  const complete = [];
  const pageSize = 1000;
  // Composite relationship tables have no id. Order by their key columns so
  // pages remain stable at the Supabase response limit.
  const orderFields = Array.isArray(sortBy) ? sortBy : [sortBy];
  for (let offset = 0; offset < 100000; offset += pageSize) {
    let query = supabase.from(table).select("*");
    for (const field of orderFields) {
      query = query.order(field, { ascending: !descending });
    }
    const page = rows(await query.range(offset, offset + pageSize - 1), table);
    complete.push(...page);
    if (page.length < pageSize) return { data: complete, error: null };
  }
  throw new Error(`Authorized ${table} query exceeded its supported pagination limit.`);
}
async function loadAuthorizedProjectRosters(blocks) {
  const snapshots = [];
  // RPC enforces authenticated Academic Coordinator access and validates each
  // project block/placement; keep concurrency bounded for the shared database.
  for (let start = 0; start < blocks.length; start += 8) {
    const batch = await Promise.all(blocks.slice(start, start + 8).map(async (block) => {
      const result = await supabase.rpc("project_phase8_block_roster_v1", {
        p_block_id: block.id,
      });
      const data = rows(result, "protected project block roster");
      if (data.fictional_only !== true || data.block_id !== block.id ||
          !Array.isArray(data.students)) {
        throw new Error("An authorized project roster snapshot is invalid.");
      }
      return { blockId: block.id, students: data.students };
    }));
    snapshots.push(...batch);
  }
  return snapshots;
}
function projectStudentsFromAuthorizedRosters(snapshots, blocks) {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  return snapshots.flatMap((snapshot) => {
    const block = blockById.get(snapshot.blockId);
    if (!block) throw new Error("Unauthorized project block membership.");
    return snapshot.students.map((person) => ({
      id: person.student_id, student_number: person.student_number,
      program_code: block.program_code, current_curriculum_code: block.curriculum_code,
      year_level: displayYear(person.year_level ?? block.year_level),
      // The protected roster RPC validates staff access and project placement.
      // The original student_profiles.student_status is NULL for this cohort.
      student_status: "ACTIVE",
      academic_classification: person.academic_classification,
    }));
  });
}
async function loadPhase8HistoryPreview(scope) {
  const references = [...new Set([
    ...scope.curricula.map((row) => row.code),
    ...scope.subjects.map((row) => row.code),
    ...scope.blocks.map((row) => row.code),
    ...scope.students.map((row) => row.student_number),
  ])];
  if (!references.length) return [];
  const candidates = [];
  // PostgREST GET requests with very large identifier arrays can exceed URL
  // limits. A top-N result per disjoint batch suffices for the global top N.
  for (let start = 0; start < references.length; start += 600) {
    const batch = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      references.slice(start + index * 100, start + (index + 1) * 100))
      .filter((codes) => codes.length).map(async (codes) => {
        const result = await supabase.from("academic_change_history")
          .select("id,occurred_at,actor_user_id,actor_role_code,module,record_reference,action,previous_value,new_value,reason")
          .in("module", ACADEMIC_HISTORY_MODULES)
          .in("record_reference", codes)
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(ACADEMIC_HISTORY_PREVIEW_SIZE);
        return rows(result, "project academic history");
      }));
    candidates.push(...batch.flat());
  }
  return candidates.sort((a, b) =>
    String(b.occurred_at).localeCompare(String(a.occurred_at)) ||
    String(b.id).localeCompare(String(a.id))).slice(0, ACADEMIC_HISTORY_PREVIEW_SIZE);
}
export async function loadAuthorizedAcademicHistoryPage(options = {}) {
  const current = await getLiveSession();
  if (current?.role !== "academic-coordinator") {
    throw new Error("Academic Coordinator authentication is required.");
  }
  // The shared official history endpoint cannot prove PROJECT_ONLY provenance
  // for every row. Never expose an unrelated legacy audit trail in this view.
  // A dedicated provenance-indexed history endpoint is needed to enable it.
  if (!Number.isSafeInteger(options.page ?? 1) || (options.page ?? 1) < 1) {
    throw new Error("Invalid academic history page.");
  }
  return { rows: [], total: 0, byModule: Object.fromEntries(
    ACADEMIC_HISTORY_MODULES.map((module) => [module, 0])) };
}
function yearLabel(value) {
  return Number.isInteger(value) ? `${value}-${value + 1}` : "";
}

export async function loadLiveAcademicCoordinator() {
  const current = await getLiveSession();
  if (current?.role !== "academic-coordinator") {
    throw new Error("Academic Coordinator authentication is required.");
  }

  // Use RLS-bound authenticated Supabase browser session for every read.
  // A denial or missing table fails closed and is never replaced by a fixture.
  const [
    unitsResult, programsResult, tracksResult, subjectsResult, curriculaResult,
    placementsResult, prerequisitesResult, termsResult, offeringsResult,
    blocksResult, joinsResult, rosterResult, sectionsResult, meetingsResult,
    instructorsResult, roomsResult, sectionInstructorsResult, reviewsResult,
    enrollmentsResult, enrollmentSubjectsResult, notificationsResult,
    userNotificationsResult,pricesResult,curriculumRatesResult,
    curriculumEstimatesResult, provenanceResult,
  ] = await Promise.all([
    supabase.from("organizational_units").select("*"),
    supabase.from("programs").select("*"),
    supabase.from("program_tracks").select("*"),
    loadAllRows("subjects", "code"),
    supabase.from("curricula").select("*"),
    loadAllRows("curriculum_subjects", ["curriculum_code", "subject_code", "year_level", "semester"]),
    loadAllRows("subject_prerequisites", ["curriculum_code", "subject_code", "prerequisite_subject_code"]),
    supabase.from("academic_terms").select("*"),
    loadAllRows("subject_offerings"),
    supabase.from("block_sections").select("*"),
    loadAllRows("block_subject_sections", ["block_id", "section_id"]),
    loadAllRows("block_student_assignments"),
    loadAllRows("sections"),
    loadAllRows("section_meetings"),
    supabase.from("instructors").select("*"),
    supabase.from("rooms").select("*"),
    loadAllRows("section_instructors", ["section_id", "instructor_id"]),
    loadAllRows("academic_reviews"),
    loadAllRows("enrollments"),
    loadAllRows("enrollment_subjects", ["enrollment_id", "subject_code"]),
    supabase.from("notifications").select("*"),
    supabase.from("user_notifications").select("*").eq("user_id", current.id),
    loadAllRows("academic_estimated_subject_prices", "subject_code"),
    loadAllRows("academic_estimated_curriculum_rates", ["curriculum_code", "subject_code"]),
    supabase.from("academic_estimated_curriculum_tuition").select("*"),
    loadCoordinatorCurriculumProvenance(),
  ]);
  const organizationalUnits = rows(unitsResult, "organizational unit");
  const programRecords = rows(programsResult, "program");
  const trackRecords = rows(tracksResult, "program track");
  const rawBlocks = rows(blocksResult, "block");
  const projectCurriculumCodes = new Set(provenanceResult.filter((record) =>
    record.isOfficial === false && record.sourceType === "PROJECT_ONLY_FICTIONAL")
    .map((record) => record.curriculumCode));
  if (!projectCurriculumCodes.size) {
    throw new Error("Project curriculum provenance is unavailable.");
  }
  const projectBlocks = rawBlocks.filter((block) => projectCurriculumCodes.has(block.curriculum_code));
  const projectRosters = await loadAuthorizedProjectRosters(projectBlocks);
  const projectStudents = projectStudentsFromAuthorizedRosters(projectRosters, projectBlocks);
  const scope = scopeCoordinatorPhase8Records({
    subjects: rows(subjectsResult, "subject"),
    curricula: rows(curriculaResult, "curriculum"),
    placements: rows(placementsResult, "curriculum placement"),
    prerequisites: rows(prerequisitesResult, "prerequisite"),
    terms: rows(termsResult, "academic term"),
    offerings: rows(offeringsResult, "subject offering"),
    blocks: rawBlocks,
    joins: rows(joinsResult, "block subject"),
    roster: rows(rosterResult, "block proposed roster"),
    sections: rows(sectionsResult, "subject section"),
    meetings: rows(meetingsResult, "class meeting"),
    instructors: rows(instructorsResult, "instructor"),
    rooms: rows(roomsResult, "room"),
    sectionInstructors: rows(sectionInstructorsResult, "section instructor"),
    history: [],
    reviews: rows(reviewsResult, "academic review"),
    enrollments: rows(enrollmentsResult, "enrollment"),
    enrollmentSubjects: rows(enrollmentSubjectsResult, "registered subject"),
    prices: rows(pricesResult, "estimated academic price"),
    curriculumRates: rows(curriculumRatesResult, "curriculum estimated rate"),
    estimates: rows(curriculumEstimatesResult, "curriculum tuition completeness"),
    students: projectStudents,
  }, provenanceResult, projectRosters);
  const projectHistory = await loadPhase8HistoryPreview(scope);
  const subjectRecords = scope.subjects;
  const curriculumRecords = scope.curricula;
  const placementRecords = scope.placements;
  const prerequisites = scope.prerequisites;
  const termRecords = scope.terms;
  const offeringRecords = scope.offerings;
  const blockRecords = scope.blocks;
  const joins = scope.joins;
  const rosterRecords = scope.assignments;
  const sectionRecords = scope.sections;
  const meetingRecords = scope.meetings;
  const instructorRecords = scope.instructors;
  const roomRecords = scope.rooms;
  const sectionInstructorRecords = scope.sectionInstructors;
  const academicHistory = projectHistory;
  const reviewRecords = scope.reviews;
  const enrollmentRecords = scope.enrollments;
  const enrollmentSubjects = scope.enrollmentSubjects;
  const studentRecords = scope.students;
  const notificationRecords = rows(notificationsResult, "notification");
  const userNotificationRecords = rows(userNotificationsResult, "account notification");
  const priceMap = new Map(scope.prices
    .map((item) => [item.subject_code, item]));
  const curriculumRateMap = new Map(scope.curriculumRates
    .map((item) => [`${item.curriculum_code}:${item.subject_code}`, item.rate_per_unit]));
  const projectNames = new Map([...scope.memberById].map(([id, person]) => [id, person.full_name]));
  const curriculumEstimateMap = new Map(scope.estimates
    .map((item) => [item.curriculum_code, item]));
  const provenanceMap = new Map(provenanceResult.map((item) => [item.curriculumCode, item]));

  const departments = organizationalUnits.map((unit) => ({
    id: unit.code, code: unit.code, name: unit.name, status: unit.is_active ? "Active" : "Inactive",
  }));
  const programs = programRecords.map((record) => ({
    id: `program-${record.code.toLowerCase()}`, code: record.code, name: record.name,
    department: record.organizational_unit_code, departmentId: record.organizational_unit_code,
    status: titleStatus(record.status),
    majors: trackRecords.filter((row) => row.program_code === record.code).map((row) => row.name),
    reference: "Academic program catalog record",
    enrolled: enrollmentRecords.filter((row) => row.program_code === record.code && row.status === "CONFIRMED").length,
  }));
  const curriculumMap = new Map(curriculumRecords.map((record) => [record.code, record]));
  const programMap = new Map(programs.map((record) => [record.code, record]));
  const subjectMap = new Map(subjectRecords.map((record) => [record.code, record]));
  const placementsBySubject = new Map();
  for (const placement of placementRecords) {
    const existing = placementsBySubject.get(placement.subject_code) || [];
    existing.push(placement);
    placementsBySubject.set(placement.subject_code, existing);
  }
  const subjects = subjectRecords.map((record) => {
    const assignments = placementsBySubject.get(record.code) || [];
    const applicablePrograms = [...new Set(assignments.map((item) =>
      curriculumMap.get(item.curriculum_code)?.program_code).filter(Boolean))];
    const uniquePlacements = [...new Set(assignments.map((item) =>
      `${item.year_level}:${item.semester}`))];
    const placement = uniquePlacements.length === 1 ? assignments[0] : null;
    const departments = [...new Set(applicablePrograms.map((code) =>
      programMap.get(code)?.department).filter(Boolean))];
    const estimatedRate = priceMap.get(record.code);
    const isProjectOnly = assignments.some((item) =>
      provenanceMap.get(item.curriculum_code)?.isOfficial === false);
    return {
      id: `subject-${record.code.toLowerCase()}`, code: record.code,
      name: record.name, units: record.units, description: record.description || "",
      status: titleStatus(record.status), programs: applicablePrograms,
      program: applicablePrograms[0] || "", programIds: applicablePrograms.map((code) => `program-${code.toLowerCase()}`),
      yearLevel: placement?.year_level || "", semester: placement?.semester || "",
      prerequisites: [...new Set(prerequisites.filter((rule) => rule.subject_code === record.code && rule.is_active)
        .map((rule) => rule.prerequisite_subject_code))],
      department: departments.length === 1 ? departments[0] : "",
      departmentId: departments.length === 1 ? departments[0] : "",
      departments, curriculumPlacements: assignments.map((item) => ({
        curriculumCode: item.curriculum_code, yearLevel: item.year_level,
        semester: item.semester,
      })),
      isProjectOnly,
      reference: isProjectOnly ? "PROJECT_ONLY simulated subject" : "Academic subject catalog record",
      feePerUnit: estimatedRate ? Number(estimatedRate.rate_per_unit) : null,
      fee: estimatedRate ? Number(record.units) * Number(estimatedRate.rate_per_unit) : null,
      feeClassification: estimatedRate?.classification || null,
    };
  });
  const curricula = curriculumRecords.map((record) => {
    const provenance = provenanceMap.get(record.code);
    const assigned = placementRecords.filter((item) => item.curriculum_code === record.code)
      .map((placement) => ({
        subjectCode: placement.subject_code, yearLevel: placement.year_level,
        semester: placement.semester, isRequired: placement.is_required,
        unitsOverride: placement.units_override,
        feePerUnit: curriculumRateMap.has(`${placement.curriculum_code}:${placement.subject_code}`)
          ? Number(curriculumRateMap.get(`${placement.curriculum_code}:${placement.subject_code}`))
          : priceMap.has(placement.subject_code)
            ? Number(priceMap.get(placement.subject_code).rate_per_unit) : null,
        prerequisites: prerequisites.filter((rule) =>
          rule.curriculum_code === record.code && rule.subject_code === placement.subject_code && rule.is_active)
          .map((rule) => rule.prerequisite_subject_code),
      }));
    const program = programMap.get(record.program_code);
    return {
      id: record.code, version: record.version_label || record.name,
      program: record.program_code, programId: program?.id || "",
      department: program?.department || "", departmentId: program?.departmentId || "",
      major: trackRecords.find((track) => track.code === record.program_track_code)?.name || "",
      effectiveAcademicYear: record.effective_academic_year || yearLabel(record.effective_year_start),
      status: titleStatus(record.status), assignments: assigned,
      estimatedTuitionComplete: curriculumEstimateMap.get(record.code)?.is_complete === true,
      estimatedTuitionCoverage: curriculumEstimateMap.get(record.code)?.semesters_represented ?? 0,
      assignedSubjects: assigned.length,
      totalUnits: assigned.reduce((sum, item) =>
        sum + Number(item.unitsOverride ?? subjectMap.get(item.subjectCode)?.units ?? 0), 0),
      isProjectOnly: provenance?.isOfficial === false,
      provenance: provenance?.sourceType || null,
      reference: provenance?.isOfficial === false
        ? "PROJECT_ONLY simulated curriculum" : "Registered curriculum record",
    };
  });
  const terms = termRecords.map((record) => ({
    id: record.id, label: record.label, shortLabel: record.short_label,
    academicYear: record.academic_year, semester: record.semester,
    enrollmentStart: record.enrollment_start || "", enrollmentEnd: record.enrollment_end || "",
    status: titleStatus(record.status),
  }));
  const liveTerm = terms.find((record) => record.status === "Open") || terms[0] || defaultTerm;
  const blocks = blockRecords.map((record) => {
    const program = programMap.get(record.program_code);
    const term = terms.find((item) => item.id === record.term_id);
    return {
      id: record.id, code: record.code,
      trackCode: record.program_track_code || record.program_code, termId: record.term_id,
      academicYear: term?.academicYear || "", semester: term?.semester || "",
      collegeId: program?.departmentId || "", programCode: record.program_code,
      programId: program?.id || "", major: trackRecords.find((t) => t.code === record.program_track_code)?.name || "",
      yearLevel: displayYear(record.year_level), curriculumId: record.curriculum_code,
      capacity: record.capacity, status: record.planning_status,
      publishedAt: record.published_at,
    };
  });
  const classes = joins.map((join) => {
    const section = sectionRecords.find((row) => row.id === join.section_id);
    const block = blockRecords.find((row) => row.id === join.block_id);
    return {
      id: `${join.block_id}:${join.section_id}`, sectionId: join.block_id,
      termId: block?.term_id || section?.term_id,
      subjectCode: section?.subject_code || "",
      professorId: sectionInstructorRecords.find((row) => row.section_id === join.section_id
        && row.assignment_role === "PRIMARY")?.instructor_id || "",
      roomType: "",
      status: section?.schedule_status || "DRAFT",
    };
  });
  const classMeetings = meetingRecords.filter((record) =>
    record.meeting_status !== "CANCELLED").flatMap((record) => joins
    .filter((join) => join.section_id === record.section_id)
    .map((join) => ({
      id: `${record.id}:${join.block_id}`,
      subjectClassId: `${join.block_id}:${join.section_id}`,
      day: days[(record.day_of_week || 1) - 1],
      start: record.start_time?.slice(0, 5) || "", end: record.end_time?.slice(0, 5) || "",
      roomId: record.room_id,
    })));
  const studentById = new Map(studentRecords.map((record) => [record.id, record]));
  const proposals = rosterRecords.map((row) => ({
    id: row.id, studentId: row.student_id, sectionId: row.block_id,
    termId: row.term_id, status: row.status,
  }));
  const reviews = new Map(reviewRecords.map((row) => [row.enrollment_id, row]));
  const registrarEnrollments = enrollmentRecords.map((enrollment) => {
    const person = studentById.get(enrollment.student_id);
    const review = reviews.get(enrollment.id);
    return {
      reference: enrollment.reference, id: enrollment.id, status: enrollment.status,
      studentNumber: person?.student_number || "", studentName: person?.student_number || "",
      program: enrollment.program_code, term: enrollment.term_id,
      units: enrollment.declared_units, curriculum: enrollment.curriculum_code,
      submittedDate: enrollment.submitted_at, academicReviewDecision: review?.review_status === "PENDING" ? null : review?.review_status,
      academicReviewReason: review?.decision_reason || review?.academic_reason || "",
      academicReviewCoordinator: "", academicReviewDate: review?.decided_at,
      academicIssue: review?.academic_reason || "",
      subjects: enrollmentSubjects.filter((row) => row.enrollment_id === enrollment.id).map((row) => ({
        code: row.subject_code, name: subjectMap.get(row.subject_code)?.name || row.subject_code,
        section: sectionRecords.find((item) => item.id === row.section_id)?.section_code || "",
        units: row.units_at_enrollment || subjectMap.get(row.subject_code)?.units || 0,
      })),
    };
  });
  const history = academicHistory.map(toAcademicHistoryRow);
  return {
    catalog: { departments, programs, subjects,
      sections: sectionRecords.map((row) => ({ id: row.id, subjectCode: row.subject_code,
        section: row.section_code, code: row.section_code, capacity: row.capacity,
        status: row.status })) },
    academicCoordinatorData: {
      curricula, offerings: offeringRecords.map((record) => ({
        id: record.id, termId: record.term_id, program: record.program_code,
        curriculum: record.curriculum_code, subjectCode: record.subject_code,
        status: titleStatus(record.status), plannedSections: record.planned_sections,
      })), history, prerequisiteRules: [], reviews: reviewRecords.map((review) => ({
        id: review.id, enrollmentId: review.enrollment_id,
        reference: enrollmentRecords.find((entry) => entry.id === review.enrollment_id)?.reference || "",
        subjectCode: review.subject_code, status: review.review_status,
        submittedAt: review.created_at, decidedAt: review.decided_at,
        reason: review.decision_reason || review.academic_reason || "",
        exceptionType: review.exception_type, failedRuleCode: review.failed_rule_code,
      })),
    },
    blockPlanning: {
      terms, colleges: departments, programs, curricula, subjects,
      blockSections: blocks, students: studentRecords.map((person) => ({
        id: person.id, studentNumber: person.student_number,
        fullName: projectNames.get(person.id),
        programCode: scope.memberById.get(person.id)?.programCode,
        yearLevel: displayYear(scope.memberById.get(person.id)?.yearLevel) || person.year_level,
        // Legacy student_status is NULL for the protected PROJECT_ONLY cohort.
        // ACTIVE here denotes membership in its validated simulation roster,
        // not an institutionally verified enrollment or admission status.
        status: "ACTIVE",
        classification: scope.memberById.get(person.id)?.academic_classification || "Not evaluated",
        major: trackRecords.find((track) => track.code ===
          scope.memberById.get(person.id)?.trackCode)?.name || "",
        curriculumId: scope.memberById.get(person.id)?.curriculumCode,
      })),
      assignments: proposals, subjectClasses: classes, classMeetings,
      professors: instructorRecords.map((person) => ({
        id: person.id, name: person.original_display_name || person.display_name,
        status: "ACTIVE",
        qualifiedSubjectCodes: person.synthetic_source_attributes?.qualifiedSubjectCodes || [],
      })),
      rooms: roomRecords.map((room) => ({ id: room.id,
        name: room.original_room_name || room.room_code,
        building: room.building_name,
        capacity: room.synthetic_source_attributes?.capacity,
        types: room.synthetic_source_attributes?.types || [],
        status: room.is_active ? "AVAILABLE" : "INACTIVE" })),
      history: [],
    },
    registrar: {
      students: studentRecords.map((record) => ({
        studentNumber: record.student_number, program: record.program_code,
        fullName: projectNames.get(record.id),
      })),
      enrollments: registrarEnrollments,
    },
    notifications: {
      "academic-coordinator": userNotificationRecords.map((link) => {
        const source = notificationRecords.find((item) => item.id === link.notification_id);
        return source ? {
          id: link.notification_id,
          title: source.title,
          message: source.message,
          category: source.category,
          read: link.is_read,
          date: source.published_at,
          relatedHref: source.related_path || "/academic-coordinator/dashboard",
        } : null;
      }).filter(Boolean),
    },
    student: { profile: {}, term: liveTerm, enrollment: {}, academicResults: [] },
    term: liveTerm,
  };
}

export async function persistAcademicMaster(table, operation, values, identity) {
  const session = await getLiveSession();
  if (session?.role !== "academic-coordinator") return { ok: false, message: "Unauthorized role." };
  if (!["programs", "subjects"].includes(table)) {
    return { ok: false, message: "This operation requires a verified academic transaction." };
  }
  const allowed = table === "programs"
    ? ["code", "name", "organizational_unit_code", "status"]
    : ["code", "name", "units", "description", "status"];
  const data = Object.fromEntries(Object.entries(values || {}).filter(([key]) => allowed.includes(key)));
  if (!data.code && operation === "create") {
    return { ok: false, message: "Academic code is required." };
  }
  if (!data.name && operation === "create") {
    return { ok: false, message: "Academic name is required." };
  }
  // Existing live statuses differ by table; preserve existing SQL CHECK labels.
  if (data.status) data.status = titleStatus(data.status);
  let query = operation === "create"
    ? supabase.from(table).insert(data)
    : supabase.from(table).update(Object.fromEntries(Object.entries(data)
      .filter(([key]) => key !== "code"))).eq("code", identity);
  const result = await query.select("code").maybeSingle();
  return result.error
    ? { ok: false, message: result.error.code === "23505" ? "Code already exists." : "Database validation rejected this change." }
    : result.data?.code
      ? { ok: true, record: result.data }
      : { ok: false, message: "No matching academic record was updated. Refresh the page and retry." };
}
