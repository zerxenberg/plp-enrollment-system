// Client-side presentation only. Callers must pass records already authorized
// and scoped by the protected Registrar workspace server action.
import { displaySubjectCode } from "../academic/project-academic-display-aliases.mjs";
const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase();

// The protected publication RPC requires READY_FOR_REVIEW plus verified_at.
// Do not mutate that canonical state just to show verification progress.
export function projectGradeBatchDisplayStatus(batch) {
  if (batch?.status === "READY_FOR_REVIEW") {
    return batch.verified_at
      ? { value: "VALIDATED", label: "Verified", detail: "Awaiting block publication" }
      : { value: "READY_FOR_REVIEW", label: "Ready for verification", detail: "Evidence verification pending" };
  }
  const value = batch?.status || "NOT_STARTED";
  return { value, label: value.replaceAll("_", " "), detail: null };
}

function matchesFields(record, search, fields) {
  return fields.some((field) => {
    const value = record[field];
    return (Array.isArray(value) ? value.join(" ") : String(value ?? ""))
      .toLocaleLowerCase().includes(search);
  });
}

export function filterProjectGradeBatches(batches, query) {
  const search = normalize(query);
  if (!search) return batches;
  return batches.filter((batch) => {
    const displayStatus = projectGradeBatchDisplayStatus(batch);
    return matchesFields(batch, search, [
      "id", "file_name", "subject_code", "source_system", "source_reference",
      "issuer", "status", "publication_reference", "previous_block_code",
    ]) || [displayStatus.label, displayStatus.detail, displaySubjectCode(batch.subject_code)]
      .some((value) => normalize(value).includes(search));
  });
}

export function filterProjectGradeReleases(releases, query) {
  const search = normalize(query);
  if (!search) return releases;
  return releases.filter((release) => matchesFields(release, search, [
    "id", "block_id", "term_id", "publication_reference", "status", "batch_ids",
  ]));
}

export function paginateProjectGradeHistory(rows, requestedPage, pageSize = 8) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 8;
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const page = Number.isInteger(requestedPage)
    ? Math.max(1, Math.min(requestedPage, totalPages)) : 1;
  const from = (page - 1) * size;
  return {
    items: rows.slice(from, from + size),
    page,
    totalPages,
    totalItems,
    start: totalItems ? from + 1 : 0,
    end: Math.min(from + size, totalItems),
  };
}
