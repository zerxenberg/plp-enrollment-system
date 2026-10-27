const compact = (value) => String(value ?? "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "");

function semesterPart(value) {
  const text = String(value ?? "").trim();
  if (/^(first|1st|1)(?:\s*(?:sem(?:ester)?))?$/i.test(text) ||
      /^(?:sem(?:ester)?\s*)1$/i.test(text)) return "1stSem";
  if (/^(second|2nd|2)(?:\s*(?:sem(?:ester)?))?$/i.test(text) ||
      /^(?:sem(?:ester)?\s*)2$/i.test(text)) return "2ndSem";
  if (/^(third|3rd|3)(?:\s*(?:sem(?:ester)?))?$/i.test(text) ||
      /^(?:sem(?:ester)?\s*)3$/i.test(text)) return "3rdSem";
  if (/^(summer|midyear|mid-year)(?:\s*(?:sem(?:ester)?|term))?$/i.test(text)) return "Summer";
  return compact(text);
}

export function corPdfFilename(record) {
  const unavailable = (value) => !value || /^not recorded$/i.test(String(value).trim());
  if ([record?.studentNumber, record?.studentName, record?.academicYear,
    record?.block, record?.semester].some(unavailable)) {
    throw new Error("Verified student and academic term details are required for the COR filename.");
  }
  const studentNumber = String(record?.studentNumber ?? "").trim()
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const studentName = compact(record?.studentName);
  const years = String(record?.academicYear ?? "").match(/\b(?:19|20)\d{2}\b/g) ?? [];
  const block = compact(record?.block);
  const semester = semesterPart(record?.semester);
  if (!studentNumber || !studentName || years.length !== 2 || !block || !semester) {
    throw new Error("Verified student and academic term details are required for the COR filename.");
  }
  return `COR_${studentNumber}_${studentName}_AY${years[0]}_${years[1]}_${block}_${semester}.pdf`;
}

// An object URL has no filename. Retain the verified server Content-Disposition
// for the in-app download, instead of giving every Student the same generic name.
export function corFilenameFromDisposition(header) {
  const match = /(?:^|;)\s*filename="(COR_[A-Za-z0-9_]+\.pdf)"/i.exec(header ?? "");
  return match?.[1] ?? null;
}
