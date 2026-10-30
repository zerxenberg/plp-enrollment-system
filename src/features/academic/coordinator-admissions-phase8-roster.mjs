// Display-only scoping. The protected Admissions action is responsible for
// final actor authorization, student provenance, target block and capacity.
const currentYear = (value) => {
  const match = String(value ?? "").match(/\b[1-4]\b|^[1-4](?:st|nd|rd|th)/i);
  return match ? Number(match[0][0]) : null;
};

export function isAdmissionsPhase8Block(block, curricula = []) {
  return Boolean(block?.id && block?.curriculumId && curricula.some((item) =>
    item.id === block.curriculumId && item.isProjectOnly === true &&
    item.provenance === "PROJECT_ONLY_FICTIONAL"));
}

export function admissionsPhase8CandidatesForBlock(students, block) {
  if (!block || !Array.isArray(students)) return [];
  return students.filter((student) => student && student.programCode === block.programCode &&
    currentYear(student.yearLevel) != null && currentYear(student.yearLevel) === currentYear(block.yearLevel));
}

export function admissionsPhase8RosterForBlock(students, block) {
  if (!block || !Array.isArray(students)) return [];
  // Keep existing placements visible even if the source academic profile has
  // since changed and requires Coordinator review rather than hiding the row.
  return students.filter((student) => student &&
    (student.assignedBlockId
      ? student.assignedBlockId === block.id
      : Boolean(student.assignedBlockCode && student.assignedBlockCode === block.code)));
}

export function admissionsPhase8TransferTargets(blocks, origin, curricula) {
  if (!origin || !Array.isArray(blocks) || !isAdmissionsPhase8Block(origin, curricula)) return [];
  return blocks.filter((target) =>
    target.id !== origin.id &&
    isAdmissionsPhase8Block(target, curricula) &&
    target.termId === origin.termId &&
    target.programCode === origin.programCode &&
    (target.major || "") === (origin.major || "") &&
    currentYear(target.yearLevel) === currentYear(origin.yearLevel) &&
    target.curriculumId === origin.curriculumId &&
    String(target.status || "").toUpperCase() === "PUBLISHED");
}

export function isAdmissionsPhase8Transferable(student) {
  return Boolean(student?.active === true &&
    ["PROPOSED", "RETURNED"].includes(String(student.assignedStatus || "").toUpperCase()));
}

// A returned demonstration record still has its assigned block and can be
// reopened, so its seat remains reserved. An inactive account does not release
// an otherwise active reservation; only the assignment status controls it.
const SEAT_RESERVING_STATUSES = new Set([
  "PROPOSED", "SUBMITTED", "VALIDATED", "RETURNED", "CONFIRMED_SIMULATION",
]);

export function admissionsPhase8ReservationsByBlock(students, blocks, curricula) {
  const scoped = (Array.isArray(blocks) ? blocks : [])
    .filter((block) => isAdmissionsPhase8Block(block, curricula));
  const blockById = new Map(scoped.map((block) => [block.id, block]));
  const uniqueByCode = new Map();
  for (const block of scoped) {
    if (!uniqueByCode.has(block.code)) uniqueByCode.set(block.code, block);
    else uniqueByCode.set(block.code, null);
  }
  const identities = new Map(scoped.map((block) => [block.id, new Set()]));
  for (const student of Array.isArray(students) ? students : []) {
    if (!student?.id ||
        !SEAT_RESERVING_STATUSES.has(String(student.assignedStatus || "").toUpperCase())) continue;
    // ID is authoritative. A missing ID can be resolved only from a unique
    // section code, never by arbitrarily matching across academic terms.
    const block = student.assignedBlockId
      ? blockById.get(student.assignedBlockId)
      : uniqueByCode.get(student.assignedBlockCode);
    if (block) identities.get(block.id).add(student.id);
  }
  return new Map([...identities].map(([id, unique]) => [id, unique.size]));
}

export function combinedPhase8Occupied(originalOccupied, admissionsReserved) {
  if (admissionsReserved === null || admissionsReserved === undefined) return null;
  const original = Number(originalOccupied);
  const admissions = Number(admissionsReserved);
  if (!Number.isSafeInteger(original) || original < 0 ||
      !Number.isSafeInteger(admissions) || admissions < 0) return null;
  return original + admissions;
}

export function combinedPhase8Available(capacity, occupied) {
  const slots = Number(capacity);
  if (occupied === null || !Number.isSafeInteger(slots) || slots < 0) return null;
  return Math.max(0, slots - occupied);
}
