import { displaySubjectCode } from "../academic/project-academic-display-aliases.mjs";

// The registered snapshot retains immutable database identities. Look up those
// identities in the existing subject catalog before deriving presentation codes.
export function verifiedCorSubjectDisplayCodes(registeredSubjects, catalogSubjects) {
  if (!Array.isArray(registeredSubjects) || !registeredSubjects.length ||
      !Array.isArray(catalogSubjects)) {
    throw new Error("The COR subject catalog could not be verified.");
  }
  const codes = new Set(registeredSubjects.map((subject) => subject.subject_code));
  const catalog = new Map();
  for (const subject of catalogSubjects) {
    if (!codes.has(subject.code) || !subject.name || catalog.has(subject.code)) {
      throw new Error("The COR subject catalog contains inconsistent records.");
    }
    catalog.set(subject.code, displaySubjectCode(subject.code));
  }
  if (catalog.size !== codes.size || [...catalog.values()].some((code) => !code) ||
      new Set(catalog.values()).size !== catalog.size) {
    throw new Error("A registered COR subject is missing or has an ambiguous display code.");
  }
  return catalog;
}
