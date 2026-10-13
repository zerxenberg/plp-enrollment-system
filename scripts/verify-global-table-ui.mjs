// Run against a local Next.js instance to check the shared table styling across roles.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = process.env.PLP_TEST_BASE_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHROME_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const accounts = JSON.parse(readFileSync(new URL("../src/data/mock/auth-accounts.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ headless: true, executablePath: chromePath });

const routes = {
  "academic-coordinator": "/academic-coordinator/academic-setup?view=curriculum",
  student: "/student/academic-records",
  registrar: "/registrar/students",
  "system-administrator": "/system-administrator/users-access",
};

try {
  for (const [role, route] of Object.entries(routes)) {
    const account = accounts.find((entry) => entry.role === role);
    assert.ok(account, `Missing demo account for ${role}`);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl);
    await page.evaluate((identity) => localStorage.setItem("plp-demo-session", JSON.stringify(identity)), {
      role: account.role, name: account.name, identifier: account.identifier, redirect: account.redirect,
    });
    await page.goto(`${baseUrl}${route}`);
    if (role === "academic-coordinator") await page.getByRole("tab", { name: "Curriculum" }).click();
    if (role === "student") await page.getByRole("tab", { name: "Subject History" }).click();
    const table = page.locator(".data-table").first();
    await table.waitFor();
    if (role === "academic-coordinator") {
      assert.equal(await table.locator(".academic-version-header-row").count(), 16, "Expected 16 grouped curriculum versions");
      assert.equal(await table.locator(".academic-semester-row:visible").count(), 128, "Each configured semester should remain visible");
      assert.equal(await table.locator(".academic-year-cell[rowspan='2']").count(), 64, "Year labels should span their two configured semesters");
      if (process.env.PLP_TABLE_SCREENSHOT_PATH) await page.screenshot({ path: process.env.PLP_TABLE_SCREENSHOT_PATH });
    }

    const desktop = await page.evaluate(() => {
      const table = document.querySelector(".data-table");
      const heading = table.querySelector("thead th");
      const body = table.querySelector("tbody td");
      const action = table.querySelector(".table-action");
      const badge = table.querySelector(".status-badge");
      const styleOf = (element) => element && getComputedStyle(element);
      const actionCell = document.querySelector(".academic-version-header-row .academic-actions-cell");
      const buttons = [...(actionCell?.querySelectorAll(".table-action") || [])].map((button) => button.getBoundingClientRect());
      return {
        headerFont: styleOf(heading)?.fontSize,
        bodyFont: styleOf(body)?.fontSize,
        badgeFont: styleOf(badge)?.fontSize,
        actionFont: styleOf(action)?.fontSize,
        actionIconSize: styleOf(action?.querySelector("svg"))?.width,
        actionHeight: action?.getBoundingClientRect().height,
        actionCellWidth: actionCell?.getBoundingClientRect().width,
        actionButtons: buttons.map(({ width, height, top }) => ({ width, height, top })),
        allCentered: [...table.querySelectorAll("thead th, tbody td")].every((cell) => styleOf(cell).textAlign === "center"),
      };
    });
    assert.equal(desktop.headerFont, "10.336px", `Header size mismatch for ${role}`);
    assert.equal(desktop.bodyFont, role === "academic-coordinator" ? "10.64px" : "11.4px", `Body size mismatch for ${role}`);
    assert.ok(desktop.allCentered, `Cell alignment mismatch for ${role}`);
    if (desktop.actionFont) assert.equal(desktop.actionFont, "10.08px", `Action size mismatch for ${role}`);
    if (desktop.actionFont) assert.equal(desktop.actionIconSize, "13.5px", `Action icon size mismatch for ${role}`);
    if (role === "academic-coordinator") {
      assert.ok(desktop.actionButtons.every((button) => Math.abs(button.top - desktop.actionButtons[0].top) <= 2), "Parent actions must fit on one row");
      const firstToggle = page.locator(".academic-version-toggle").first();
      await firstToggle.focus();
      await page.keyboard.press("Enter");
      assert.equal(await firstToggle.getAttribute("aria-expanded"), "false", "Collapse should update aria-expanded");
      assert.equal(await table.locator(".academic-semester-row:visible").count(), 120, "Collapse should hide the matching semester rows");
      await page.keyboard.press("Space");
      assert.equal(await table.locator(".academic-semester-row:visible").count(), 128, "Keyboard expansion should restore all semester rows");
    }

    let mobile;
    for (const width of [1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      const viewport = await page.evaluate(() => ({
        documentWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        scroller: [...document.querySelectorAll(".table-scroll")].map((element) => ({ width: element.clientWidth, contentWidth: element.scrollWidth })),
      }));
      assert.ok(viewport.documentWidth <= viewport.viewportWidth + 4, `Page overflow at ${width}px in ${role}`);
      if (width <= 390) assert.ok(viewport.scroller.some((scroller) => scroller.contentWidth > scroller.width), `Wide tables must remain horizontally scrollable in ${role}`);
      if (width === 390) mobile = viewport;
      if (role === "academic-coordinator" && width === 390) {
        for (const label of ["View Curriculum", "History"]) {
          const button = table.locator(".academic-version-header-row").first().getByRole("button", { name: label });
          await button.scrollIntoViewIfNeeded();
          const visibleInScroller = await button.evaluate((element) => {
            const action = element.getBoundingClientRect();
            const container = element.closest(".table-scroll").getBoundingClientRect();
            return action.left >= container.left - 1 && action.right <= container.right + 1;
          });
          assert.ok(visibleInScroller, `${label} must be accessible by horizontal scrolling`);
        }
      }
    }
    assert.deepEqual(errors, [], `Browser exceptions in ${role}`);
    process.stdout.write(`${role}: ${JSON.stringify({ desktop, mobile })}\n`);
    await page.close();
  }
} finally {
  await browser.close();
}
