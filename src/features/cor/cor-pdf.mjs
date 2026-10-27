import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildVerifiedCorDocument } from "./cor-document.mjs";

// Based on PLP_Certificate_of_Registration_Template_Format.docx: A4 portrait,
// university/seal masthead, green title bar, two-column student particulars,
// seven-column registration grid, paired summary panels and certification.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const M = 18;
const CONTENT = PAGE_WIDTH - M * 2;
const GREEN = "#dbeedc";
const DARK = "#224733";
const LINE = "#778f82";
const INK = "#252f29";
const COLS = [80, 126, 32, 52, 120, 60, CONTENT - 470];
const HEADINGS = ["SUBJECT CODE", "SUBJECT NAME", "UNITS", "UNIT FEE", "SCHEDULE", "ROOM", "PROFESSOR"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SUMMARY_HEIGHT = 96;
const CERTIFICATION_HEIGHT = 116;
const SUMMARY_GAP = 8;
const SUMMARY_RESERVE = SUMMARY_GAP + SUMMARY_HEIGHT + SUMMARY_GAP + CERTIFICATION_HEIGHT;

export const COR_PAPER = Object.freeze({ size: "A4", orientation: "portrait" });

function dateLabel(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila",
    year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function peso(value) {
  return Number.isFinite(value)
    ? `PHP ${new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
    : "Not recorded";
}

function day(value) {
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    return DAYS[Number(value)] || String(value);
  }
  return String(value ?? "Not recorded");
}

function meetingText(meeting) {
  return `${day(meeting.day_of_week)} ${String(meeting.start_time).slice(0, 5)}–${String(meeting.end_time).slice(0, 5)}`;
}

function uniqueDetails(meetings, key) {
  const values = [...new Set(meetings.map((item) => String(item[key] || "").trim()).filter(Boolean))];
  return values.length ? values.join("\n") : "Not recorded";
}

function section(doc, y, text) {
  doc.save().rect(M, y, CONTENT, 22).fill(GREEN).restore();
  doc.fillColor(INK).font("Times-Bold").fontSize(10.4).text(text, M + 7, y + 5.5, {
    width: CONTENT - 14, lineBreak: false,
  });
  return y + 22;
}

function border(doc, x, y, width, height) {
  doc.save().lineWidth(0.6).strokeColor(LINE).rect(x, y, width, height).stroke().restore();
}

function smallField(doc, x, y, label, value, width) {
  doc.fillColor(INK).font("Helvetica").fontSize(8.3)
    .text(label, x, y, { width: 91, lineBreak: false });
  doc.text(":", x + 90, y, { width: 9, lineBreak: false });
  const text = String(value ?? "Not recorded");
  let size = text.length > 39 ? 6.7 : text.length > 29 ? 7.5 : 8.3;
  while (size > 5.2) {
    doc.font("Helvetica").fontSize(size);
    if (doc.heightOfString(text, { width: width - 105 }) <= 22) break;
    size -= 0.3;
  }
  doc.font("Helvetica").fontSize(size).text(text, x + 101, y - 0.2, {
    width: width - 105, height: 23,
  });
  doc.save().moveTo(x + 100, y + 15).lineTo(x + width - 6, y + 15)
    .lineWidth(0.4).strokeColor("#9cafa2").stroke().restore();
}

function drawMasthead(doc) {
  const plp = join(process.cwd(), "public", "assets", "images", "plp_logo.png");
  const pasig = join(process.cwd(), "public", "assets", "images", "cor_pasig_seal_highres.png");
  if (existsSync(plp)) doc.image(plp, 29, 14, { fit: [74, 74], align: "center", valign: "center" });
  if (existsSync(pasig)) doc.image(pasig, PAGE_WIDTH - 100, 15, {
    fit: [73, 73], align: "center", valign: "center",
  });
  doc.fillColor(INK).font("Times-Bold").fontSize(10)
    .text("C i t y   G o v e r n m e n t   o f   P a s i g", 102, 26,
      { width: PAGE_WIDTH - 204, align: "center" });
  doc.fillColor(DARK).font("Times-Bold").fontSize(15.1)
    .text("PAMANTASAN NG LUNGSOD NG PASIG", 95, 46,
      { width: PAGE_WIDTH - 190, align: "center", lineBreak: false });
  doc.fillColor(INK).font("Times-Bold").fontSize(8.3)
    .text("Alkalde Jose St., Kapasigan, Pasig City, Philippines 1600", 105, 70,
      { width: PAGE_WIDTH - 210, align: "center" });
  doc.moveTo(M, 97).lineTo(PAGE_WIDTH - M, 97).lineWidth(1).strokeColor("#56816c").stroke();
}

function drawFirstPage(doc, record) {
  drawMasthead(doc);
  doc.save().rect(M, 106, CONTENT, 69).fill(GREEN).restore();
  doc.fillColor("#101c13").font("Times-Bold").fontSize(19)
    .text("C E R T I F I C A T E   O F   R E G I S T R A T I O N", M + 15, 116, {
      width: CONTENT - 30, align: "center", lineBreak: false,
    });
  if (record.project) {
    doc.fillColor("#803c18").font("Helvetica-Bold").fontSize(8.5)
      .text("PROJECT_ONLY DEMONSTRATION  |  NOT AN OFFICIAL UNIVERSITY RECORD",
        M + 30, 143, { width: CONTENT - 60, align: "center", lineBreak: false });
  }
  doc.fillColor(INK).font("Times-Bold").fontSize(9.4)
    .text(`ACADEMIC YEAR: ${record.academicYear}`, M + 54, record.project ? 160 : 151,
      { width: CONTENT / 2 - 42, align: "center", lineBreak: false })
    .text("|", PAGE_WIDTH / 2 - 2, record.project ? 160 : 151, { width: 10 })
    .text(`SEMESTER: ${record.semester}`, PAGE_WIDTH / 2 + 20, record.project ? 160 : 151,
      { width: CONTENT / 2 - 39, align: "center", lineBreak: false });
  const y = 187;
  section(doc, y, "STUDENT INFORMATION");
  border(doc, M, y + 22, CONTENT, 114);
  const x1 = M + 8;
  const x2 = PAGE_WIDTH / 2 + 7;
  const width = CONTENT / 2 - 17;
  [
    ["Student Number", record.studentNumber, "Section", record.block],
    ["Full Name", record.studentName, "Enrollment Status", record.status],
    ["Program / Course", record.program, "Registration Date", dateLabel(record.confirmedAt)],
    ["Year Level", record.yearLevel, "", ""],
  ].forEach((line, i) => {
    smallField(doc, x1, y + 32 + i * 26, line[0], line[1], width);
    if (line[2]) smallField(doc, x2, y + 32 + i * 26, line[2], line[3], width);
  });
  return 329;
}

function tableHeading(doc, y) {
  y = section(doc, y, "REGISTERED SUBJECTS");
  let x = M;
  doc.save().rect(M, y, CONTENT, 22).fill("#edf6ef").restore();
  COLS.forEach((width, i) => {
    border(doc, x, y, width, 22);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(6.8)
      .text(HEADINGS[i], x + 3, y + 7, { width: width - 6, align: i === 2 ? "center" : "left" });
    x += width;
  });
  return y + 22;
}

function rowCells(record) {
  return [
    record.displayCode || record.code, record.name, String(record.units),
    Number.isFinite(record.unitFee) ? peso(record.unitFee) : "Not recorded",
    record.meetings.map(meetingText).join("\n"),
    uniqueDetails(record.meetings, "room"),
    uniqueDetails(record.meetings, "professor"),
  ];
}

function rowHeight(doc, cells) {
  return Math.max(25, ...cells.map((item, i) => {
    const size = i === 0 ? 6.2 : 6.65;
    doc.font("Helvetica").fontSize(size);
    return doc.heightOfString(item, { width: COLS[i] - 7, lineGap: 0 }) + 5;
  }));
}

function drawRow(doc, y, cells, height) {
  let x = M;
  cells.forEach((value, i) => {
    border(doc, x, y, COLS[i], height);
    doc.fillColor(INK).font("Helvetica").fontSize(i === 0 ? 6.2 : 6.65)
      .text(value, x + 3.5, y + 2.5, {
        width: COLS[i] - 7, height: height - 4,
        align: i === 2 ? "center" : "left",
      });
    x += COLS[i];
  });
}

function nextPage(doc, record) {
  doc.addPage();
  doc.fillColor(DARK).font("Times-Bold").fontSize(14)
    .text("CERTIFICATE OF REGISTRATION", M, 25, {
      width: CONTENT, align: "center",
    });
  doc.fillColor(INK).font("Helvetica").fontSize(8.5)
    .text(`${record.studentName}  |  ${record.studentNumber}  |  ${record.academicYear}, ${record.semester}`,
      M, 51, { width: CONTENT, align: "center" });
  return tableHeading(doc, 78);
}

function fieldLine(doc, x, y, label, value, width) {
  doc.font("Helvetica").fillColor(INK).fontSize(8.3)
    .text(label, x + 9, y, { width: width * 0.54, lineBreak: false })
    .text(":", x + width * 0.53, y, { width: 7 });
  const val = String(value);
  doc.font("Helvetica").fontSize(val.length > 27 ? 6.2 : 8.3)
    .text(val, x + width * 0.57, y, { width: width * 0.4, height: 21 });
}

function drawSummaryAndCertification(doc, record, y) {
  const gap = 8;
  const panelW = (CONTENT - gap) / 2;
  doc.save().rect(M, y, panelW, 22).fill(GREEN)
    .rect(M + panelW + gap, y, panelW, 22).fill(GREEN).restore();
  doc.fillColor(INK).font("Times-Bold").fontSize(10.4)
    .text("REGISTRATION SUMMARY", M + 7, y + 5.5, { width: panelW - 14 })
    .text("OTHER INFORMATION", M + panelW + gap + 7, y + 5.5, { width: panelW - 14 });
  border(doc, M, y, panelW, SUMMARY_HEIGHT);
  border(doc, M + panelW + gap, y, panelW, SUMMARY_HEIGHT);
  const left = [
    ["Total Registered Subjects", record.subjects.length],
    ["Total Academic Units", record.totalUnits],
    ["Registration Status", record.status],
    ["Date of Registration", dateLabel(record.confirmedAt)],
  ];
  const right = [
    ["Registration Reference No.", record.reference],
    ["Remarks", record.remarks],
    [record.project ? "Total Unit Fee (Estimate)" : "Total Unit Fee", peso(record.totalFee)],
  ];
  left.forEach(([name, value], i) => fieldLine(doc, M, y + 29 + i * 17, name, value, panelW));
  right.forEach(([name, value], i) => fieldLine(doc, M + panelW + gap, y + 29 + i * 22, name, value, panelW));
  y += SUMMARY_HEIGHT + SUMMARY_GAP;
  section(doc, y, "CERTIFICATION");
  border(doc, M, y, CONTENT, CERTIFICATION_HEIGHT);
  const wording = record.project
    ? "This document records a confirmed classroom enrollment simulation for the specified academic term. It is NOT an official certificate of university enrollment."
    : "This is to certify that the above student is officially enrolled for the specified academic term.";
  doc.fillColor(INK).font("Helvetica").fontSize(9)
    .text(wording, M + 10, y + 35, { width: CONTENT - 20 });
  const sigY = y + 78;
  const registrarX = PAGE_WIDTH / 2 + 35;
  const signatureWidth = 210;
  if (record.project && record.confirmedBy !== "Not recorded") {
    // The confirmed actor is already verified by the protected COR reader.
    // Keep that name centered above the Registrar line, never over the wording.
    const registrarName = String(record.confirmedBy).trim();
    let nameSize = 8.8;
    doc.font("Helvetica-Bold").fontSize(nameSize).fillColor(DARK);
    while (doc.widthOfString(registrarName) > signatureWidth - 10 && nameSize > 6.5) {
      nameSize = Math.max(6.5, nameSize - 0.3);
      doc.fontSize(nameSize);
    }
    doc.text(registrarName, registrarX, sigY - 15.5, {
      width: signatureWidth, height: 12, align: "center", lineBreak: false, ellipsis: true,
    });
  }
  [[M + 42, "STUDENT SIGNATURE"], [registrarX, "UNIVERSITY REGISTRAR"]].forEach(([x, label]) => {
    doc.moveTo(x, sigY).lineTo(x + signatureWidth, sigY).strokeColor(LINE).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(8.6)
      .text(label, x, sigY + 5, { width: signatureWidth, align: "center" });
  });
  doc.font("Helvetica").fontSize(7.8)
    .text("Date: ___________________", M + 55, sigY + 25)
    .text(`Date Issued: ${dateLabel(new Date().toISOString())}`, PAGE_WIDTH / 2 + 50, sigY + 25);
}

export async function renderVerifiedCorPdf(record) {
  const doc = new PDFDocument({
    size: COR_PAPER.size, layout: COR_PAPER.orientation, compress: true,
    bufferPages: true, margin: 0, info: {
      Title: record.project ? "PLP Demonstration Certificate of Registration" : "PLP Certificate of Registration",
      Subject: record.project ? "PROJECT_ONLY classroom demonstration" : "Verified confirmed registration",
      Creator: "PLP Enrollment System",
    },
  });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  let y = tableHeading(doc, drawFirstPage(doc, record));
  record.subjects.forEach((subject, index) => {
    const cells = rowCells(subject);
    const height = rowHeight(doc, cells);
    // Reserve the two bottom summary panels and certification on the last row.
    const after = index === record.subjects.length - 1 ? SUMMARY_RESERVE : 20;
    if (y + height + after > PAGE_HEIGHT - 19) y = nextPage(doc, record);
    drawRow(doc, y, cells, height);
    y += height;
  });
  if (y + SUMMARY_RESERVE > PAGE_HEIGHT - 18) {
    doc.addPage();
    y = 35;
  } else {
    y += SUMMARY_GAP;
  }
  drawSummaryAndCertification(doc, record, y);
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(6.8).fillColor("#63796c")
      .text(`PLP Enrollment System  |  ${record.project ? "PROJECT_ONLY DEMONSTRATION · NOT AN OFFICIAL RECORD" : "Verified Registration"}  |  Page ${i + 1} of ${pages.count}`,
        M, PAGE_HEIGHT - 13, { width: CONTENT, align: "center", lineBreak: false });
  }
  doc.end();
  return result;
}

export async function buildProjectCorPdf(cor, options = {}) {
  return renderVerifiedCorPdf(buildVerifiedCorDocument(cor, options));
}
