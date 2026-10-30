import "server-only";

const TERM = "TERM-2026-1";

export async function loadAdmissionsPhase8DemoForStudent(context) {
  const unavailable = { kind: "unavailable", projectOnly: true, verifiedInstitutionally: false,
    provenance: "PROJECT_ONLY_FICTIONAL" };
  if (context?.kind !== "live" || !context.studentId || !context.admin) return unavailable;
  const admin = context.admin;
  try {
    const [enroll, profile, term, handoff, source] = await Promise.all([
      admin.from("admissions_phase8_demo_enrollments").select("*").eq("student_id", context.studentId)
        .eq("term_id", TERM).maybeSingle(),
      admin.from("student_profiles")
        .select("id,user_id,program_code,student_type,student_status,year_level_number,is_synthetic_demo,record_kind")
        .eq("id", context.studentId).maybeSingle(),
      admin.from("academic_terms").select("id,label,semester,status,enrollment_start,enrollment_end")
        .eq("id", TERM).maybeSingle(),
      admin.from("admission_handoffs")
        .select("student_id,approved_program_code,admission_status,synchronization_status,source_name")
        .eq("student_id", context.studentId).eq("source_name", "PLP Admissions").maybeSingle(),
      admin.from("admissions_student_source_details")
        .select("student_id,inputted_gwa,gwa_verified").eq("student_id", context.studentId).maybeSingle(),
    ]);
    if ([enroll, profile, term, handoff, source].some((r) => r.error) ||
        !profile.data || !term.data || !handoff.data ||
        profile.data.user_id !== context.appUserId ||
        profile.data.is_synthetic_demo !== false || profile.data.record_kind === "PROJECT_ONLY" ||
        handoff.data.approved_program_code !== profile.data.program_code ||
        handoff.data.admission_status !== "ACCEPTED" ||
        handoff.data.synchronization_status !== "Successful") return unavailable;

    const student = profile.data;
    const saved = enroll.data;
    const blockers = [];
    const assessedYear = student.year_level_number || (student.student_type === "NEW_STUDENT" ? 1 : null);
    if (student.student_type === "TRANSFEREE" &&
        (!assessedYear || !source.data?.gwa_verified || source.data?.inputted_gwa == null)) {
      blockers.push("Transferee year level and admission GWA require authorized verification before demonstration placement.");
    }
    if (!["NEW_STUDENT", "TRANSFEREE"].includes(student.student_type)) {
      blockers.push("Only admitted Freshmen and Transferees are supported in this demonstration.");
    }
    const { data: currentWindow, error: windowError } = await admin
      .from("project_phase8_demo_enrollment_window")
      .select("start_date,end_date,status,source_type,verified_institutionally")
      .eq("project_cohort_id", "PLP_PROJECT_600_2026_1").maybeSingle();
    if (windowError) return unavailable;
    const todayParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const todayObject = Object.fromEntries(todayParts.map((p) => [p.type, p.value]));
    const today = `${todayObject.year}-${todayObject.month}-${todayObject.day}`;
    const periodOpen = currentWindow?.status === "OPEN" &&
      currentWindow.source_type === "PROJECT_ONLY_FICTIONAL" &&
      currentWindow.verified_institutionally === false &&
      today >= currentWindow.start_date && today <= currentWindow.end_date;
    if (!periodOpen) blockers.push("The configured Phase 8 demonstration enrollment period is closed.");

    let block = null;
    const status = saved?.status || "UNASSIGNED";
    if (saved?.block_id) {
      const { data, error } = await admin.from("block_sections")
        .select("id,code,curriculum_code,program_code,term_id,year_level,planning_status,capacity,is_synthetic_demo")
        .eq("id", saved.block_id).maybeSingle();
      if (error || !data || data.is_synthetic_demo !== true || data.term_id !== TERM ||
          data.program_code !== student.program_code || data.year_level !== assessedYear ||
          data.curriculum_code !== saved.curriculum_code) return unavailable;
      block = data;
    }
    const subjectRows = [];
    let curriculumPlan = [];
    let curriculumName = null;
    let feeTotal = 0;
    let missingRates = 0;
    if (block) {
      const [provenance, curriculum, links, catalog, allCurriculum] = await Promise.all([
        admin.from("phase8_fictional_curriculum_provenance")
          .select("source_type,is_official").eq("curriculum_code", block.curriculum_code).maybeSingle(),
        admin.from("curriculum_subjects")
          .select("subject_code,units_override,year_level_number,semester")
          .eq("curriculum_code", block.curriculum_code).eq("year_level_number", assessedYear)
          .eq("semester", term.data.semester),
        admin.from("block_subject_sections").select("section_id").eq("block_id", block.id),
        admin.from("curricula").select("code,name,program_code")
          .eq("code", block.curriculum_code).maybeSingle(),
        admin.from("curriculum_subjects")
          .select("subject_code,units_override,year_level_number,semester")
          .eq("curriculum_code", block.curriculum_code)
          .order("year_level_number").order("semester"),
      ]);
      if (provenance.error || provenance.data?.is_official !== false ||
          provenance.data?.source_type !== "PROJECT_ONLY_FICTIONAL" ||
          curriculum.error || links.error || catalog.error || allCurriculum.error ||
          !curriculum.data.length || !allCurriculum.data?.length ||
          catalog.data?.code !== block.curriculum_code ||
          catalog.data.program_code !== student.program_code) return unavailable;
      curriculumName = typeof catalog.data.name === "string" ? catalog.data.name.trim() : null;
      const ids = [...new Set(links.data.map((s) => s.section_id))];
      const codes = [...new Set(curriculum.data.map((s) => s.subject_code))];
      const fullCurriculumCodes = [...new Set(allCurriculum.data.map((s) => s.subject_code))];
      const [sections, subjects, meetings, rates] = await Promise.all([
        ids.length ? admin.from("sections").select("id,subject_code,section_code,status,schedule_status,is_synthetic_demo")
          .in("id", ids) : { data: [], error: null },
        fullCurriculumCodes.length ? admin.from("subjects")
          .select("code,name,units,status").in("code", fullCurriculumCodes)
          : { data: [], error: null },
        ids.length ? admin.from("section_meetings")
          .select("section_id,day_of_week,start_time,end_time,room_id,meeting_status,is_synthetic_demo")
          .in("section_id", ids) : { data: [], error: null },
        codes.length ? admin.from("academic_estimated_curriculum_rates")
          .select("subject_code,rate_per_unit,classification")
          .eq("curriculum_code", block.curriculum_code).in("subject_code", codes)
          : { data: [], error: null },
      ]);
      if ([sections, subjects, meetings, rates].some((r) => r.error)) return unavailable;
      const { data: sourcePrices, error: sourcePricesError } = codes.length
        ? await admin.from("academic_estimated_subject_prices")
          .select("subject_code,rate_per_unit,classification").in("subject_code", codes)
        : { data: [], error: null };
      if (sourcePricesError) return unavailable;
      const roomIds = [...new Set(meetings.data.map((m) => m.room_id).filter(Boolean))];
      const [rooms, assignments] = await Promise.all([
        roomIds.length ? admin.from("rooms").select("id,room_code,is_synthetic_demo").in("id", roomIds)
          : { data: [], error: null },
        ids.length ? admin.from("section_instructors").select("section_id,instructor_id,assignment_role").in("section_id", ids)
          : { data: [], error: null },
      ]);
      if (rooms.error || assignments.error) return unavailable;
      const instructorIds = [...new Set(assignments.data.map((x) => x.instructor_id).filter(Boolean))];
      const professors = instructorIds.length ? await admin.from("instructors")
        .select("id,display_name,is_synthetic_demo").in("id", instructorIds) : { data: [], error: null };
      if (professors.error) return unavailable;
      const bySubject = new Map(subjects.data.map((s) => [s.code, s]));
      curriculumPlan = allCurriculum.data.map((row) => {
        const resolvedUnits = row.units_override ?? bySubject.get(row.subject_code)?.units;
        const numericUnits = resolvedUnits == null ? null : Number(resolvedUnits);
        return {
          code: row.subject_code,
          name: bySubject.get(row.subject_code)?.name || row.subject_code,
          units: Number.isFinite(numericUnits) ? numericUnits : null,
          yearLevel: row.year_level_number, semester: row.semester,
        };
      });
      const byRate = new Map((sourcePrices || []).filter((r) =>
        r.classification === "SYNTHETIC_DEVELOPMENT_ONLY")
        .map((r) => [r.subject_code, r]));
      for (const specific of rates.data) {
        if (specific.classification === "SYNTHETIC_DEVELOPMENT_ONLY") {
          byRate.set(specific.subject_code, specific);
        }
      }
      const byRoom = new Map(rooms.data.map((r) => [r.id, r]));
      const byProfessor = new Map(professors.data.map((i) => [i.id, i]));
      for (const item of curriculum.data) {
        const sectionsForSubject = sections.data.filter((s) => s.subject_code === item.subject_code &&
          s.is_synthetic_demo === true && s.status === "OPEN" && s.schedule_status === "FINALIZED");
        const chosen = sectionsForSubject.length === 1 ? sectionsForSubject[0] : null;
        const subject = bySubject.get(item.subject_code);
        const rate = byRate.get(item.subject_code);
        const units = Number(item.units_override ?? subject?.units);
        if (rate && Number.isFinite(Number(rate.rate_per_unit)) && Number.isFinite(units)) {
          feeTotal += units * Number(rate.rate_per_unit);
        } else missingRates += 1;
        const professorRef = assignments.data.find((a) =>
          a.section_id === chosen?.id && a.assignment_role === "PRIMARY");
        const professor = byProfessor.get(professorRef?.instructor_id);
        const foundMeetings = meetings.data.filter((m) => m.section_id === chosen?.id &&
          m.meeting_status === "ACTIVE" && m.is_synthetic_demo === true)
          .map((m) => ({
            day: m.day_of_week, start: m.start_time, end: m.end_time,
            room: byRoom.get(m.room_id)?.room_code || null,
            instructor: professor?.display_name || null,
            component: null,
          }));
        if (!chosen || !foundMeetings.length || !professor ||
            foundMeetings.some((m) => !m.room || !m.instructor)) {
          blockers.push(`Phase 8 subject ${item.subject_code} has an incomplete finalized timetable.`);
        }
        subjectRows.push({
          code: item.subject_code, name: subject?.name || item.subject_code,
          units, eligibility: "ELIGIBLE_FOR_DEMONSTRATION",
          reason: "Freshman/Transferee demonstration policy. No transfer credits inferred.",
          section: chosen?.section_code || null, sectionId: chosen?.id || null,
          sectionStatus: chosen?.status || null, meetings: foundMeetings,
          feeEstimate: rate ? units * Number(rate.rate_per_unit) : null,
        });
      }
    }
    const confirmed = saved?.status === "CONFIRMED_SIMULATION" &&
      Boolean(saved.confirmed_at) && Array.isArray(saved.subject_snapshot) &&
      saved.subject_snapshot.length > 0;
    const registration = confirmed ? {
      id: saved.id, source: "CONFIRMED_PROJECT_REGISTRATION_SNAPSHOT",
      registrationSnapshotComplete: true,
      reference: `DEMO-${saved.id.slice(0, 8).toUpperCase()}`,
      confirmedAt: saved.confirmed_at,
      // Registrar confirmation preserves this estimate. Never recalculate a
      // historical registered fee using subsequently edited project rates.
      feeEstimate: saved.fee_estimate || null,
      units: saved.subject_snapshot.reduce((n, s) => n + Number(s.units || 0), 0),
      subjects: saved.subject_snapshot, items: saved.subject_snapshot.flatMap((s) =>
        (s.meetings || []).map((m) => ({ ...m, subject_code: s.code }))),
    } : null;
    const blockersForSubmission = [...blockers];
    if (!block) blockersForSubmission.push("Academic demonstration block assignment is pending.");
    if (missingRates) blockersForSubmission.push("Some demonstration estimated tuition rates have not been verified.");
    const canSubmit = status === "PROPOSED" && !blockersForSubmission.length && subjectRows.length > 0;
    return {
      kind: blockersForSubmission.length ? "blocked" : "ready",
      projectOnly: true, verifiedInstitutionally: false,
      provenance: "PROJECT_ONLY_FICTIONAL",
      id: saved?.id || null, status, term: { id: TERM, label: term.data.label },
      curriculum: block ? { code: block.curriculum_code,
        name: curriculumName, label: curriculumName || block.curriculum_code } : null,
      homeBlock: block ? { code: block.code, status: block.planning_status } : null,
      subjects: subjectRows,
      curriculumPlan,
      registration,
      feeEstimate: {
        estimatedAmount: missingRates ? null : feeTotal,
        currency: "PHP", totalUnits: subjectRows.reduce((n, s) => n + Number(s.units || 0), 0),
        verifiedRateCount: subjectRows.length - missingRates, missingRateCount: missingRates,
      },
      blockingReasons: blockersForSubmission,
      canPrepare: !saved && !blockers.some((r) => r.includes("Transferee") || r.includes("period")),
      canSubmit, canReopen: status === "RETURNED",
      correctionReason: saved?.correction_reason || null,
    };
  } catch {
    return unavailable;
  }
}
