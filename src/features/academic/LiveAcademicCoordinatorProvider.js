"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getLiveSession } from "@/lib/auth/live-auth";
import {
  loadLiveAcademicCoordinator,
  persistAcademicMaster,
} from "./live-academic-data";
import { loadSupabaseAcademicDemo } from "./supabase-demo-academic-data";
import { loadCoordinatorProjectAcademicHistoryPage } from "./coordinator-project-audit-actions";
import { scopeCoordinatorProjectPreview } from "./coordinator-project-reads.mjs";

const LiveCoordinatorContext = createContext(null);
const unavailable = (name) => ({ ok: false,
  message: `${name} requires a verified protected database transaction and is not yet available.` });
async function refreshConfirmedWrite(refresh, success) {
  try {
    await refresh();
    return success;
  } catch {
    return {
      ok: false,
      persisted: true,
      message: "The database confirmed this change, but the updated records could not be reloaded. Refresh the page before making another change.",
    };
  }
}

export function LiveAcademicCoordinatorProvider({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isCoordinator = pathname?.startsWith("/academic-coordinator");
  const [snapshot, setSnapshot] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const datasetRef = useRef("official");

  const loadSelectedDataset = useCallback(async () =>
    datasetRef.current === "synthetic"
      ? loadSupabaseAcademicDemo()
      : scopeCoordinatorProjectPreview(await loadLiveAcademicCoordinator()), []);

  const refresh = useCallback(async () => {
    const user = await getLiveSession();
    if (user?.role !== "academic-coordinator") {
      throw new Error("Academic Coordinator authentication is required.");
    }
    const next = await loadSelectedDataset();
    setSnapshot(next);
    setIdentity(user);
    return next;
  }, [loadSelectedDataset]);

  useEffect(() => {
    if (!isCoordinator) return undefined;
    let cancelled = false;
    const initialize = async () => {
      try {
        // Preview is only an explicit, single-page diagnostic. It must never
        // persist to later Coordinator pages or become the default dataset.
        const query = new URLSearchParams(window.location.search);
        sessionStorage.removeItem("plp-coordinator-dataset");
        datasetRef.current = query.get("dataset") === "synthetic"
          ? "synthetic" : "official";
        const user = await getLiveSession();
        if (cancelled) return;
        if (!user) { router.replace("/"); return; }
        if (user.role !== "academic-coordinator") {
          router.replace(user.redirect);
          return;
        }
        const next = await loadSelectedDataset();
        if (!cancelled) { setIdentity(user); setSnapshot(next); setError(""); }
      } catch (cause) {
        if (!cancelled) setError(cause?.message || "Could not load academic data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initialize();
    return () => { cancelled = true; };
  }, [isCoordinator, router, pathname, loadSelectedDataset]);

  const saveMaster = useCallback(async (table, operation, payload, key) => {
    const mapped = table === "programs"
      ? { code: payload?.code, name: payload?.name,
          organizational_unit_code: payload?.department || payload?.departmentId,
          status: payload?.status }
      : { code: payload?.code, name: payload?.name,
          description: payload?.description, units: Number(payload?.units),
          status: payload?.status };
    if (table === "programs" && Array.isArray(payload?.majors)) {
      const before = snapshot?.catalog?.programs?.find((entry) => entry.code === key)?.majors || [];
      const proposed = [...new Set(payload.majors)].sort();
      const existing = [...new Set(before)].sort();
      if (proposed.join("\u0000") !== existing.join("\u0000")) {
        return unavailable("Changing program specializations");
      }
    }
    if (table === "subjects" && Array.isArray(payload?.prerequisites) &&
      payload.prerequisites.length > 0) {
      return unavailable("Version-scoped prerequisite changes");
    }
    const result = await persistAcademicMaster(table, operation, mapped, key);
    if (result.ok) {
      const confirmed = await refreshConfirmedWrite(refresh, result);
      if (!confirmed.ok) return confirmed;
    }
    return result.ok && table === "subjects" ? {
      ...result,
      message: "Subject catalog record saved. Curriculum placement and prerequisites require the approved curriculum transaction.",
    } : result;
  }, [refresh, snapshot]);

  const createBlock = useCallback(async (input, id) => {
    if (!identity) return unavailable("Block planning");
    const values = {
      p_id: id || null,
      p_term_id: input.termId, p_code: input.code,
      p_program_code: input.programCode, p_curriculum_code: input.curriculumId,
      p_year_level: Number(input.yearLevel), p_section_letter: input.letter,
      p_capacity: Number(input.capacity), p_major_name: input.major || null,
    };
    if (!values.p_term_id || !values.p_code || !values.p_curriculum_code || !values.p_program_code ||
      !Number.isInteger(values.p_year_level) || !Number.isInteger(values.p_capacity) || values.p_capacity < 1) {
      return { ok: false, message: "Block term, program, curriculum, year, and positive capacity are required." };
    }
    const { error: writeError } = await supabase.rpc("save_academic_block", values);
    if (writeError) return { ok: false, message: "Block section could not be saved. Check term, program and curriculum compatibility." };
    return refreshConfirmedWrite(refresh, { ok: true });
  }, [identity, refresh]);

  const decideReview = useCallback(async (reference, payload) => {
    if (!identity) return unavailable("Academic Review");
    const decision = String(payload?.decision || "").toUpperCase();
    const reason = String(payload?.note || "").trim();
    if (!["APPROVED", "REJECTED", "RETURNED_FOR_CLARIFICATION"].includes(decision) || !reason) {
      return { ok: false, message: "Select a valid decision and enter a decision reason." };
    }
    const { data, error: decisionError } = await supabase.rpc("decide_academic_review", {
      p_enrollment_reference: reference,
      p_decision: decision,
      p_reason: reason,
    });
    if (decisionError) return { ok: false,
      message: "This case is no longer actionable or your account lacks permission." };
    return refreshConfirmedWrite(refresh, { ok: true, nextStatus: data });
  }, [identity, refresh]);

  const assignProposedStudents = useCallback(async ({ sectionId, studentIds }) => {
    if (!identity) return unavailable("Proposed roster assignment");
    if (!sectionId || !Array.isArray(studentIds) || studentIds.length === 0) {
      return { ok: false, message: "Select at least one student for a valid block." };
    }
    const { data, error: assignmentError } = await supabase.rpc("assign_proposed_block_students", {
      p_block_id: sectionId, p_student_ids: studentIds,
    });
    if (assignmentError) {
      return { ok: false, message: "The roster proposal could not be saved. Recheck the students, curriculum, and available capacity." };
    }
    return refreshConfirmedWrite(refresh, { ok: true, message: `${data} new student proposals saved.` });
  }, [identity, refresh]);

  const transferProposedStudent = useCallback(async ({ studentId, fromSectionId, toSectionId, reason }) => {
    if (!identity) return unavailable("Proposed roster transfer");
    if (!reason?.trim()) return { ok: false, message: "A transfer reason is required." };
    const { error: transferError } = await supabase.rpc("transfer_proposed_block_student", {
      p_student_id: studentId,
      p_from_block_id: fromSectionId,
      p_to_block_id: toSectionId,
      p_reason: reason.trim(),
    });
    if (transferError) {
      return { ok: false, message: "Transfer was rejected. Check both blocks, student eligibility and capacity." };
    }
    return refreshConfirmedWrite(refresh, { ok: true });
  }, [identity, refresh]);

  const saveCurriculum = useCallback(async (payload, existingCode = null) => {
    if (!identity) return unavailable("Curriculum management");
    if (!payload?.program || !payload?.version || !payload?.effectiveAcademicYear ||
      !Array.isArray(payload?.assignments)) {
      return { ok: false, message: "Program, version, effective academic year, and subject placements are required." };
    }
    const { data, error: changeError } = await supabase.rpc("save_curriculum_draft", {
      p_record: {
        program: payload.program,
        major: payload.major || "",
        version: payload.version,
        effectiveAcademicYear: payload.effectiveAcademicYear,
        assignments: payload.assignments.map((item) => ({
          subjectCode: item.subjectCode, yearLevel: item.yearLevel,
          semester: item.semester, prerequisites: item.prerequisites || [],
        })),
      },
      p_existing_code: existingCode,
    });
    if (changeError) return { ok: false, message: "The curriculum draft could not be saved. Verify its version, subject placements, and prerequisite graph." };
    return refreshConfirmedWrite(refresh, { ok: true, record: { id: data } });
  }, [identity, refresh]);

  const manageCurriculum = useCallback(async (code, action) => {
    if (!identity) return unavailable("Curriculum version transition");
    const { data, error: actionError } = await supabase.rpc("manage_curriculum_version", {
      p_code: code, p_action: action,
    });
    if (actionError) return { ok: false, message: "The curriculum operation was rejected by its current status or validation rules." };
    if (data?.ok && action !== "VALIDATE") {
      const confirmed = await refreshConfirmedWrite(refresh, { ok: true });
      if (!confirmed.ok) return confirmed;
    }
    return data?.ok ? { ok: true, message: data.message, record: { id: data.code } } :
      { ok: false, message: data?.message || "The curriculum version is not ready." };
  }, [identity, refresh]);

  const saveMeeting = useCallback(async (input) => {
    if (!identity) return unavailable("Class meeting");
    const ids = String(input?.subjectClassId || "").split(":");
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayNumber = days.indexOf(input?.day) + 1;
    if (ids.length !== 2 || !dayNumber || !input?.start || !input?.end ||
        !input?.roomId || !input?.professorId) {
      return { ok: false, message: "Select a subject class, instructor, room, day and valid meeting times." };
    }
    const { error: scheduleError } = await supabase.rpc("save_proposed_class_meeting", {
      p_block_id: ids[0], p_section_id: ids[1],
      p_meeting_id: input?.id ? String(input.id).split(":")[0] : null,
      p_day: dayNumber, p_start: input.start, p_end: input.end,
      p_room_id: input.roomId, p_instructor_id: input.professorId,
    });
    if (scheduleError) return { ok: false, message: "Class meeting could not be saved. Review conflicting rooms, instructors, blocks and time ranges." };
    return refreshConfirmedWrite(refresh, { ok: true });
  }, [identity, refresh]);

  const cancelMeeting = useCallback(async (meetingDisplayId) => {
    if (!identity) return unavailable("Class meeting cancellation");
    const meeting = snapshot?.blockPlanning?.classMeetings?.find((row) => row.id === meetingDisplayId);
    const sourceClass = snapshot?.blockPlanning?.subjectClasses?.find(
      (row) => row.id === meeting?.subjectClassId);
    const ids = String(sourceClass?.id || "").split(":");
    if (!meeting || ids.length !== 2) return { ok: false, message: "Meeting reference is unavailable." };
    const { data, error: cancelError } = await supabase.rpc("cancel_proposed_class_meeting", {
      p_block_id: ids[0], p_section_id: ids[1],
      p_meeting_id: String(meeting.id).split(":")[0],
    });
    if (cancelError || !data) return { ok: false, message: "Meeting could not be cancelled in the current planning state." };
    return refreshConfirmedWrite(refresh, { ok: true });
  }, [identity, refresh, snapshot]);

  const publishBlockSchedule = useCallback(async (blockId) => {
    if (!identity) return unavailable("Class schedule publication");
    const { data, error: publicationError } = await supabase.rpc("publish_proposed_block_schedule", {
      p_block_id: blockId,
    });
    if (publicationError || !data) return { ok: false, message: "Publication requires complete classes, valid meeting times and no shared room, instructor or block conflicts." };
    return refreshConfirmedWrite(refresh,
      { ok: true, message: "Planning schedule published. Registrar confirmation remains separate." });
  }, [identity, refresh]);

  const markLiveNotification = useCallback(async (role, id, read = true) => {
    if (!identity || role !== "academic-coordinator") return false;
    const { data: updated, error: updateError } = await supabase.from("user_notifications")
      .update({ is_read: read, read_at: read ? new Date().toISOString() : null })
      .eq("user_id", identity.id).eq("notification_id", id)
      .select("notification_id").maybeSingle();
    if (updateError || !updated) return false;
    return (await refreshConfirmedWrite(refresh, { ok: true })).ok;
  }, [identity, refresh]);
  const markAllLiveNotifications = useCallback(async (role) => {
    if (!identity || role !== "academic-coordinator") return false;
    const { error: updateError } = await supabase.from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", identity.id).eq("is_read", false);
    if (updateError) return false;
    return (await refreshConfirmedWrite(refresh, { ok: true })).ok;
  }, [identity, refresh]);

  const value = useMemo(() => {
    if (!isCoordinator || !snapshot) return null;
    const currentValue = {
      isSyntheticDemo: Boolean(snapshot.isSyntheticDemo),
      loadAcademicHistoryPage: snapshot.isSyntheticDemo ? null : loadCoordinatorProjectAcademicHistoryPage,
      catalog: snapshot.catalog,
      academicCatalog: snapshot.catalog,
      academicCoordinatorData: snapshot.academicCoordinatorData,
      blockPlanning: snapshot.blockPlanning,
      registrar: snapshot.registrar,
      student: snapshot.student || { profile: {}, term: snapshot.term, enrollment: {}, academicResults: [] },
      academicCoordinators: [{ fullName: identity?.name || "Academic Coordinator",
        email: identity?.identifier || "", username: identity?.identifier || "" }],
      notifications: snapshot.notifications,
      createAcademicProgram: (form) => saveMaster("programs", "create", form),
      updateAcademicProgram: (code, form) => saveMaster("programs", "update", form, code),
      createAcademicSubject: (form) => saveMaster("subjects", "create", form),
      updateAcademicSubject: (code, form) => saveMaster("subjects", "update", form, code),
      createBlockSection: (form) => createBlock(form),
      updateBlockSection: (id, form) => createBlock(form, id),
      createCurriculumVersion: (payload) => saveCurriculum(payload),
      updateCurriculumVersion: (code, payload) => saveCurriculum(payload, code),
      duplicateCurriculumVersion: (code) => manageCurriculum(code, "DUPLICATE"),
      validateCurriculumVersion: (code) => manageCurriculum(code, "VALIDATE"),
      activateCurriculumVersion: (code) => manageCurriculum(code, "ACTIVATE"),
      deactivateCurriculumVersion: (code) => manageCurriculum(code, "DEACTIVATE"),
      archiveCurriculumVersion: (code) => manageCurriculum(code, "ARCHIVE"),
      restoreCurriculumVersion: (code) => manageCurriculum(code, "RESTORE"),
      resetMockAcademicSetup: () => unavailable("Resetting official academic records"),
      deleteAcademicSubject: () => unavailable("Deleting official subjects"),
      deleteAcademicProgram: () => unavailable("Deleting official programs"),
      savePrerequisiteRule: () => unavailable("Prerequisite changes"),
      removePrerequisiteRule: () => unavailable("Prerequisite changes"),
      createSubjectOffering: () => unavailable("Offering changes"),
      updateSubjectOffering: () => unavailable("Offering changes"),
      createAcademicSection: () => unavailable("Instructional section changes"),
      updateAcademicSection: () => unavailable("Instructional section changes"),
      saveAcademicSchedule: () => unavailable("Schedule changes"),
      assignBlockStudents: assignProposedStudents,
      transferBlockStudent: transferProposedStudent,
      saveBlockMeeting: saveMeeting,
      removeBlockMeeting: cancelMeeting,
      finalizeBlockSchedule: publishBlockSchedule,
      resetBlockDemoData: () => unavailable("Resetting official section data"),
      decideAcademicReview: decideReview,
      markNotification: markLiveNotification,
      markAllNotifications: markAllLiveNotifications,
    };
    if (snapshot.isSyntheticDemo) {
      // Never send edits on synthetic source keys to authoritative RPCs.
      const readOnly = () => unavailable(
        "Synthetic preview is read only. Exit using ?dataset=official to edit official academic records");
      return {
        ...currentValue,
        createAcademicProgram: readOnly,
        updateAcademicProgram: readOnly,
        createAcademicSubject: readOnly,
        updateAcademicSubject: readOnly,
        createBlockSection: readOnly,
        updateBlockSection: readOnly,
        createCurriculumVersion: readOnly,
        updateCurriculumVersion: readOnly,
        duplicateCurriculumVersion: readOnly,
        validateCurriculumVersion: readOnly,
        activateCurriculumVersion: readOnly,
        deactivateCurriculumVersion: readOnly,
        archiveCurriculumVersion: readOnly,
        restoreCurriculumVersion: readOnly,
        resetMockAcademicSetup: readOnly,
        deleteAcademicSubject: readOnly,
        deleteAcademicProgram: readOnly,
        savePrerequisiteRule: readOnly,
        removePrerequisiteRule: readOnly,
        createSubjectOffering: readOnly,
        updateSubjectOffering: readOnly,
        createAcademicSection: readOnly,
        updateAcademicSection: readOnly,
        saveAcademicSchedule: readOnly,
        assignBlockStudents: readOnly,
        transferBlockStudent: readOnly,
        saveBlockMeeting: readOnly,
        removeBlockMeeting: readOnly,
        finalizeBlockSchedule: readOnly,
        resetBlockDemoData: readOnly,
        decideAcademicReview: readOnly,
        markNotification: () => false,
        markAllNotifications: () => false,
      };
    }
    return currentValue;
  }, [assignProposedStudents, cancelMeeting, createBlock, decideReview, identity, isCoordinator,
    manageCurriculum, markAllLiveNotifications, markLiveNotification,
    publishBlockSchedule, saveCurriculum, saveMaster, saveMeeting,
    snapshot, transferProposedStudent]);

  if (isCoordinator && (loading || error || !snapshot)) {
    return (
      <main className="portal-content" role="status" aria-live="polite">
        <p>{error || "Loading authorized Academic Coordinator records..."}</p>
        {error && <button type="button" className="portal-button" onClick={() => {
          setLoading(true);
          setError("");
          refresh().then(() => setLoading(false)).catch((cause) => {
            setError(cause.message || "The academic database is unavailable.");
            setLoading(false);
          });
        }}>Retry Database Connection</button>}
      </main>
    );
  }

  return <LiveCoordinatorContext.Provider value={value}>{children}</LiveCoordinatorContext.Provider>;
}

export function useLiveAcademicCoordinator() {
  return useContext(LiveCoordinatorContext);
}
