import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PROJECT_ONLY_ESTIMATED_PHP_PER_UNIT,
  PROJECT_ONLY_PRICE_CLASSIFICATION,
  estimateProjectSelectedSubjects,
  estimateProjectSnapshotSelection,
} from "./project-fee-estimate.mjs";

const readSource = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const pricesFor = (items) => [...new Set(items.map((item) =>
  item.code || item.subject_code))].map((subject_code) => ({
  subject_code,
  rate_per_unit: "100.00",
  classification: "SYNTHETIC_DEVELOPMENT_ONLY",
}));

test("fictional pricing is ₱100 per unit, distinct selected subjects only, never official billing", () => {
  const selected = [
    { code: "P8-101", units: 3, section: "IT-A", meetings: [{ day: 1 }, { day: 3 }] },
    { code: "P8-102", units: 2, section: "IT-A", meetings: [{ day: 2 }] },
    { code: "P8-101", units: 3, section: "IT-A", meetings: [{ day: 5 }] },
  ];
  const original = structuredClone(selected);
  const estimate = estimateProjectSelectedSubjects(selected, pricesFor(selected));
  assert.equal(PROJECT_ONLY_ESTIMATED_PHP_PER_UNIT, 100);
  assert.equal(PROJECT_ONLY_PRICE_CLASSIFICATION, "SYNTHETIC_DEVELOPMENT_ONLY");
  assert.deepEqual(estimate, {
    classification: "PROJECT_ONLY_FICTIONAL_ESTIMATE",
    official: false,
    assessmentIssued: false,
    currency: "PHP",
    ratePerUnit: 100,
    priceSource: "academic_estimated_subject_prices",
    priceClassification: "SYNTHETIC_DEVELOPMENT_ONLY",
    subjectCount: 2,
    totalUnits: 5,
    estimatedAmount: 500,
    subjectCodes: ["P8-101", "P8-102"],
    subjects: [
      { code: "P8-101", name: "P8-101", units: 3, ratePerUnit: 100, estimatedFee: 300 },
      { code: "P8-102", name: "P8-102", units: 2, ratePerUnit: 100, estimatedFee: 200 },
    ],
  });
  assert.deepEqual(selected, original, "pricing must not mutate selected enrollment rows");
});

test("only eligible and scheduled Phase8 subjects are estimated for the proposed registration", () => {
  const snapshot = {
    project_only: true,
    verified_institutionally: false,
    schedule_validated_for_project: true,
    subjects: [
      { subject_code: "P8-101", academic_units: 3, eligibility: "ELIGIBLE" },
      { subject_code: "P8-102", academic_units: 2, eligibility: "RETAKE" },
      { subject_code: "P8-103", academic_units: 4, eligibility: "ELIGIBLE" }, // no registered timetable
      { subject_code: "P8-104", academic_units: 3, eligibility: "RESTRICTED" },
      { subject_code: "P8-105", academic_units: 2, eligibility: "NOT_OFFERED" },
    ],
    class_schedule: [
      { subject_code: "P8-101", day: 1, component: "Lecture" },
      { subject_code: "P8-101", day: 2, component: "Laboratory" },
      { subject_code: "P8-101", day: 3, component: "Lecture" },
      { subject_code: "P8-102", day: 4, component: "Laboratory" },
      { subject_code: "P8-104", day: 5, component: "Lecture" },
      { subject_code: "P8-105", day: 5, component: "Lecture" },
    ],
  };
  const approved = [snapshot.subjects[0], snapshot.subjects[1]];
  const priceRows = pricesFor(approved);
  const estimate = estimateProjectSnapshotSelection(snapshot, priceRows);
  assert.deepEqual(estimate.subjectCodes, ["P8-101", "P8-102"]);
  assert.equal(estimate.subjectCount, 2);
  assert.equal(estimate.totalUnits, 5);
  assert.equal(estimate.estimatedAmount, 500);
  // Weekly timetable frequency must not change the units/fee.
  snapshot.class_schedule.push({ subject_code: "P8-101", day: 5 });
  assert.deepEqual(estimateProjectSnapshotSelection(snapshot, priceRows), estimate);
});

test("invalid units and conflicting duplicates fail closed instead of silently billing zero", () => {
  for (const subjects of [
    [{ code: "A", units: null }],
    [{ code: "A", units: -1 }],
    [{ code: "A", units: Number.POSITIVE_INFINITY }],
    [{ code: "", units: 3 }],
    [{ code: "A", units: 2 }, { code: "A", units: 3 }],
  ]) {
    assert.throws(() => estimateProjectSelectedSubjects(subjects, pricesFor(subjects)));
  }
  assert.deepEqual(estimateProjectSelectedSubjects([], []).totalUnits, 0);
  assert.deepEqual(estimateProjectSelectedSubjects([], []).estimatedAmount, 0);
});

