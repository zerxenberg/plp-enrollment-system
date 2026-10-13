import { DEFAULT_DEMO_FEE_PER_UNIT, validateCurriculumActivation } from "./academic-reference.js";

// The demo stores human-readable statuses. Keep them compatible with existing
// curriculum fixtures, table filters, and browser-stored Academic Setup data.
export const CURRICULUM_STATUS = Object.freeze({
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ARCHIVED: "Archived",
});

const REQUIRED_STATUS = {
  activate: [CURRICULUM_STATUS.DRAFT, CURRICULUM_STATUS.INACTIVE],
  deactivate: [CURRICULUM_STATUS.ACTIVE],
  archive: [CURRICULUM_STATUS.INACTIVE],
  restore: [CURRICULUM_STATUS.ARCHIVED],
};

// Different specializations of one degree program have separate curriculum
// tracks. An activation must not deactivate another major's curriculum.
const sameTrack = (first, second) => first.program === second.program &&
  (first.major || "") === (second.major || "");

export function transitionCurriculumVersion(data, catalog, { id, action, actor, dateTime, eventId }) {
  const curricula = data.curricula || [];
  const selected = curricula.find((entry) => entry.id === id);
  if (!selected) return { ok: false, message: "Curriculum was not found." };
  if (!REQUIRED_STATUS[action]) return { ok: false, message: "Unknown curriculum action." };
  if (!REQUIRED_STATUS[action].includes(selected.status)) {
    return { ok: false, message: `A ${selected.status} curriculum cannot be ${action}d.`, status: selected.status };
  }

  const otherActive = curricula.filter((entry) => entry.id !== id &&
    entry.status === CURRICULUM_STATUS.ACTIVE && sameTrack(entry, selected));
  if (action === "activate") {
    const errors = validateCurriculumActivation(selected, catalog);
    if (errors.length) return { ok: false, message: errors[0], errors };
    if (otherActive.length > 1) {
      return { ok: false, message: "Multiple active versions already exist for this program and major. Resolve the conflicting records before activation." };
    }
  }

  const nextStatus = {
    activate: CURRICULUM_STATUS.ACTIVE,
    deactivate: CURRICULUM_STATUS.INACTIVE,
    archive: CURRICULUM_STATUS.ARCHIVED,
    restore: CURRICULUM_STATUS.INACTIVE,
  }[action];
  const currentActive = otherActive[0];
  const previous = selected.status;
  const nextCurricula = curricula.map((entry) => {
    if (entry.id === selected.id) {
      // Existing assignment subjects and prerequisite rules stay on this same
      // version, regardless of the lifecycle status.
      if (action !== "activate") return { ...entry, status: nextStatus };
      return {
        ...entry, status: nextStatus,
        assignments: (entry.assignments || []).map((assignment) => ({
          ...assignment,
          feePerUnit: Number(assignment.feePerUnit ??
            catalog.subjects.find((subject) => subject.code === assignment.subjectCode)?.feePerUnit ??
            DEFAULT_DEMO_FEE_PER_UNIT),
        })),
      };
    }
    if (action === "activate" && currentActive?.id === entry.id) {
      return { ...entry, status: CURRICULUM_STATUS.INACTIVE };
    }
    return entry;
  });
  const changes = action === "activate" && currentActive ? [
    { curriculum: currentActive, from: CURRICULUM_STATUS.ACTIVE, to: CURRICULUM_STATUS.INACTIVE,
      description: "Curriculum automatically deactivated", related: selected.version },
  ] : [];
  changes.push({
    curriculum: selected, from: previous, to: nextStatus,
    description: {
      activate: "Curriculum activated",
      deactivate: "Curriculum manually deactivated",
      archive: "Curriculum archived",
      restore: "Curriculum restored",
    }[action], related: currentActive?.version || "",
  });
  const events = changes.map(({ curriculum, from, to, description, related }, index) => ({
    id: `${eventId}-${index}`,
    dateTime,
    coordinator: actor,
    module: "Academic Setup",
    record: curriculum.version,
    recordId: curriculum.id,
    program: curriculum.program,
    major: curriculum.major || "",
    action: description,
    previousStatus: from,
    newStatus: to,
    previousValue: from,
    newValue: to,
    relatedCurriculum: related,
    actionResult: "Success",
  }));
  return {
    ok: true,
    next: { ...data, curricula: nextCurricula, history: [...events, ...(data.history || [])] },
    events,
    record: nextCurricula.find((entry) => entry.id === id),
    replaced: currentActive || null,
    message: action === "activate" && currentActive
      ? `${selected.version} is now active. ${currentActive.version} is inactive; existing student assignments are unchanged.`
      : `${selected.version} is now ${nextStatus.toLowerCase()}. Existing student curriculum assignments are unchanged.`,
  };
}
