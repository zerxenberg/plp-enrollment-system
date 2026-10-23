// The checklist is derived only from confirmed historical subject attempts.
// Proposed block assignments and fictional grade histories are not evidence.
const key = (termId, studentId, subjectCode) => [termId, studentId, subjectCode].join("|");

export function buildConfirmedGradeBlocks({
  blocks = [], links = [], enrollments = [], enrollmentSubjects = [],
  students = [], subjects = [], terms = [], projectStudentIds = [],
}) {
  const projectIds = new Set(projectStudentIds);
  const studentById = new Map(students.map((student) => [student.id, student]));
  const subjectByCode = new Map(subjects.map((subject) => [subject.code, subject]));
  const termById = new Map(terms.map((term) => [term.id, term]));
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const sectionBlocks = new Map();
  for (const link of links) {
    if (!blockById.has(link.block_id)) continue;
    const entries = sectionBlocks.get(link.section_id) || new Set();
    entries.add(link.block_id);
    sectionBlocks.set(link.section_id, entries);
  }
  const byEnrollment = new Map();
  for (const row of enrollmentSubjects) {
    if (row.registration_status !== "CONFIRMED" || !row.section_id) continue;
    const rows = byEnrollment.get(row.enrollment_id) || [];
    rows.push(row);
    byEnrollment.set(row.enrollment_id, rows);
  }
  const result = new Map();
  for (const enrollment of enrollments) {
    if (enrollment.status !== "CONFIRMED" || projectIds.has(enrollment.student_id)) continue;
    const student = studentById.get(enrollment.student_id);
    if (student?.record_kind === "PROJECT_ONLY") continue;
    const registered = byEnrollment.get(enrollment.id) || [];
    if (!student?.student_number || !registered.length) continue;
    // A single block must contain every confirmed subject section for this
    // enrollment. Ambiguous or split rosters are deferred for human review.
    const common = registered.reduce((matches, row, index) => {
      const candidates = sectionBlocks.get(row.section_id) || new Set();
      return index ? new Set([...matches].filter((id) => candidates.has(id))) : new Set(candidates);
    }, new Set());
    const matched = [...common].filter((id) => {
      const block = blockById.get(id);
      return block?.term_id === enrollment.term_id && block.planning_status === "PUBLISHED";
    });
    if (matched.length !== 1) continue;
    const block = blockById.get(matched[0]);
    let output = result.get(block.id);
    if (!output) {
      output = {
        id: block.id, code: block.code, termId: block.term_id,
        termLabel: termById.get(block.term_id)?.label || block.term_id,
        programCode: block.program_code, subjects: [], attempts: [],
      };
      result.set(block.id, output);
    }
    for (const row of registered) {
      const attempt = {
        termId: enrollment.term_id, studentId: enrollment.student_id,
        studentNumber: student.student_number, studentName: student.full_name || "",
        subjectCode: row.subject_code, subjectName: subjectByCode.get(row.subject_code)?.name || row.subject_code,
        sectionId: row.section_id, sectionCode: row.section_code || "",
        enrollmentId: enrollment.id,
      };
      if (!output.attempts.some((item) => key(item.termId, item.studentId, item.subjectCode) ===
        key(attempt.termId, attempt.studentId, attempt.subjectCode))) output.attempts.push(attempt);
    }
  }
  return [...result.values()].map((block) => {
    const groups = new Map();
    for (const attempt of block.attempts) {
      const group = groups.get(attempt.subjectCode) || {
        code: attempt.subjectCode, name: attempt.subjectName, expected: [],
      };
      group.expected.push(attempt);
      groups.set(attempt.subjectCode, group);
    }
    return { ...block, subjects: [...groups.values()].sort((a, b) => a.code.localeCompare(b.code)) };
  }).sort((a, b) => a.termId.localeCompare(b.termId) || a.code.localeCompare(b.code));
}

export function evaluateBlockGradeChecklist(block, batches = [], officialResults = []) {
  if (!block) return {
    subjects: [], allVerified: false, allPublished: false, batchIds: [],
    missing: 0, errors: 0, verifiedAttempts: 0, requiredAttempts: 0, verifiedPercent: 0,
  };
  const expectedKeys = new Set(block.attempts.map((attempt) =>
    key(attempt.termId, attempt.studentId, attempt.subjectCode)));
  const published = new Set(officialResults.map((row) => key(row.term_id, row.student_id, row.subject_code)));
  const candidates = batches.filter((batch) => batch.term_id === block.termId &&
    block.subjects.some((subject) =>
      subject.code === batch.subject_code &&
      new Set(subject.expected.map((attempt) => attempt.sectionId)).size === 1 &&
      batch.section_id === subject.expected[0].sectionId) &&
    (batch.status === "VALIDATED" || batch.status === "PUBLISHED") &&
    Boolean(batch.verified_at) &&
    batch.verified_checksum_sha256 === batch.source_checksum &&
    (batch.rows || []).length === batch.row_count &&
    batch.rows.every((row) => expectedKeys.has(key(block.termId, row.student_id, row.subject_code)) &&
      row.subject_code === batch.subject_code && row.section_id === batch.section_id));
  const validRows = new Map();
  const duplicated = new Set();
  for (const batch of candidates) {
    for (const row of batch.rows || []) {
      const id = key(block.termId, row.student_id, row.subject_code);
      if (!expectedKeys.has(id) || row.validation_status !== (batch.status === "PUBLISHED" ? "PUBLISHED" : "VALID")) continue;
      if (validRows.has(id)) duplicated.add(id);
      else validRows.set(id, batch);
    }
  }
  const subjects = block.subjects.map((subject) => {
    let verified = 0; let missing = 0; let alreadyPublished = 0; let duplicates = 0;
    for (const attempt of subject.expected) {
      const id = key(attempt.termId, attempt.studentId, attempt.subjectCode);
      if (published.has(id)) alreadyPublished++;
      if (validRows.has(id)) verified++;
      else missing++;
      if (duplicated.has(id)) duplicates++;
    }
    return {
      ...subject, verified, missing, alreadyPublished, duplicates,
      status: duplicates ? "CONFLICT" :
        missing ? "INCOMPLETE" :
        alreadyPublished === subject.expected.length ? "PUBLISHED" :
        alreadyPublished ? "CONFLICT" : "VERIFIED",
    };
  });
  const missing = subjects.reduce((n, row) => n + row.missing, 0);
  const errors = subjects.reduce((n, row) => n + row.duplicates + (row.status === "CONFLICT" ? 1 : 0), 0);
  const requiredAttempts = block.attempts.length;
  const verifiedAttempts = requiredAttempts - missing;
  const verifiedPercent = requiredAttempts ? Math.round(verifiedAttempts * 100 / requiredAttempts) : 0;
  const allVerified = subjects.length > 0 && !missing && !errors &&
    !subjects.some((row) => row.alreadyPublished) &&
    [...validRows.values()].every((batch) => batch.status === "VALIDATED" &&
      batch.verified_checksum_sha256 === batch.source_checksum && batch.verified_at);
  const allPublished = subjects.length > 0 && subjects.every((row) => row.status === "PUBLISHED");
  return {
    subjects, missing, errors, allVerified, allPublished,
    verifiedAttempts, requiredAttempts, verifiedPercent,
    batchIds: [...new Set([...validRows.values()].filter((batch) => batch.status === "VALIDATED").map((batch) => batch.id))],
  };
}
