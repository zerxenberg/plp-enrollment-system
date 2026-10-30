// Run against an existing local Next.js dev server with:
// node scripts/test-block-planning-browser.cjs
// Uses an isolated browser context, so test demo edits never reach a user profile.
const assert = require("node:assert/strict");
const test = require("node:test");
const { chromium } = require("playwright-core");

const url = process.env.PLP_TEST_URL || "http://localhost:3000";
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// This script changes real block planning data. Only run when a dedicated
// authenticated test account and an explicitly approved test environment exist.
const runAuthenticated = process.env.PLP_RUN_AUTHENTICATED_BROWSER_TESTS === "1" &&
  Boolean(process.env.PLP_TEST_COORDINATOR_ID && process.env.PLP_TEST_COORDINATOR_PASSWORD);

if (!runAuthenticated) {
  test("Academic Coordinator browser smoke", {
    skip: "Requires explicit browser test opt-in and an authenticated Coordinator test account",
  }, () => {});
} else {
(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("#login-identity").fill(process.env.PLP_TEST_COORDINATOR_ID);
    await page.locator("#login-password").fill(process.env.PLP_TEST_COORDINATOR_PASSWORD);
    await page.waitForTimeout(500);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((next) => next.pathname.startsWith("/academic-coordinator/"), { timeout: 15000 });
    await page.goto(`${url}/academic-coordinator/sections-schedules`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Sections & Schedules" }).waitFor({ timeout: 20000 });
    const tabs = await page.getByRole("tab").allTextContents();
    assert.deepEqual(tabs.map((label) => label.trim()), ["Sections", "Class Schedule"]);
    async function checkFilterLayout(tabName) {
      for (const width of [1792, 1440, 1024, 768, 480, 390, 360]) {
        await page.setViewportSize({ width, height: 900 });
        const geometry = await page.locator(".block-filters").evaluate((toolbar) => {
          const area = toolbar.getBoundingClientRect();
          const controls = [...toolbar.children].map((element) => {
            const { left, right, top, bottom } = element.getBoundingClientRect();
            return { left, right, top, bottom };
          });
          return { left: area.left, right: area.right, controls };
        });
        assert.equal(geometry.controls.length, 7, `${tabName} ${width}px: expected search, five filters, and Clear Filters`);
        for (const [index, control] of geometry.controls.entries()) {
          assert.ok(control.left >= geometry.left - 1 && control.right <= geometry.right + 1,
            `${tabName} ${width}px: filter ${index + 1} overflows its toolbar`);
          for (const other of geometry.controls.slice(index + 1)) {
            const overlappingWidth = Math.min(control.right, other.right) - Math.max(control.left, other.left);
            const overlappingHeight = Math.min(control.bottom, other.bottom) - Math.max(control.top, other.top);
            assert.ok(overlappingWidth < 1 || overlappingHeight < 1,
              `${tabName} ${width}px: two filter controls overlap`);
          }
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await checkFilterLayout("Sections");
    assert.ok(await page.getByRole("button", { name: "Clear Filters" }).evaluate((button) => button.classList.contains("portal-button-ghost")));
    const search = page.locator(".block-filters .search-field input");
    const selectFilter = (label) => page.locator(".block-filters .select-field").filter({ hasText: label }).locator("select");
    await search.fill("no-matching-block-code");
    await selectFilter("Academic Term").selectOption("2026-27-2");
    await page.getByText("No block sections match your filters.").waitFor();
    await page.getByRole("button", { name: "Clear Filters" }).click();
    assert.equal(await search.inputValue(), "");
    assert.equal(await selectFilter("Academic Term").inputValue(), "ALL");
    assert.equal(await selectFilter("College").inputValue(), "ALL");
    await page.getByRole("button", { name: /Create Block Section/i }).click();
    await page.getByRole("dialog").waitFor();
    const createDialog = page.getByRole("dialog");
    const preview = createDialog.locator("input[readonly]");
    assert.match(await preview.inputValue(), /^[A-Z][A-Z0-9]*-[1-4][A-Z]$/);
    await createDialog.locator("label.field").filter({ hasText: "Academic Term" }).locator("select").selectOption("2026-27-2");
    await createDialog.locator("label.field").filter({ hasText: "Section Letter" }).locator("select").selectOption("C");
    assert.equal(await preview.inputValue(), "BSIT-1C");
    await createDialog.getByRole("button", { name: "Save Block" }).click();
    await page.getByText("Draft block section created", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Details" }).last().count();
    const createdRow = page.locator(".data-table tbody tr").filter({ hasText: "BSIT-1C" });
    assert.equal(await createdRow.count(), 1);
    await createdRow.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").locator("label.field").filter({ hasText: "Student Capacity" }).locator("input").fill("35");
    await page.getByRole("dialog").getByRole("button", { name: "Save Block" }).click();
    await page.getByText("Draft block section updated", { exact: false }).waitFor();
    await createdRow.getByRole("button", { name: "Details" }).click();
    await page.getByRole("dialog").getByText("35", { exact: true }).first().waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("tab", { name: "Class Schedule" }).click();
    await page.getByText("Class Schedule Planning").waitFor();
    await checkFilterLayout("Class Schedule");
    await search.fill("BSIT-3A");
    await selectFilter("Academic Term").selectOption("2026-27-2");
    await page.getByRole("button", { name: "Clear Filters" }).click();
    assert.equal(await search.inputValue(), "");
    assert.equal(await selectFilter("Academic Term").inputValue(), "ALL");
    assert.equal(await selectFilter("Status").inputValue(), "ALL");
    await page.getByRole("button", { name: /View Timetable/i }).click();
    await page.getByRole("dialog").waitFor();
    assert.ok((await page.getByRole("dialog").locator("tr").count()) > 1, "saved meeting rows appear in timetable");
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    assert.deepEqual(problems, [], `browser errors: ${problems.join(" / ")}`);
    await context.close();
    process.stdout.write("PASS: Both tab filter layouts at 1792–360px, clear filters, block editing, timetable, and browser runtime.\n");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`FAIL: Coordinator browser smoke: ${error.stack}\n`);
  process.exitCode = 1;
});
}
