import "server-only";

function escapePdf(value) {
  return String(value ?? "Not available")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll(/[^\x20-\x7E]/g, "?");
}

function wrap(text, max = 88) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function buildProjectCorPdf(cor) {
  const student = cor?.student || {};
  const subjects = student.subjects || [];
  const schedule = student.class_schedule || [];
  const pages = [];
  let current = [];

  function add(text, size = 10, indent = 0) {
    for (const line of wrap(text, Math.max(30, 92 - indent))) {
      current.push({ text: line, size, indent });
      if (current.length >= 49) {
        pages.push(current);
        current = [];
      }
    }
  }

  add("PAMANTASAN NG LUNGSOD NG PASIG", 11);
  add("Certificate of Registration", 18);
  add("Project demonstration. Not an official PLP enrollment record.", 7);
  add("", 8);
  add(`Student Name: ${student.student_name ?? "Not available"}`, 10);
  add(`Student ID: ${student.student_number ?? "Not available"}`, 10);
  add(`Program: ${student.program_code ?? "Not available"}`, 10);
  add(`Curriculum: ${student.curriculum_code ?? "Not available"}`, 10);
  add(`Year Level: ${student.year_level ?? "Not available"}`, 10);
  add(`Academic Term: ${student.term_id ?? "Not available"}`, 10);
  add(`Home Block: ${student.home_block ?? "Not available"}`, 10);
  add(`Simulation Reference: ${cor?.simulation_id ?? "Not available"}`, 10);
  add(`Registration Status: ${cor?.registration_status ?? "Not available"}`, 10);
  add(`Confirmed At: ${cor?.confirmed_at ?? "Not available"}`, 10);
  add("", 8);
  add("Registered Subjects", 13);
  if (!subjects.length) add("No registered subject data is available.", 9);
  subjects.forEach((item) => add(`${item.subject_code ?? "Not available"} | ${item.subject_name ?? "Not available"} | Units: ${item.academic_units ?? "Not available"} | Eligibility: ${item.eligibility ?? "Not available"}`, 9));
  add("", 8);
  add("Class Schedule", 13);
  if (!schedule.length) add("No class schedule data is available.", 9);
  schedule.forEach((item) => add(`${item.subject_code ?? "Not available"} | Day ${item.day ?? item.day_of_week ?? "Not available"} | ${item.start_time ?? "Not available"} to ${item.end_time ?? "Not available"} | ${item.room ?? "Not available"} | ${item.instructor ?? "Not available"}`, 9));
  add("", 8);
  add("This document is generated from the protected PROJECT_ONLY enrollment simulation lifecycle. It does not certify official institutional enrollment.", 7);
  if (current.length) pages.push(current);

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  const contentIds = [];

  for (const pageLines of pages) {
    let y = 760;
    const commands = ["BT"];
    for (const item of pageLines) {
      const font = item.size >= 13 || item.text === "PAMANTASAN NG LUNGSOD NG PASIG" ? "/F2" : "/F1";
      commands.push(`${font} ${item.size} Tf`);
      commands.push(`1 0 0 1 ${54 + item.indent * 8} ${y} Tm`);
      commands.push(`(${escapePdf(item.text)}) Tj`);
      y -= item.size + 5;
    }
    commands.push("ET");
    const stream = commands.join("\n");
    contentIds.push(addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`));
    pageIds.push(null);
  }

  const pagesId = objects.length + pages.length + 1;
  for (let index = 0; index < pages.length; index += 1) {
    pageIds[index] = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`);
  }
  const actualPagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
