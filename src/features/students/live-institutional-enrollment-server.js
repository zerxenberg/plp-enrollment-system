import "server-only";

import { getStudentContext } from "./student-context-server";
import { loadAdmissionsPhase8DemoForStudent } from "@/features/admissions/admissions-phase8-demo-server";
import {
  chooseAdmissionsTerm, chooseInstitutionalBlock, admissionsAcademicBlockers,
} from "./live-institutional-preparation.mjs";

const ERROR = { kind: "unavailable", reason: "Institutional academic records could not be verified." };

function schoolDate() {
  const fields = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const parts = Object.fromEntries(fields.map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function termYear(term) {
  const match = String(term?.academic_year || "").match(/20\d{2}/);
  return match ? Number(match[0]) : null;
}

export async function loadLiveInstitutionalEnrollmentForPage() {
  const ctx = await getStudentContext();
  if (ctx.kind !== "live") return ERROR;
  const admin = ctx.admin;
  try {
    const [personR, studentR, termsR, enrollmentsR, blocksR, historyR, creditsR] = await Promise.all([
      admin.from("app_users").select("full_name,account_status,login_enabled,source_account_key")
        .eq("id", ctx.appUserId).maybeSingle(),
      admin.from("student_profiles")
        .select("id,user_id,student_number,student_type,student_status,program_code,year_level_number,current_curriculum_code,current_term_id,academic_classification,record_kind,is_synthetic_demo")
        .eq("id", ctx.studentId).maybeSingle(),
      admin.from("academic_terms").select("id,label,academic_year,semester,status,enrollment_start,enrollment_end"),
      admin.from("enrollments")
        .select("id,reference,term_id,curriculum_code,status,declared_units,submitted_at,confirmed_at,confirmation_reference,current_correction_reason")
        .eq("student_id", ctx.studentId).order("created_at", { ascending: false }),
      admin.from("block_sections")
        .select("id,term_id,code,program_code,curriculum_code,year_level,capacity,planning_status,is_synthetic_demo")
        .eq("program_code", ctx.programCode),
      admin.from("academic_results")
        .select("subject_code,term_id,units,result_status,official_grade_value,source_name,published_grade_import_row_id")
        .eq("student_id", ctx.studentId).eq("source_name", "REGISTRAR_VERIFIED_IMPORT")
        .not("published_grade_import_row_id", "is", null),
      admin.from("transfer_credit_evaluations")
        .select("target_subject_code,credited_units,decision_status,evaluator_user_id,decided_at")
        .eq("student_id", ctx.studentId).eq("decision_status", "CREDITED"),
    ]);
    if (personR.error || studentR.error || termsR.error || enrollmentsR.error ||
        blocksR.error || historyR.error || creditsR.error ||
        !studentR.data || studentR.data.user_id !== ctx.appUserId ||
        studentR.data.is_synthetic_demo !== false ||
        studentR.data.record_kind === "PROJECT_ONLY" ||
        !personR.data?.source_account_key?.startsWith("PLP_ADMISSIONS:")) return ERROR;
    const profile = studentR.data;
    const term = chooseAdmissionsTerm(termsR.data, schoolDate());
    const termRow = term || (termsR.data || []).find((t) => t.id === profile.current_term_id) || null;
    const { data: candidates, error: curriculumError } = await admin.from("curricula")
      .select("code,name,status,program_code,effective_year_start,effective_academic_year")
      .eq("program_code", profile.program_code).eq("status", "Active");
    if (curriculumError) return ERROR;
    // Prefer an already assigned curriculum. Otherwise a curriculum uniquely
    // associated with a *real*, coordinator-owned block. Never pick a
    // fictional project's published block solely because it is available.
    const realBlocks = (blocksR.data || []).filter((b) =>
      b.is_synthetic_demo === false && b.term_id === term?.id);
    const curriculaInTerm = new Set(realBlocks.map((b) => b.curriculum_code));
    const active = (candidates || []).filter((c) => curriculaInTerm.has(c.code) &&
      (!termYear(term) || !c.effective_year_start || c.effective_year_start <= termYear(term)));
    const curriculum = profile.current_curriculum_code
      ? (candidates || []).find((c) => c.code === profile.current_curriculum_code) || null
      : active.length === 1 ? active[0] : null;
    // Trust the protected provenance ledger rather than merely the curriculum
    // code or its misleading general "Active" status.
    const provenanceR = curriculum ? await admin.from("phase8_fictional_curriculum_provenance")
      .select("curriculum_code,source_type,is_official").eq("curriculum_code", curriculum.code)
      .maybeSingle() : { data: null, error: null };
    if (provenanceR.error) return ERROR;
    const curriculumIsDemonstration = Boolean(provenanceR.data &&
      provenanceR.data.source_type === "PROJECT_ONLY_FICTIONAL" &&
      provenanceR.data.is_official === false);
    let fullCurriculum = [];
    if (curriculum) {
      const { data: placements, error: placementsError } = await admin
        .from("curriculum_subjects")
        .select("subject_code,units_override,year_level_number,semester,display_order")
        .eq("curriculum_code", curriculum.code)
        .order("year_level_number").order("semester").order("display_order");
      if (placementsError) return ERROR;
      const codes = [...new Set((placements || []).map((r) => r.subject_code))];
      const names = codes.length
        ? await admin.from("subjects").select("code,name,units").in("code", codes)
        : { data: [], error: null };
      if (names.error) return ERROR;
      const byCode = new Map((names.data || []).map((subject) => [subject.code, subject]));
      fullCurriculum = (placements || []).map((r) => ({
        code: r.subject_code, name: byCode.get(r.subject_code)?.name || r.subject_code,
        units: r.units_override ?? byCode.get(r.subject_code)?.units ?? null,
        yearLevel: r.year_level_number, semester: r.semester,
      }));
    }

    const yearLevel = profile.year_level_number ||
      (profile.student_type === "NEW_STUDENT" ? 1 : null);
    let subjects = [];
    if (curriculum && termRow && yearLevel) {
      const { data: curriculumRows, error: subjectError } = await admin.from("curriculum_subjects")
        .select("subject_code,units_override,is_required,display_order")
        .eq("curriculum_code", curriculum.code)
        .eq("year_level_number", yearLevel)
        .eq("semester", termRow.semester).order("display_order");
      if (subjectError) return ERROR;
      const codes = (curriculumRows || []).map((r) => r.subject_code);
      const [detailsR, eligibilityR] = await Promise.all([
        codes.length ? admin.from("subjects").select("code,name,units,status").in("code", codes)
          : Promise.resolve({ data: [], error: null }),
        codes.length ? admin.from("student_subject_eligibility")
          .select("subject_code,eligibility_status,restriction_reason")
          .eq("student_id", ctx.studentId).eq("term_id", termRow.id).in("subject_code", codes)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (detailsR.error || eligibilityR.error) return ERROR;
      const details = new Map((detailsR.data || []).map((s) => [s.code, s]));
      const eligibility = new Map((eligibilityR.data || []).map((e) => [e.subject_code, e]));
      subjects = (curriculumRows || []).map((c) => ({
        code: c.subject_code, subject_code: c.subject_code,
        name: details.get(c.subject_code)?.name || c.subject_code,
        units: c.units_override ?? details.get(c.subject_code)?.units ?? null,
        active: details.get(c.subject_code)?.status === "Active",
        eligibility: eligibility.get(c.subject_code)?.eligibility_status || "PENDING_EVALUATION",
        reason: eligibility.get(c.subject_code)?.restriction_reason || null,
        section: null, sectionId: null, sectionStatus: null, meetings: [],
      }));
    }
    const block = chooseInstitutionalBlock({
      blocks: blocksR.data, programCode: profile.program_code,
      termId: term?.id, yearLevel, curriculumCode: curriculum?.code,
    });
    const possible = (blocksR.data || []).filter((b) => b.is_synthetic_demo === false &&
      b.term_id === termRow?.id && b.curriculum_code === curriculum?.code && b.year_level === yearLevel);
    const blockForDisplay = block || (possible.length === 1 ? possible[0] : null);
    const qualifiedSections = [];
    let assignedBlockId = null;
    if (blockForDisplay && subjects.length) {
      const [linksR, assignmentsR] = await Promise.all([
        admin.from("block_subject_sections").select("section_id").eq("block_id", blockForDisplay.id),
        admin.from("block_student_assignments").select("id,student_id,status,block_id,term_id")
          .eq("student_id", ctx.studentId).eq("term_id", blockForDisplay.term_id).is("ended_at", null),
      ]);
      if (linksR.error || assignmentsR.error) return ERROR;
      const currentAssignments = (assignmentsR.data || []).filter((a) =>
        ["PROPOSED", "CONFIRMED"].includes(a.status));
      if (currentAssignments.length === 1) assignedBlockId = currentAssignments[0].block_id;
      const sectionIds = [...new Set((linksR.data || []).map((row) => row.section_id).filter(Boolean))];
      if (sectionIds.length) {
        const [sectionsR, meetingsR, teachersR] = await Promise.all([
          admin.from("sections")
            .select("id,subject_code,section_code,status,schedule_status,term_id,is_synthetic_demo,subject_offering_id,capacity")
            .in("id", sectionIds),
          admin.from("section_meetings")
            .select("section_id,day_of_week,start_time,end_time,room_id,meeting_status,is_synthetic_demo,meeting_component_type")
            .in("section_id", sectionIds),
          admin.from("section_instructors").select("section_id,instructor_id,assignment_role").in("section_id", sectionIds),
        ]);
        if (sectionsR.error || meetingsR.error || teachersR.error) return ERROR;
        const roomIds = [...new Set((meetingsR.data || []).map((m) => m.room_id).filter(Boolean))];
        const teacherIds = [...new Set((teachersR.data || []).map((m) => m.instructor_id).filter(Boolean))];
        const offeringIds = [...new Set((sectionsR.data || []).map((s) => s.subject_offering_id).filter(Boolean))];
        const [roomsR, instructorsR, offeringsR] = await Promise.all([
          roomIds.length ? admin.from("rooms").select("id,room_code,is_active,is_synthetic_demo").in("id", roomIds) : { data: [], error: null },
          teacherIds.length ? admin.from("instructors").select("id,display_name,is_synthetic_demo").in("id", teacherIds) : { data: [], error: null },
          offeringIds.length ? admin.from("subject_offerings").select("id,program_code,curriculum_code,term_id,status,is_synthetic_demo").in("id", offeringIds) : { data: [], error: null },
        ]);
        if (roomsR.error || instructorsR.error || offeringsR.error) return ERROR;
        const rooms = new Map((roomsR.data || []).map((row) => [row.id, row]));
        const instructors = new Map((instructorsR.data || []).map((row) => [row.id, row]));
        const offerings = new Map((offeringsR.data || []).map((row) => [row.id, row]));
        for (const section of sectionsR.data || []) {
          const offering = offerings.get(section.subject_offering_id);
          if (section.is_synthetic_demo !== false || section.term_id !== termRow?.id ||
              offering?.is_synthetic_demo !== false ||
              offering?.program_code !== profile.program_code ||
              offering?.curriculum_code !== curriculum?.code || offering?.status !== "ACTIVE") continue;
          const primary = (teachersR.data || []).find((t) => t.section_id === section.id && t.assignment_role === "PRIMARY");
          const instructor = instructors.get(primary?.instructor_id);
          const rawMeetings = (meetingsR.data || []).filter((m) =>
            m.section_id === section.id && m.meeting_status === "ACTIVE" && m.is_synthetic_demo === false);
          const verifiedMeetings = rawMeetings.filter((m) =>
            rooms.get(m.room_id)?.is_synthetic_demo === false && rooms.get(m.room_id)?.is_active === true);
          const item = {
            ...section,
            hasPrimaryInstructor: Boolean(instructor && instructor.is_synthetic_demo === false),
            hasVerifiedRooms: rawMeetings.length > 0 && verifiedMeetings.length === rawMeetings.length,
            meetings: verifiedMeetings.map((m) => ({
              day: m.day_of_week, start: m.start_time, end: m.end_time,
              room: rooms.get(m.room_id)?.room_code || null, instructor: instructor?.display_name || null,
              component: m.meeting_component_type,
            })),
          };
          qualifiedSections.push(item);
          const subject = subjects.find((row) => row.code === section.subject_code);
          if (subject && !subject.sectionId) {
            subject.section = section.section_code;
            subject.sectionId = section.id;
            subject.sectionStatus = section.status;
            subject.meetings = item.meetings;
          }
        }
      }
    }
    const verifiedSubjects = subjects.map((s) => ({
      ...s, sectionReady: qualifiedSections.some((sec) =>
        sec.id === s.sectionId && sec.status === "OPEN" &&
        sec.schedule_status === "FINALIZED" && sec.meetings.length > 0 &&
        sec.hasPrimaryInstructor && sec.hasVerifiedRooms),
    }));
    const current = (enrollmentsR.data || [])[0] || null;
    const reasons = admissionsAcademicBlockers({
      student: profile, term, curriculum, block, subjects: verifiedSubjects.map((s) => ({ subject_code: s.code })),
      sections: qualifiedSections, enrollments: enrollmentsR.data,
    });
    if (curriculumIsDemonstration) {
      reasons.unshift("The matching 2026 curriculum belongs to the Phase 8 fictional academic dataset. Academic Coordinator must validate and publish an institutional curriculum and real offerings before official enrollment.");
    }
    if (verifiedSubjects.some((s) => !s.active)) reasons.push("At least one required subject has not been activated by Academic Coordinator.");
    if (verifiedSubjects.some((s) => !["ELIGIBLE", "RETAKE"].includes(s.eligibility))) {
      reasons.push("Individual subject eligibility has not been evaluated and approved in official academic records.");
    }
    if (profile.student_status !== "ACTIVE") reasons.push("Registrar must clear the student academic record for official enrollment.");
    if (!current?.id && profile.current_curriculum_code !== curriculum?.code) {
      reasons.push("The selected curriculum has not yet been assigned to this student.");
    }
    if (!current?.id && profile.current_term_id !== term?.id) {
      reasons.push("The current term has not yet been assigned to this student.");
    }
    const registeredSubjects = current ? await admin.from("enrollment_subjects")
      .select("subject_code,section_id,registration_status,units_at_enrollment")
      .eq("enrollment_id", current.id) : { data: [], error: null };
    if (registeredSubjects.error) return ERROR;
    let confirmedCor = null;
    if (current?.status === "CONFIRMED" && current.confirmed_at) {
      const result = await ctx.client.rpc("official_enrollment_cor_v1", { p_enrollment_id: current.id });
      if (!result.error && result.data?.ready_to_print === true &&
          result.data?.student_number === profile.student_number && result.data?.official === true) {
        confirmedCor = result.data;
      }
    }
    const finished = current?.status === "CONFIRMED" && Boolean(confirmedCor);
    const realAcademicReady = Boolean(
      term && curriculum && !curriculumIsDemonstration && block &&
      verifiedSubjects.length > 0 && verifiedSubjects.every((s) =>
        s.active && s.sectionReady && s.sectionId &&
        Number.isFinite(Number(s.units)) && Number(s.units) > 0),
    );
    const academicPrepared = Boolean(realAcademicReady && profile.student_status === "ACTIVE" &&
      profile.current_term_id === term.id &&
      profile.current_curriculum_code === curriculum.code &&
      assignedBlockId === block.id);
    const savedSelections = registeredSubjects.data || [];
    const allSelected = savedSelections.length === verifiedSubjects.length &&
      verifiedSubjects.every((item) => savedSelections.some((saved) =>
        saved.subject_code === item.code && saved.section_id === item.sectionId &&
        saved.registration_status === "SELECTED"));
    // A previous selection RPC can fail after an otherwise atomic academic
    // placement. Permit the student to resume *only their verified existing*
    // IN_PROGRESS enrollment without creating duplicate academic records.
    const canPrepareAcademic = realAcademicReady &&
      (!current?.id || current.status === "IN_PROGRESS" && !allSelected) &&
      (profile.student_status === "ADMITTED" || profile.student_status === "ACTIVE") &&
      (profile.current_term_id == null || profile.current_term_id === term.id) &&
      (profile.current_curriculum_code == null || profile.current_curriculum_code === curriculum.code) &&
      (profile.student_type === "NEW_STUDENT" && yearLevel === 1 ||
        profile.student_type === "TRANSFEREE" && Number.isInteger(yearLevel) &&
        yearLevel >= 1 && yearLevel <= 4) &&
      (!assignedBlockId || academicPrepared);
    return {
      kind: "ready",
      student: {
        name: personR.data.full_name || profile.student_number,
        number: profile.student_number, type: profile.student_type,
        status: profile.student_status, program: profile.program_code,
        curriculum: curriculum?.code || null,
        curriculumName: curriculum?.name?.trim() || null, yearLevel,
        curriculumProvenance: curriculumIsDemonstration ? "PROJECT_ONLY_FICTIONAL" : "INSTITUTIONAL_CANDIDATE",
        classification: profile.academic_classification || "PENDING_EVALUATION",
      },
      term: termRow ? { id: termRow.id, label: termRow.label,
        academicYear: termRow.academic_year, semester: termRow.semester,
        enrollmentStart: termRow.enrollment_start, enrollmentEnd: termRow.enrollment_end,
      } : null,
      enrollment: {
        id: current?.id || null, status: current?.status || "NOT_STARTED",
        reference: current?.reference || null, confirmedAt: current?.confirmed_at || null,
        confirmationReference: current?.confirmation_reference || null,
        correctionReason: current?.current_correction_reason || null,
        subjects: verifiedSubjects, selectedSubjects: registeredSubjects.data || [],
        blockingReasons: finished ? [] : reasons,
        canPrepare: canPrepareAcademic,
        academicPrepared,
        canSubmit: Boolean(current?.id && current.status === "IN_PROGRESS" &&
          allSelected && verifiedSubjects.length > 0 && reasons.length === 0),
        cor: confirmedCor,
      },
      academic: {
        isOfficialCurriculum: Boolean(curriculum && !curriculumIsDemonstration && block &&
          verifiedSubjects.length && verifiedSubjects.every((s) => s.sectionReady)),
        curriculum: fullCurriculum,
        results: (historyR.data || []).map((r) => ({
          code: r.subject_code, term: r.term_id, units: r.units,
          result: r.result_status, grade: r.official_grade_value,
          source: "REGISTRAR_VERIFIED_IMPORT",
        })),
        credits: (creditsR.data || [])
          .filter((r) => r.evaluator_user_id && r.decided_at)
          .map((r) => ({
            code: r.target_subject_code, units: r.credited_units,
            result: "CREDITED", source: "APPROVED_INSTITUTIONAL_TRANSFER",
          })),
      },
      schedule: {
        kind: finished ? "confirmed" : realAcademicReady && block &&
          assignedBlockId === block.id
          ? "proposed" : "awaiting",
        // Only published and validated real blocks can be presented as a
        // proposed home block. A DRAFT block is not an assignment.
        homeBlock: assignedBlockId === block?.id ? block.code : null,
        items: finished ? confirmedCor.schedule : realAcademicReady &&
          assignedBlockId === block?.id
          ? verifiedSubjects.flatMap((s) => s.sectionReady
            ? s.meetings.map((m) => ({ ...m, subject_code: s.code })) : []) : [],
      },
      demonstration: await loadAdmissionsPhase8DemoForStudent(ctx),
      notices: reasons,
    };
  } catch {
    return ERROR;
  }
}