test("missing, malformed, unexpected, duplicate and mismatched ledger prices fail closed", () => {
  const subjects = [{ code: "A", name: "Sample A", units: 3 },
    { code: "B", name: "Sample B", units: 2 }];
  const valid = pricesFor(subjects);
  const invalid = [
    [],
    [valid[0]],
    [...valid, valid[0]],
    [...valid, { ...valid[0], subject_code: "UNSELECTED" }],
    [{ ...valid[0], rate_per_unit: "99.99" }, valid[1]],
    [{ ...valid[0], rate_per_unit: "0" }, valid[1]],
    [{ ...valid[0], rate_per_unit: null }, valid[1]],
    [{ ...valid[0], classification: "INSTITUTIONAL_OFFICIAL" }, valid[1]],
    [{ ...valid[0], classification: null }, valid[1]],
  ];
  for (const rates of invalid) {
    assert.throws(() => estimateProjectSelectedSubjects(subjects, rates),
      /invalid|unexpected|missing/i);
  }
  assert.throws(() => estimateProjectSelectedSubjects(subjects),
    /missing.*verified.*price/i);
  const estimate = estimateProjectSelectedSubjects(subjects, valid);
  assert.equal(estimate.estimatedAmount,
    estimate.subjects.reduce((sum, row) => sum + row.estimatedFee, 0));
});

test("demonstration estimate requires validated and explicitly noninstitutional source", () => {
  const good = {
    project_only: true, verified_institutionally: false,
    schedule_validated_for_project: true,
    subjects: [{ subject_code: "P8-A", academic_units: 3, eligibility: "ELIGIBLE" }],
    class_schedule: [{ subject_code: "P8-A", day: 1 }],
  };
  for (const forbidden of [
    { ...good, project_only: false },
    { ...good, verified_institutionally: true },
    { ...good, schedule_validated_for_project: false },
    { ...good, class_schedule: null },
    { ...good, subjects: null },
  ]) assert.throws(() => estimateProjectSnapshotSelection(forbidden), /validated fictional/i);
});

test("Student server price loader checks only selected codes against the actual pricing ledger", () => {
  const priceLoader = readSource("./project-fee-prices-server.js");
  assert.match(priceLoader, /import "server-only"/);
  assert.match(priceLoader, /selectedProjectSubjectCodes\(selectedSubjects\)/);
  assert.match(priceLoader, /admin\.from\("academic_estimated_subject_prices"\)/);
  assert.match(priceLoader, /\.select\("subject_code,rate_per_unit,classification"\)/);
  assert.match(priceLoader, /\.in\("subject_code", codes\)/);
  assert.match(priceLoader, /admin\.from\("academic_estimated_curriculum_rates"\)/);
  assert.match(priceLoader, /\.eq\("curriculum_code", curriculumCode\)/);
  assert.match(priceLoader, /overrideResult\.data\.length/);
  assert.match(priceLoader, /estimateProjectSelectedSubjects\(selectedSubjects, priceResult\.data\)/);
  assert.doesNotMatch(priceLoader, /ratePerUnit\s*:\s*100|rate_per_unit\s*\?\?\s*100/);
});

test("Student backend only: Enrollment and demo COR price from DB; official COR remains Registrar-gated", () => {
  const enrollment = readSource("./student-enrollment-server.js");
  const corAction = readSource("./student-portal-actions.js");
  const official = readSource("./student-academic-server.js");
  assert.match(enrollment, /const eligible = subjects\.filter\([\s\S]*?\["ELIGIBLE", "RETAKE"\]/);
  assert.match(enrollment, /Boolean\(item\.section\) && item\.meetings\.length > 0/);
  assert.match(enrollment, /estimateProjectSelectedSubjects\(eligible, priceRows\)/);
  assert.match(enrollment, /loadVerifiedProjectSubjectPrices\(/);
  assert.match(enrollment, /snapshotResult\.data\.curriculum_code, eligible/);
  assert.match(enrollment, /proposedUnits: projectFeeEstimate\.totalUnits/);
  assert.match(corAction, /simulation\?\.status !== "CONFIRMED_SIMULATION"/);
  assert.match(corAction, /project_phase8_demonstration_cor_v1/);
  assert.match(corAction, /result\.data\.official !== false/);
  assert.match(corAction, /certificate_of_official_registration !== false/);
  assert.match(corAction, /selectedProjectSnapshotSubjects\(result\.data\.student\)/);
  assert.match(corAction, /loadVerifiedProjectSubjectPrices\(/);
  assert.match(corAction, /estimateProjectSnapshotSelection\(result\.data\.student, prices\)/);
  assert.match(official, /\.eq\("status", "CONFIRMED"\)/);
  assert.match(official, /enrollments\?\.length && enrollments\[0\]\.confirmed_at/);
  assert.match(official, /cor\?\.official === true && cor\.schedule_complete === true/);
  assert.match(official, /cor\.ready_to_print === true && cor\.enrollment_id === enrollments\[0\]\.id/);
  assert.match(official, /Boolean\(cor\.confirmation_reference\) && Boolean\(cor\.confirmed_at\)/);
  for (const source of [enrollment, corAction, readSource("./project-fee-estimate.mjs")]) {
    assert.doesNotMatch(source, /INSERT INTO|createAdminClient\(/);
  }
});
