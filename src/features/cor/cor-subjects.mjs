import { displaySubjectCode } from "../academic/project-academic-display-aliases.mjs";

// The registered snapshot retains immutable database identities. Look up those
// identities in the existing subject catalog before deriving presentation codes.
export function verifiedCorSubjectDisplayCodes(registeredSubjects, catalogSubjects) {
  if (!Array.isArray(registeredSubjects) || !registeredSubjects.length ||
      !Array.isArray(catalogSubjects)) {
    throw new Error("The COR subject catalog could not be verified.");
  }
  const codes = new Set();
  for (const subject of registeredSubjects) {
    const code = subject?.subject_code;
    if (typeof code !== "string" || !code.trim() || code !== code.trim() ||
        codes.has(code)) {
      throw new Error("The COR registered subject identities are invalid or duplicated.");
    }
    codes.add(code);
  }
  const catalog = new Map();
  for (const subject of catalogSubjects) {
    if (!codes.has(subject?.code) || typeof subject?.name !== "string" ||
        !subject.name.trim() || catalog.has(subject.code)) {
      throw new Error("The COR subject catalog contains inconsistent records.");
    }
    const displayCode = displaySubjectCode(subject.code);
    // A Phase 8 internal identifier must never become a printed subject code
    // simply because the catalog contains a future or malformed identifier.
    if (subject.code.startsWith("P8F26-") && displayCode === subject.code) {
      throw new Error("The COR subject catalog has no readable code for a registered subject.");
    }
    catalog.set(subject.code, displayCode);
  }
  if (catalog.size !== codes.size || [...catalog.values()].some((code) => !code) ||
      new Set(catalog.values()).size !== catalog.size) {
    throw new Error("A registered COR subject is missing or has an ambiguous display code.");
  }
  return catalog;
}
