import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const accounts = JSON.parse(readFileSync(new URL("../src/data/mock/auth-accounts.json", import.meta.url), "utf8"));
const baseUrl = process.env.PLP_TEST_BASE_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHROME_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
page.on("requestfailed", (request) => runtimeErrors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
page.on("dialog", (dialog) => dialog.accept());

async function switchRole(role) {
  const account = accounts.find((item) => item.role === role);
  assert.ok(account, `Missing demo account for ${role}`);
  await page.goto(baseUrl);
  await page.evaluate((session) => localStorage.setItem("plp-demo-session", JSON.stringify(session)), {
    role: account.role, name: account.name, identifier: account.identifier, redirect: account.redirect,
  });
}

try {
  await switchRole("academic-coordinator");
  await page.goto(`${baseUrl}/academic-coordinator/academic-setup`);
  await page.waitForTimeout(2500);
  process.stdout.write(`Academic URL: ${page.url()} · ${(await page.locator("body").innerText()).slice(0, 330)}\n`);
  process.stdout.write(`Browser errors: ${JSON.stringify(runtimeErrors).slice(0, 1800)}\n`);
  await page.getByRole("heading", { name: "Academic Setup", exact: true }).waitFor({ timeout: 20000 });
  const actualTabs = await page.getByRole("tablist", { name: "Academic setup sections" }).getByRole("tab").allTextContents();
  assert.deepEqual(actualTabs.map((text) => text.trim()), ["Programs", "Subjects", "Curriculum"]);
  assert.equal(await page.getByText("Current Academic Term Reference").count(), 0);

  await page.getByRole("tab", { name: "Curriculum" }).click();
  const curriculumTable = page.locator(".academic-curriculum-table .data-table");
  await curriculumTable.waitFor();
  if (process.env.PLP_UI_SCREENSHOT_PATH) await page.screenshot({ path: process.env.PLP_UI_SCREENSHOT_PATH });
  const semesterRows = curriculumTable.locator(".academic-semester-row:visible");
  const versionRows = curriculumTable.locator(".academic-version-header-row");
  assert.equal(await versionRows.count(), 16, "The unfiltered table should render 16 curriculum groups");
  assert.equal(await semesterRows.count(), 128, "16 versions must show all 128 semester rows without filters");
  assert.equal(await curriculumTable.locator(".academic-year-cell[rowspan='2']").count(), 64, "Each curriculum year groups both semesters");
  const tableAlignment = await curriculumTable.evaluate((table) => {
    const cells = [...table.querySelectorAll("thead th, .academic-version-header-row > *, .academic-semester-row > *")];
    return cells.every((cell) => getComputedStyle(cell).textAlign === "center" && getComputedStyle(cell).verticalAlign === "middle");
  });
  assert.ok(tableAlignment, "All curriculum headers and cells should be centered");
  const actionLayout = await versionRows.first().locator(".academic-actions-cell").evaluate((cell) => {
    const bounds = cell.getBoundingClientRect();
    const buttons = [...cell.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
    return {
      compact: bounds.height <= 78,
      inBounds: buttons.every((button) => button.left >= bounds.left - 1 && button.right <= bounds.right + 1),
      singleRow: buttons.every((button) => Math.abs(buttons[0].top - button.top) <= 2),
    };
  });
  assert.deepEqual(actionLayout, { compact: true, inBounds: true, singleRow: true }, "CRUD actions should fit in one centered compact row");
  const firstToggle = page.locator(".academic-version-toggle").first();
  await firstToggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await firstToggle.getAttribute("aria-expanded"), "false");
  assert.equal(await semesterRows.count(), 120, "Collapsing a curriculum should hide only its eight semester rows");
  await page.keyboard.press("Space");
  assert.equal(await firstToggle.getAttribute("aria-expanded"), "true");
  assert.equal(await semesterRows.count(), 128, "Keyboard expansion should restore the same semester rows");
  await page.getByRole("combobox", { name: "Sort Curriculum Versions" }).selectOption("program");
  const sortedPrograms = await versionRows.locator("td:nth-child(3)").allTextContents();
  assert.deepEqual(sortedPrograms, [...sortedPrograms].sort((a, b) => a.localeCompare(b)), "Sorting by program should reorder complete groups");
  await page.getByRole("combobox", { name: "Sort Curriculum Versions" }).selectOption("version");
  await page.getByRole("button", { name: "View Subjects" }).first().click();
  let dialog = page.getByRole("dialog");
  assert.equal(await dialog.locator(".data-table tbody tr").count(), 5, "Each demo semester contains five subjects");
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();

  const filters = page.locator(".academic-filters");
  await filters.getByRole("combobox", { name: "College Department" }).selectOption("CBA");
  await filters.getByRole("combobox", { name: "Academic Program" }).selectOption("BSBA");
  await filters.getByRole("combobox", { name: "Major" }).selectOption("Marketing Management");
  assert.equal(await semesterRows.count(), 8, "Major filtering must select one complete curriculum");
  await page.getByRole("button", { name: "Clear Filters" }).click();
  assert.equal(await semesterRows.count(), 128, "Clearing filters must restore all versions");

  await page.getByRole("tab", { name: "Subjects" }).click();
  await page.getByRole("button", { name: "Add Subject", exact: true }).click();
  dialog = page.getByRole("dialog");
  const subjectModalSize = await dialog.boundingBox();
  assert.ok(subjectModalSize.width <= 910 && subjectModalSize.height <= 730, "Subject modal should be compact on desktop");
  await dialog.getByRole("textbox", { name: "Subject Code" }).fill("TEST999");
  await dialog.getByRole("textbox", { name: "Subject Name" }).fill("Demonstration Browser Test Subject");
  await dialog.getByRole("button", { name: "Save Subject" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByPlaceholder("Search by code, title or version").fill("TEST999");
  assert.ok(await page.getByText("Demonstration Browser Test Subject").isVisible());

  await page.getByRole("tab", { name: "Curriculum" }).click();
  await page.getByRole("button", { name: "Create Curriculum Version" }).click();
  dialog = page.getByRole("dialog");
  const curriculumModalSize = await dialog.boundingBox();
  assert.ok(curriculumModalSize.width <= 910 && curriculumModalSize.height <= 730, "Curriculum modal should be compact on desktop");
  assert.equal(await dialog.locator(".academic-semester-card").count(), 8);
  assert.equal(await dialog.locator(".academic-tuition-card").count(), 2);
  assert.equal(await dialog.getByRole("combobox", { name: "Year Level" }).count(), 0);
  assert.equal(await dialog.getByRole("combobox", { name: "Semester", exact: true }).count(), 0);
  const versionInput = dialog.getByRole("textbox", { name: "Curriculum Version" });
  await versionInput.fill("Browser Demo Test Curriculum 2027");
  assert.equal(await versionInput.inputValue(), "Browser Demo Test Curriculum 2027");
  const firstSemester = dialog.locator(".academic-semester-card").first();
  await firstSemester.getByRole("textbox", { name: "Search Compatible Subjects" }).fill("TEST999");
  await firstSemester.getByRole("checkbox", { name: /TEST999/ }).check();
  await firstSemester.getByRole("button", { name: "Add Selected Subjects" }).click();
  assert.ok(await dialog.getByText("Demonstration Browser Test Subject").isVisible());
  assert.equal(await firstSemester.locator(".data-table tbody tr").count(), 1);
  await dialog.getByRole("button", { name: "Save Draft" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByPlaceholder("Search by code, title or version").fill("Browser Demo Test Curriculum 2027");
  assert.equal(await semesterRows.count(), 8);
  await page.getByRole("button", { name: "Edit Draft" }).click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.locator(".academic-semester-card").count(), 8);
  assert.ok(await dialog.getByText("Demonstration Browser Test Subject").isVisible());
  await dialog.getByRole("combobox", { name: "Move TEST999 to semester" }).selectOption("1st Year|Second Semester");
  assert.equal(await dialog.locator(".academic-semester-card").first().locator(".data-table tbody tr").count(), 0);
  assert.equal(await dialog.locator(".academic-semester-card").nth(1).locator(".data-table tbody tr").count(), 1);
  assert.ok((await dialog.locator(".academic-tuition-card").nth(1).innerText()).includes("Second Semester"));
  await dialog.getByRole("button", { name: "Save Draft" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Validate" }).click();
  assert.ok(await page.getByText(/must include at least one subject before activation/).isVisible(), "Incomplete Draft must not validate");
  await page.getByRole("button", { name: "Activate" }).click();
  assert.ok(await page.getByText(/must include at least one subject before activation/).isVisible(), "Incomplete Draft must not activate");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  assert.equal(await semesterRows.count(), 16, "Duplicating creates a distinct Draft version with eight rows");
  await page.reload();
  await page.getByRole("tab", { name: "Curriculum" }).click();
  assert.equal(await semesterRows.count(), 144, "Created and duplicated versions should persist after reload");
  await filters.getByRole("combobox", { name: "College Department" }).selectOption("CCS");
  await filters.getByRole("combobox", { name: "Academic Program" }).selectOption("BSIT");
  const originalActive = page.locator(".academic-curriculum-table tbody tr").filter({ hasText: "BSIT Curriculum 2024" });
  await originalActive.getByRole("button", { name: "Duplicate", exact: true }).click();
  await originalActive.getByRole("button", { name: "Archive" }).click();
  const completeDraft = page.locator(".academic-curriculum-table tbody tr").filter({ hasText: "BSIT Curriculum 2024 Copy" });
  await completeDraft.getByRole("button", { name: "Activate" }).click();
  assert.ok(await page.getByText("Curriculum activate completed.").isVisible(), "A full duplicate can activate after archiving its original version");
  await page.getByRole("button", { name: "History" }).first().click();
  assert.ok(await page.getByRole("dialog").isVisible());
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();
  await page.getByRole("button", { name: "Clear Filters" }).click();
  await page.getByRole("button", { name: "Reset Demo Data" }).click();
  assert.equal(await semesterRows.count(), 128, "Reset Demo Data restores the 16 revised fixtures");
  // Existing browser storage can contain first-generation 24-assignment fixtures.
  // A pristine fixture should upgrade; a version with an edited fee must survive.
  await page.evaluate(() => {
    const key = "plp-demo-academic-setup-v1";
    const snapshot = JSON.parse(localStorage.getItem(key));
    const replaceWithOldDemo = (version, prefix, modified) => {
      const record = snapshot.academicCoordinatorData.curricula.find((item) => item.program === version);
      const years = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
      const semesters = ["First Semester", "Second Semester"];
      const originalTrack = Array.from({ length: 16 }, (_, index) => ({
        subjectCode: `${prefix}${String(index + 1).padStart(3, "0")}`,
        yearLevel: years[Math.floor(index / 4)],
        semester: semesters[Math.floor(index / 2) % 2],
        prerequisites: index >= 2 ? [`${prefix}${String(index - 1).padStart(3, "0")}`] : [],
        feePerUnit: modified && index === 0 ? 125 : 100,
      }));
      const general = Array.from({ length: 8 }, (_, index) => ({
        subjectCode: `GE${index + 101}`, yearLevel: years[Math.floor(index / 2)],
        semester: semesters[index % 2], prerequisites: [], feePerUnit: 100,
      }));
      record.assignments = [...originalTrack, ...general];
    };
    replaceWithOldDemo("BSIT", "IT", false);
    replaceWithOldDemo("BSA", "ACC", true);
    snapshot.fixtureVersion = 1;
    localStorage.setItem(key, JSON.stringify(snapshot));
  });
  await page.reload();
  await page.getByRole("tab", { name: "Curriculum" }).click();
  const migrated = await page.evaluate(() => {
    const curricula = JSON.parse(localStorage.getItem("plp-demo-academic-setup-v1")).academicCoordinatorData.curricula;
    return {
      clean: curricula.find((item) => item.program === "BSIT")?.assignments.length,
      edited: curricula.find((item) => item.program === "BSA")?.assignments.length,
    };
  });
  assert.deepEqual(migrated, { clean: 40, edited: 24 }, "Migration must upgrade pristine samples and preserve edited records");
  await page.getByRole("button", { name: "Reset Demo Data" }).click();
  assert.equal(await semesterRows.count(), 128);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  if (process.env.PLP_UI_SCREENSHOT_MOBILE_PATH) await page.screenshot({ path: process.env.PLP_UI_SCREENSHOT_MOBILE_PATH });
  const horizontalScroll = await page.locator(".academic-curriculum-scroll").evaluate((node) => ({ width: node.clientWidth, contentWidth: node.scrollWidth }));
  assert.ok(horizontalScroll.contentWidth > horizontalScroll.width, "Small screens should scroll inside the curriculum table");
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 394, "Curriculum table must not cause page level horizontal overflow");
  await page.locator(".academic-curriculum-scroll").evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  assert.ok(await page.getByRole("button", { name: "View Subjects" }).first().isVisible(), "Semester actions should remain accessible on mobile");
  await page.getByRole("button", { name: "Create Curriculum Version" }).click();
  const mobileDialog = page.getByRole("dialog");
  const mobileBox = await mobileDialog.boundingBox();
  const mobileFooter = await mobileDialog.locator(".modal-footer").boundingBox();
  assert.ok(mobileBox.x >= -1 && mobileBox.x + mobileBox.width <= 391 && mobileBox.height <= 844, "Mobile curriculum modal stays within viewport");
  assert.ok(mobileFooter.y >= 0 && mobileFooter.y + mobileFooter.height <= 844, "Save actions remain visible on mobile");
  assert.equal(await mobileDialog.locator(".academic-semester-card").count(), 8);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 394, "No page-level horizontal overflow on mobile");
  await page.keyboard.press("Escape");
  await mobileDialog.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 900 });

  await switchRole("registrar");
  await page.goto(`${baseUrl}/registrar/academic-scheduling`);
  assert.ok(await page.getByText("Academic Term & Enrollment Period").isVisible(), "Registrar retains academic term reference");
  await page.goto(`${baseUrl}/registrar/students`);
  await page.getByRole("heading", { name: "Students" }).waitFor({ timeout: 20000 });
  const academicFilters = page.getByRole("region", { name: "Student list academic filters" });
  await academicFilters.getByRole("combobox", { name: "College Department" }).selectOption("COE_EDUCATION");
  await academicFilters.getByRole("combobox", { name: "Program" }).selectOption("BSED");
  await academicFilters.getByRole("combobox", { name: "Major / Specialization" }).selectOption("Mathematics");
  assert.ok(await page.getByText(/of \d+ records match/).isVisible());
  const studentRows = await page.locator(".data-table tbody tr").allTextContents();
  assert.ok(studentRows.some((row) => row.includes("Demo Student")), "Expected demo students matching Mathematics");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.getByRole("region", { name: "Student list academic filters" }).isVisible(), "Academic filters should remain available on mobile");
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(documentWidth <= 394, `Unexpected horizontal page overflow on mobile: ${documentWidth}px`);
  await page.getByRole("tab", { name: "Official Grades Import" }).click();
  assert.ok(await page.getByText("Official Grades Import Demo").isVisible(), "Existing Registrar grade import must remain available");
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join("\n"));
  process.stdout.write("Academic Setup and Registrar filter browser smoke test passed.\n");
} finally {
  await browser.close();
}
