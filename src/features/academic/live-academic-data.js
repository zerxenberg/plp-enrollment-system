import { supabase } from "@/lib/supabase/client";
import { getLiveSession } from "@/lib/auth/live-auth";
import { loadCoordinatorCurriculumProvenance } from "./coordinator-curriculum-provenance";
import {
  ACADEMIC_HISTORY_MODULES, ACADEMIC_HISTORY_PREVIEW_SIZE,
  queryAcademicHistoryPage, toAcademicHistoryRow,
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
async function loadSyntheticStudentLabels() {
  const complete = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const page = rows(await supabase.rpc("coordinator_synthetic_student_names")
      .order("id", { ascending: true }).range(offset, offset + pageSize - 1), "synthetic student labels");
    complete.push(...page);
    if (page.length < pageSize) return complete;
  }
  throw new Error("Synthetic student labels exceeded the supported pagination limit.");
}
export async function loadAuthorizedAcademicHistoryPage(options = {}) {
  const current = await getLiveSession();
  if (current?.role !== "academic-coordinator") {
    throw new Error("Academic Coordinator authentication is required.");
  }
  // The browser client retains its existing RLS-bound authenticated session.
  return queryAcademicHistoryPage(supabase, options);
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
    instructorsResult, roomsResult, sectionInstructorsResult, historyResult, reviewsResult,
    enrollmentsResult, enrollmentSubjectsResult, notificationsResult,
    userNotificationsResult,pricesResult,curriculumRatesResult,syntheticNamesResult,
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
    supabase.from("subject_offerings").select("*"),
    supabase.from("block_sections").select("*"),
    loadAllRows("block_subject_sections", ["block_id", "section_id"]),
    loadAllRows("block_student_assignments"),
    loadAllRows("sections"),
    loadAllRows("section_meetings"),
    supabase.from("instructors").select("*"),
    supabase.from("rooms").select("*"),
    loadAllRows("section_instructors", ["section_id", "instructor_id"]),
    supabase.from("academic_change_history")
      .select("id,occurred_at,actor_user_id,actor_role_code,module,record_reference,action,previous_value,new_value,reason")
      .in("module", ACADEMIC_HISTORY_MODULES)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(ACADEMIC_HISTORY_PREVIEW_SIZE),
    loadAllRows("academic_reviews"),
    loadAllRows("enrollments"),
    loadAllRows("enrollment_subjects", ["enrollment_id", "subject_code"]),
    supabase.from("notifications").select("*"),
    supabase.from("user_notifications").select("*").eq("user_id", current.id),
    loadAllRows("academic_estimated_subject_prices", "subject_code"),
    loadAllRows("academic_estimated_curriculum_rates", ["curriculum_code", "subject_code"]),
    loadSyntheticStudentLabels(),
    supabase.from("academic_estimated_curriculum_tuition").select("*"),
    loadCoordinatorCurriculumProvenance(),
  ]);
  const organizationalUnits = rows(unitsResult, "organizational unit");
  const programRecords = rows(programsResult, "program");
  const coordinatorReferenceResults = await Promise.all(
    programRecords.map((program) => supabase.rpc("coordinator_student_references", {
      p_program_code: program.code,
    })),
  );
  const studentRecords = coordinatorReferenceResults.flatMap((result) =>
    rows(result, "coordinator student references"));
  const trackRecords = rows(tracksResult, "program track");
  const subjectRecords = rows(subjectsResult, "subject");
  const curriculumRecords = rows(curriculaResult, "curriculum");
  const placementRecords = rows(placementsResult, "curriculum placement");
  const prerequisites = rows(prerequisitesResult, "prerequisite");
  const termRecords = rows(termsResult, "academic term");
  const offeringRecords = rows(offeringsResult, "subject offering");
  const blockRecords = rows(blocksResult, "block");
  const joins = rows(joinsResult, "block subject");
  const rosterRecords = rows(rosterResult, "block proposed roster");
  const sectionRecords = rows(sectionsResult, "subject section");
  const meetingRecords = rows(meetingsResult, "class meeting");
  const instructorRecords = rows(instructorsResult, "instructor");
  const roomRecords = rows(roomsResult, "room");
  const sectionInstructorRecords = rows(sectionInstructorsResult, "section instructor");
  const academicHistory = rows(historyResult, "academic history");
  const reviewRecords = rows(reviewsResult, "academic review");
  const enrollmentRecords = rows(enrollmentsResult, "enrollment");
  const enrollmentSubjects = rows(enrollmentSubjectsResult, "registered subject");
  const notificationRecords = rows(notificationsResult, "notification");
  const userNotificationRecords = rows(userNotificationsResult, "account notification");
  const priceMap = new Map(rows(pricesResult, "estimated academic price")
    .map((item) => [item.subject_code, item]));
  const curriculumRateMap = new Map(rows(curriculumRatesResult, "curriculum estimated rate")
    .map((item) => [`${item.curriculum_code}:${item.subject_code}`, item.rate_per_unit]));
  const syntheticNames = new Map(syntheticNamesResult.map((item) => [item.id, item.display_name]));
  const curriculumEstimateMap = new Map(rows(curriculumEstimatesResult, "curriculum tuition completeness")
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
        fullName: syntheticNames.get(person.id) || person.student_number,
        programCode: person.program_code, yearLevel: person.year_level,
        status: person.student_status,
        classification: person.academic_classification || "Not evaluated",
        major: trackRecords.find((track) => track.code ===
          curriculumMap.get(person.current_curriculum_code)?.program_track_code)?.name || "",
        curriculumId: person.current_curriculum_code,
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
        fullName: record.student_number,
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
