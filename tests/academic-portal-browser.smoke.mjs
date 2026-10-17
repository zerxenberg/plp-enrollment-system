// Run with an existing Next dev server: node tests/academic-portal-browser.smoke.mjs
// Uses an isolated headless browser and demo credentials from the local fixture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const accounts = JSON.parse(readFileSync(path.join(root, "src/data/mock/auth-accounts.json"), "utf8"));
const coordinator = accounts.find((account) => account.role === "academic-coordinator");
const server = process.env.PLP_BASE_URL || "http://localhost:3000";
const executablePath = process.env.CHROME_BINARY || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await context.addInitScript((account) => {
    localStorage.setItem("plp-demo-session", JSON.stringify({
      role: account.role, name: account.name,
      identifier: account.identifier, redirect: account.redirect,
    }));
  }, coordinator);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(server + "/academic-coordinator/academic-review");
  await page.getByRole("heading", { name: "Academic Review", exact: true }).waitFor();
  assert.equal(await page.getByRole("tab").count(), 2, "Academic Review has two primary tabs");
  const reviewButton = page.getByRole("button", { name: "Review Case" }).first();
  await reviewButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.y < 860, "review modal opens in viewport");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "modal locks page scrolling");
  await page.getByLabel("Decision Reason (required)").fill("Academic requirement verified for this enrollment only.");
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Discard Unsaved Academic Decision?" }).waitFor();
  await page.getByRole("button", { name: "Keep Editing" }).click();
  assert.match(await page.getByLabel("Decision Reason (required)").inputValue(), /requirement verified/);
  await page.getByRole("button", { name: "Approve Exception", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Approval" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden", "page scrolling restored");
  await page.getByRole("tab", { name: /Resolved Reviews/ }).click();
  await page.getByRole("button", { name: "View Details" }).first().click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /Approved/);
  await page.getByRole("button", { name: "Close" }).last().click();

  await page.goto(server + "/academic-coordinator/reports-monitoring");
  await page.getByRole("heading", { name: "Reports & Monitoring", exact: true }).waitFor();
  assert.equal(await page.getByRole("tab").count(), 2, "Reports has two primary tabs");
  const reportSelect = page.getByRole("combobox", { name: "Report Type" });
  assert.equal(await reportSelect.locator("option").count(), 5, "five consolidated reports");
  assert.equal(await reportSelect.inputValue(), "Program and Curriculum Summary", "default report is the program summary");
  await page.getByRole("columnheader", { name: "Curriculum Versions" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Generate & Preview" }).count(), 0, "manual generation removed");
  assert.equal(await page.locator(".academic-demo-note").count(), 0, "large demo note removed");
  assert.match(await page.locator(".academic-report-print").innerText(), /Demo Data/);
  const programSelect = page.getByRole("combobox", { name: "Program", exact: true });
  await programSelect.selectOption("BSIT");
  await reportSelect.selectOption({ label: "Enrollment Demand and Capacity" });
  assert.equal(await programSelect.inputValue(), "BSIT", "shared Program filter persists when report type changes");
  const reportPaging = page.getByRole("navigation", { name: "Academic reports pagination" });
  await page.getByRole("columnheader", { name: "Registrar Requests (Demo)" }).waitFor();
  assert.ok(await page.getByRole("table").count() > 0, "generated demand report includes results");
  await page.getByRole("button", { name: "Clear Filters" }).click();
  assert.equal(await reportSelect.inputValue(), "Enrollment Demand and Capacity", "Clear Filters keeps Report Type");
  assert.equal(await programSelect.inputValue(), "ALL", "Clear Filters resets Program");
  assert.equal(await page.getByRole("combobox", { name: "Academic Term" }).inputValue(), "ALL", "Clear Filters resets Term");
  await reportPaging.getByRole("button", { name: "Next" }).click();
  assert.match(await reportPaging.innerText(), /Page 2 of/);
  await programSelect.selectOption("BSIT");
  assert.match(await reportPaging.innerText(), /Page 1 of/, "changing filter resets to page 1");
  await programSelect.selectOption("ALL");
  const downloadPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV / Spreadsheet" }).click();
  const download = await downloadPending;
  assert.ok(download.suggestedFilename().endsWith(".csv"), "filtered report creates a CSV download");
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".portal-sidebar").evaluate((element) => getComputedStyle(element).display),
    "none", "print layout hides portal navigation");
  assert.equal(await page.locator(".academic-report-print").evaluate((element) => getComputedStyle(element).visibility),
    "visible", "print layout preserves generated report");
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "View Details" }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await reportSelect.selectOption({ label: "Schedule Monitoring" });
  await page.getByRole("columnheader", { name: "Schedule Status" }).waitFor();
  await reportSelect.selectOption({ label: "Subjects and Prerequisites" });
  await page.getByRole("columnheader", { name: "Prerequisites" }).waitFor();
  await page.getByRole("button", { name: "Clear Filters" }).click();
  await reportPaging.getByRole("button", { name: "Next" }).click();
  const reportSearch = page.getByRole("textbox", { name: "Search report" });
  await reportSearch.fill("not-a-valid-subject-xyz");
  await page.getByText("No records meet the current report filters.").waitFor();
  await page.getByRole("button", { name: "Clear Filters" }).click();
  assert.equal(await reportSearch.inputValue(), "", "search cleared");
  assert.match(await reportPaging.innerText(), /Page 1 of/, "Clear Filters resets pagination");
  await reportSelect.selectOption({ label: "Academic Review Summary" });
  await page.getByRole("columnheader", { name: "Total Cases" }).waitFor();
  await page.getByRole("tab", { name: "Academic Change History" }).click();
  await page.getByRole("columnheader", { name: "Academic Action" }).waitFor();
  await page.getByRole("button", { name: "View Details" }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close" }).last().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "View Details" }).first().click();
  const mobileDialog = await page.getByRole("dialog").boundingBox();
  assert.ok(mobileDialog && mobileDialog.x >= 0 && mobileDialog.x + mobileDialog.width <= 391,
    "detail dialog fits mobile viewport");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto(server + "/academic-coordinator/academic-setup");
  await page.getByRole("tab", { name: "Subjects", exact: true }).click();
  const subjectsPaging = page.getByRole("navigation", { name: "Academic subject table pagination" });
  await subjectsPaging.waitFor();
  assert.match(await subjectsPaging.innerText(), /Page 1 of/);
  const previousPage = subjectsPaging.getByRole("button", { name: "Previous" });
  const nextPage = subjectsPaging.getByRole("button", { name: "Next" });
  assert.equal(await previousPage.isDisabled(), true, "first-page Previous is disabled");
  const paginationStyle = await subjectsPaging.locator(".portal-table-pagination-summary").evaluate((element) => ({
    fontSize: getComputedStyle(element).fontSize,
    fontFamily: getComputedStyle(element).fontFamily,
  }));
  assert.equal(paginationStyle.fontSize, "14px", "pagination uses standardized readable type");
  assert.ok(paginationStyle.fontFamily, "pagination uses the portal font");
  await nextPage.click();
  assert.match(await subjectsPaging.innerText(), /Page 2 of/);
  const totalPageCount = Number((await subjectsPaging.innerText()).match(/Page \d+ of (\d+)/)?.[1]);
  assert.ok(totalPageCount > 2, "subject pagination has more than two pages");
  for (let index = 2; index < totalPageCount; index++) await nextPage.click();
  assert.match(await subjectsPaging.innerText(), new RegExp(`Page ${totalPageCount} of ${totalPageCount}`));
  assert.equal(await nextPage.isDisabled(), true, "last-page Next is disabled");
  assert.ok(await page.locator(".data-table tbody tr").count() <= 20, "last subject page uses the remaining records");
  assert.ok(await subjectsPaging.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 1;
  }), "shared pagination fits narrow viewport");
  assert.deepEqual(errors, [], "no uncaught browser page errors");
  await context.close();
  process.stdout.write("Academic Review and Reports browser smoke passed.\n");
} finally {
  await browser.close();
}
