const CANONICAL_SUFFIX = Object.freeze({ JR: "Jr.", SR: "Sr.", II: "II", III: "III", IV: "IV" });
const TRAILING_SUFFIX = /(?:^|[\s,])(?:Jr\.?|Sr\.?|II|III|IV)$/i;

/**
 * Display a student name without abbreviating middle names. An existing
 * fullName is authoritative, including any suffix already stored with it.
 */
export function formatStudentName({
  fullName,
  firstName,
  middleName,
  lastName,
  suffix,
} = {}) {
  const storedName = typeof fullName === "string" && fullName.trim() ? fullName : "";
  const structuredName = [firstName, middleName, lastName]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim())
    .join(" ");
  const name = storedName || structuredName;

  const suffixKey = typeof suffix === "string" ? suffix.trim().replace(/\.$/, "").toUpperCase() : "";
  const displaySuffix = CANONICAL_SUFFIX[suffixKey];
  if (!name || !displaySuffix || TRAILING_SUFFIX.test(name.trimEnd())) {
    return name;
  }

  return `${name.trimEnd()} ${displaySuffix}`;
}
