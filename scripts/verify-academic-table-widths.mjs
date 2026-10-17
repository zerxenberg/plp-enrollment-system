// Responsive QA for Academic Setup > Curriculum and Sections & Schedules > Sections.
// Run: node scripts/verify-academic-table-widths.mjs
// Optional: PLP_TEST_BASE_URL=http://127.0.0.1:3000 CHROME_EXECUTABLE=<path>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PLP_TEST_BASE_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHROME_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const account = JSON.parse(readFileSync(new URL("../src/data/mock/auth-accounts.json", import.meta.url), "utf8"))
  .find((entry) => entry.role === "academic-coordinator");
assert.ok(account, "Missing academic-coordinator demo account");
const widths = process.env.PLP_QA_ONLY_WIDTH ? [Number(process.env.PLP_QA_ONLY_WIDTH)] : [1280, 1366, 1440, 1920, 1024, 768, 390];
const views = [
  { name: "Curriculum", route: "/academic-coordinator/academic-setup?view=curriculum", root: ".academic-curriculum-table", table: ".academic-curriculum-grid", columns: 8 },
  { name: "Sections", route: "/academic-coordinator/sections-schedules?view=sections", root: ".block-section-table", table: ".block-section-table .data-table", columns: 7 },
];
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
let totalFailures = 0;

function fail(failures, description, details) {
  failures.push(details === undefined ? description : `${description}: ${JSON.stringify(details)}`);
}

async function diagnoseMobileOverflow(page) {
  return page.evaluate(() => {
    const selectors = [".academic-setup-tabs", ".academic-setup-tabs .tabs", ".academic-setup-tabs .tab-panel",
      ".portal-content", ".academic-filters", ".academic-curriculum-scroll", ".academic-curriculum-table",
      ".academic-list-heading", ".academic-curriculum-status-totals", ".academic-sort-control",
      ".academic-curriculum-grid", ".academic-curriculum-grid caption", ".academic-curriculum-grid thead",
      ".academic-curriculum-grid tbody", ".academic-curriculum-grid .sr-only"];
    const snapshot = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return { selector, missing: true };
      const r = node.getBoundingClientRect(), s = getComputedStyle(node);
      return { selector, x: +r.x.toFixed(1), right: +r.right.toFixed(1), rectWidth: +r.width.toFixed(1),
        clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, overflowX: s.overflowX,
        minWidth: s.minWidth, width: s.width, display: s.display, maxWidth: s.maxWidth };
    };
    const baseline = document.documentElement.scrollWidth;
    const hide = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const previous = node.style.display;
      node.style.display = "none";
      const width = document.documentElement.scrollWidth;
      node.style.display = previous;
      return width;
    };
    const toggle = (selector, property, value) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const old = node.style[property];
      node.style[property] = value;
      const width = document.documentElement.scrollWidth;
      node.style[property] = old;
      return width;
    };
    const hiddenSr = [...document.querySelectorAll(".academic-curriculum-grid .sr-only")].map((node) => {
      const r = node.getBoundingClientRect();
      return { text: node.textContent.slice(0, 80), left: +r.left.toFixed(1), right: +r.right.toFixed(1) };
    });
    for (const node of document.querySelectorAll(".academic-curriculum-grid .sr-only")) node.style.display = "none";
    const withoutSrOnly = document.documentElement.scrollWidth;
    for (const node of document.querySelectorAll(".academic-curriculum-grid .sr-only")) node.style.removeProperty("display");
    return { baseline, documentClient: document.documentElement.clientWidth, bodyClient: document.body.clientWidth,
      nodes: selectors.map(snapshot), hiddenSr: hiddenSr.slice(0, 30), withoutSrOnly,
      without: Object.fromEntries(selectors.map((selector) => [selector, hide(selector)])),
      overflowOverrides: {
        tabsHidden: toggle(".tabs", "overflowX", "hidden"),
        panelHidden: toggle(".tab-panel", "overflowX", "hidden"),
        contentHidden: toggle(".portal-content", "overflowX", "hidden"),
      },
    };
  });
}

async function measure(page, view, width) {
  return page.evaluate(({ name, rootSelector, tableSelector, viewport }) => {
    const root = document.querySelector(rootSelector);
    const table = document.querySelector(tableSelector);
    const scroller = root?.querySelector(".table-scroll");
    if (!root || !table || !scroller) return { missing: { root: !!root, table: !!table, scroller: !!scroller } };
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) };
    };
    const visible = (el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0 && !el.closest("tbody[hidden]");
    };
    const tableBounds = rect(table);
    const scrollBounds = rect(scroller);
    const headings = [...table.querySelectorAll("thead th")].map((node) => ({ text: node.innerText.trim(), bounds: rect(node) }));
    const bodyRows = [...table.querySelectorAll("tbody tr")].filter(visible);
    const overlaps = [];
    const badges = [];
    for (const badge of [...table.querySelectorAll(".status-badge")].filter(visible)) {
      const r = rect(badge);
      const cell = rect(badge.closest("td, th") || badge.parentElement);
      const textOverflow = badge.scrollWidth > badge.clientWidth + 2;
      const outsideCell = r.left < cell.left - 3 || r.right > cell.right + 3;
      const textRange = document.createRange();
      textRange.selectNodeContents(badge);
      const lineTops = [...textRange.getClientRects()].filter((part) => part.width > 1)
        .map((part) => Math.round(part.top));
      const isWrapped = new Set(lineTops).size > 1;
      if (textOverflow || outsideCell || isWrapped) {
        badges.push({ label: badge.innerText.trim(), textOverflow, outsideCell, isWrapped, r, cell });
      }
    }
    const allActions = [...table.querySelectorAll(".table-action")].filter(visible);
    for (const button of allActions) {
      const cell = button.closest("td, th");
      const bound = rect(button);
      const cellBound = rect(cell);
      if (bound.left < cellBound.left - 3 || bound.right > cellBound.right + 3 ||
          bound.top < cellBound.top - 3 || bound.bottom > cellBound.bottom + 3) {
        overlaps.push({ text: button.innerText.trim(), bound, cell: cellBound });
      }
    }
    const clipping = [];
    const textTargets = name === "Curriculum"
      ? ".academic-program-info-value, .academic-curriculum-version, .academic-load-summary-value, .academic-version-actions .table-action span"
      : ".block-section-identity-value, .block-section-capacity-item dt, .block-section-capacity-item dd, .block-section-code";
    for (const el of [...table.querySelectorAll(textTargets)].filter(visible)) {
      if (el.scrollWidth > el.clientWidth + 3 && getComputedStyle(el).overflowX !== "visible") {
        clipping.push({ text: el.innerText.trim(), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
    }
    const curriculumVersions = [...table.querySelectorAll(".academic-version-header-row")];
    const visibleSemesterRows = [...table.querySelectorAll(".academic-semester-row")].filter(visible);
    const yearCells = [...table.querySelectorAll(".academic-year-cell")].filter(visible);
    const sectionRows = [...table.querySelectorAll("tbody tr")].filter(visible);
    const overflowOffenders = viewport === 390 ? [...document.querySelectorAll("body *")].filter((node) => {
      if (node.closest(".table-scroll") || !visible(node)) return false;
      const r = node.getBoundingClientRect();
      return r.right > viewport + 4 && r.width > 0;
    }).slice(0, 16).map((node) => ({ tag: node.tagName.toLowerCase(), className: String(node.className || "").slice(0, 110),
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, bounds: rect(node) })) : [];
    const overflowDiagnostics = viewport === 390 ? [...document.querySelectorAll("body *")].filter((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.right > viewport + 5;
    }).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 14)
      .map((node) => ({ tag: node.tagName.toLowerCase(), className: String(node.className || "").slice(0, 100),
        insideScroller: !!node.closest(".table-scroll"), overflowX: getComputedStyle(node).overflowX,
        width: node.clientWidth, scrollWidth: node.scrollWidth, bounds: rect(node) })) : [];
    const overflowContainers = viewport === 390 ? [...document.querySelectorAll("body *")]
      .filter((node) => !node.closest(".table-scroll") && node.scrollWidth > node.clientWidth + 4 && node.clientWidth > 0)
      .sort((a, b) => (b.scrollWidth - b.clientWidth) - (a.scrollWidth - a.clientWidth))
      .slice(0, 18).map((node) => ({ tag: node.tagName.toLowerCase(), className: String(node.className || "").slice(0, 100),
        overflowX: getComputedStyle(node).overflowX, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, bounds: rect(node) })) : [];
    const sectionActionStates = name === "Sections" ? sectionRows.slice(0, 5).map((row) => ({
      block: row.querySelector(".block-section-code")?.textContent.trim(),
      cells: row.querySelectorAll(":scope > td").length,
      labels: [...row.querySelectorAll(".block-section-capacity-item dt")].map((el) => el.textContent.trim()),
      values: [...row.querySelectorAll(".block-section-capacity-item dd")].map((el) => el.textContent.trim()),
      actions: [...row.querySelectorAll(".table-action")].map((el) => ({ label: el.innerText.trim(), disabled: el.disabled })),
      badgeLabels: [...row.querySelectorAll(".status-badge")].map((el) => el.textContent.trim()),
      display: getComputedStyle(row).display,
    })) : [];
    return {
      width: viewport,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      root: rect(root), table: tableBounds, scroller: { ...scrollBounds, clientWidth: scroller.clientWidth, scrollWidth: scroller.scrollWidth, scrollable: scroller.scrollWidth > scroller.clientWidth + 2 },
      headings, visibleRows: bodyRows.length,
      overflowOffenders, overflowDiagnostics, overflowContainers,
      curriculum: name === "Curriculum" ? {
        versions: curriculumVersions.length,
        visibleSemesters: visibleSemesterRows.length,
        yearCells: yearCells.map((el) => ({ text: el.innerText.trim(), rowSpan: el.rowSpan, rowGroupRows: el.closest("tbody")?.querySelectorAll(".academic-semester-row").length })),
        parentColSpans: [...table.querySelectorAll(".academic-curriculum-parent-space")].map((el) => el.colSpan),
        detailColSpans: [...table.querySelectorAll(".academic-curriculum-detail-spacer")].slice(0, 5).map((el) => el.colSpan),
      } : undefined,
      sections: name === "Sections" ? { entries: sectionRows.length, cards: sectionActionStates, headersHidden: getComputedStyle(table.querySelector("thead")).position === "absolute" } : undefined,
      actions: allActions.length, overlappingActions: overlaps.slice(0, 8), clippedBadges: badges.slice(0, 8), clippedText: clipping.slice(0, 8),
    };
  }, { name: view.name, rootSelector: view.root, tableSelector: view.table, viewport: width });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserErrors = [];
  const diagnostics = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") diagnostics.push(`console:${message.type()}:${message.text().slice(0, 320)}`); });
  page.on("requestfailed", (request) => diagnostics.push(`requestfailed:${request.url().slice(0, 170)}:${request.failure()?.errorText}`));
  page.on("response", (response) => { if (response.status() >= 400) diagnostics.push(`http:${response.status()}:${response.url().slice(0, 170)}`); });
  await page.goto(baseUrl);
  await page.evaluate((identity) => localStorage.setItem("plp-demo-session", JSON.stringify(identity)), {
    role: account.role, name: account.name, identifier: account.identifier, redirect: account.redirect,
  });
  for (const view of views) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}${view.route}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator(view.table).waitFor({ state: "visible", timeout: 12000 });
    } catch (error) {
      const diagnostic = { url: page.url(), title: await page.title(), body: (await page.locator("body").innerText()).slice(0, 1600), browserErrors, diagnostics: diagnostics.slice(-30),
        browser: await page.evaluate(() => ({ readyState: document.readyState, scripts: document.scripts.length, session: localStorage.getItem("plp-demo-session") })) };
      throw new Error(`Could not open ${view.name}: ${JSON.stringify(diagnostic)}; ${error.message}`);
    }
    await page.evaluate(() => document.fonts.ready);
    for (const width of widths) {
      const failures = [];
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      const metrics = await measure(page, view, width);
      if (view.name === "Curriculum" && width === 390 && metrics.documentWidth > width + 3) {
        console.log(JSON.stringify({ view: view.name, interaction: "390px overflow diagnosis", diagnosis: await diagnoseMobileOverflow(page) }));
      }
      if (width === 1280 && process.env.PLP_QA_SCREENSHOT_DIR) {
        await page.evaluate((selector) => {
          const node = document.querySelector(selector);
          window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 140);
        }, view.root);
        const location = join(process.env.PLP_QA_SCREENSHOT_DIR, view.name === "Curriculum" ? "qa-academic-curriculum-1280.png" : "qa-academic-sections-1280.png");
        await page.screenshot({ path: location, fullPage: false });
        console.log(JSON.stringify({ view: view.name, screenshot: location }));
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      if (metrics.missing) {
        fail(failures, "Table markup missing", metrics.missing);
      } else {
        if (metrics.headings.length !== view.columns) fail(failures, "Unexpected heading count", metrics.headings.length);
        if (metrics.documentWidth > width + 3 || metrics.bodyWidth > width + 3) fail(failures, "Horizontal page overflow", { body: metrics.bodyWidth, document: metrics.documentWidth, width, offenders: metrics.overflowOffenders, overflowContainers: metrics.overflowContainers, deepestRight: metrics.overflowDiagnostics.slice(0, 2) });
        if (width >= 1280 && metrics.scroller.scrollable) fail(failures, "Desktop table requires horizontal scrolling", { scrollWidth: metrics.scroller.scrollWidth, clientWidth: metrics.scroller.clientWidth });
        if (metrics.overlappingActions.length) fail(failures, "Action button leaves its cell", metrics.overlappingActions);
        if (metrics.clippedBadges.length) fail(failures, "Clipped/wrapped status badges", metrics.clippedBadges);
        if (metrics.clippedText.length) fail(failures, "Overflowing important text", metrics.clippedText);
        if (view.name === "Curriculum") {
          if (metrics.curriculum.versions === 0) fail(failures, "No visible curriculum versions");
          if (metrics.curriculum.visibleSemesters === 0) fail(failures, "No visible semester rows");
          if (metrics.curriculum.parentColSpans.some((value) => value !== 3) ||
              metrics.curriculum.detailColSpans.some((value) => value !== 3)) fail(failures, "Curriculum colspan structure incorrect");
          if (metrics.curriculum.yearCells.some(({ rowSpan, rowGroupRows }) => rowSpan !== rowGroupRows)) fail(failures, "Curriculum year rowspan mismatch", metrics.curriculum.yearCells.filter(({ rowSpan, rowGroupRows }) => rowSpan !== rowGroupRows).slice(0, 4));
        } else {
          const cards = metrics.sections.cards;
          if (!cards.length) fail(failures, "No section rows rendered");
          for (const card of cards) {
            if (card.cells !== 7) fail(failures, `Wrong section cells for ${card.block}`, card.cells);
            if (card.labels.join("|") !== "Capacity|Proposed|Confirmed|Available") fail(failures, `Missing capacity labels for ${card.block}`, card.labels);
            if (card.actions.map(({ label }) => label).join("|") !== "Details|Edit|Roster|Transfer|Schedule") fail(failures, `Missing section actions for ${card.block}`, card.actions);
            if (card.badgeLabels.length !== 2) fail(failures, `Missing section statuses for ${card.block}`, card.badgeLabels);
          }
          if (width <= 1024 && !metrics.scroller.scrollable) fail(failures, "Mobile/tablet section table missing intended contained horizontal scrolling", metrics.scroller);
        }
      }
      const summary = {
        view: view.name, width, result: failures.length ? "FAIL" : "PASS",
        scroll: metrics.scroller && { content: metrics.scroller.scrollWidth, client: metrics.scroller.clientWidth },
        documentWidth: metrics.documentWidth, bodyWidth: metrics.bodyWidth,
        headingCount: metrics.headings?.length, visibleRows: metrics.visibleRows, actions: metrics.actions,
        curriculum: metrics.curriculum && { versions: metrics.curriculum.versions, visibleSemesters: metrics.curriculum.visibleSemesters, yearCells: metrics.curriculum.yearCells.length },
        sections: metrics.sections && { entries: metrics.sections.entries, cards: metrics.sections.cards },
        failures,
      };
      console.log(JSON.stringify(summary));
      totalFailures += failures.length;
    }
    if (view.name === "Curriculum") {
      await page.setViewportSize({ width: 1440, height: 900 });
      const toggle = page.locator(".academic-version-toggle").first();
      const before = await page.locator(".academic-semester-row:visible").count();
      await toggle.focus();
      await page.keyboard.press("Enter");
      const collapsed = await page.locator(".academic-semester-row:visible").count();
      const collapsedExpanded = await toggle.getAttribute("aria-expanded");
      await page.keyboard.press("Space");
      const restored = await page.locator(".academic-semester-row:visible").count();
      const restoredExpanded = await toggle.getAttribute("aria-expanded");
      const failures = [];
      if (!(collapsed < before && collapsedExpanded === "false")) fail(failures, "Curriculum Enter collapse failed", { before, collapsed, collapsedExpanded });
      if (!(restored === before && restoredExpanded === "true")) fail(failures, "Curriculum Space expansion failed", { before, restored, restoredExpanded });
      console.log(JSON.stringify({ view: view.name, interaction: "keyboard collapse/expand", result: failures.length ? "FAIL" : "PASS", before, collapsed, restored, failures }));
      totalFailures += failures.length;
    }
    if (view.name === "Sections") {
      await page.setViewportSize({ width: 1440, height: 900 });
      const failures = [];
      const exercised = [];
      for (const label of ["Details", "Edit", "Roster", "Transfer", "Schedule"]) {
        const buttons = page.locator(".block-section-table .table-action").filter({ hasText: label });
        const eligible = page.locator(".block-section-table .table-action:not(:disabled)").filter({ hasText: label });
        const total = await buttons.count();
        const available = await eligible.count();
        if (!total) {
          fail(failures, `Missing Section action ${label}`);
          continue;
        }
        if (!available) {
          exercised.push({ label, available: 0, total, outcome: "correctly disabled when ineligible" });
          continue;
        }
        try {
          await eligible.first().click();
          if (label === "Schedule") {
            const tab = page.getByRole("tab", { name: "Class Schedule", exact: true });
            await tab.waitFor({ state: "visible" });
            if (await tab.getAttribute("aria-selected") !== "true") fail(failures, "Schedule action did not activate Class Schedule tab");
            await page.getByRole("tab", { name: "Sections", exact: true }).click();
            await page.locator(view.table).waitFor({ state: "visible" });
          } else {
            const dialog = page.getByRole("dialog");
            await dialog.waitFor({ state: "visible" });
            await dialog.getByRole("button", { name: label === "Edit" || label === "Transfer" ? "Cancel" : "Close", exact: true }).click();
            await dialog.waitFor({ state: "hidden" });
          }
          exercised.push({ label, available, total, outcome: "opened and returned" });
        } catch (error) {
          fail(failures, `Section action ${label} failed`, error.message.slice(0, 320));
          break;
        }
      }
      console.log(JSON.stringify({ view: view.name, interaction: "Section actions and disabled states", result: failures.length ? "FAIL" : "PASS", exercised, failures }));
      totalFailures += failures.length;
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const selectors = view.name === "Curriculum" ? [
        [".academic-curriculum-version", "AY 2026 to 2027 Revised International Curriculum Version B"],
        [".academic-program-department .academic-program-info-value", "College of Information and Communications Technology and Applied Sciences"],
        [".academic-program-code .academic-program-info-value", "Bachelor of Science in Information Technology"],
        [".academic-semester-cell", "Second Semester Academic Year 2026 to 2027"],
      ] : [
        [".block-section-code", "BSIT ADVANCED NETWORK SYSTEMS 2026 GROUP A"],
        [".block-section-identity-detail:nth-of-type(1) .block-section-identity-value", "College of Information and Communications Technology and Applied Sciences"],
        [".block-section-identity-detail:nth-of-type(2) .block-section-identity-value", "Bachelor of Science in Information Technology with Data Engineering Specialization"],
        [".block-section-table tbody tr:first-child td:nth-child(2)", "Second Semester Academic Year 2026 to 2027"],
        [".block-section-table tbody tr:first-child td:nth-child(3)", "BSIT Revised Curriculum 2026 to 2027 International Version"],
      ];
      const originals = await page.evaluate((pairs) => pairs.map(([selector, next]) => {
        const el = document.querySelector(selector);
        const old = el?.textContent;
        if (el) el.textContent = next;
        return { selector, old: old ?? null };
      }), selectors);
      const metrics = await measure(page, view, width);
      await page.evaluate((entries) => entries.forEach(({ selector, old }) => {
        const el = document.querySelector(selector);
        if (el && old !== null) el.textContent = old;
      }), originals);
      const failures = [];
      if (originals.some(({ old }) => old === null)) fail(failures, "Long-text stress targets missing", originals.filter(({ old }) => old === null));
      if (metrics.documentWidth > width + 3) fail(failures, "Long-text page overflow", { documentWidth: metrics.documentWidth, width, offenders: metrics.overflowOffenders });
      if (width >= 1280 && metrics.scroller.scrollable) fail(failures, "Long-text desktop table scroll", metrics.scroller);
      if (metrics.overlappingActions.length) fail(failures, "Long-text action exceeds cell", metrics.overlappingActions);
      if (metrics.clippedBadges.length) fail(failures, "Long-text status badge clipped", metrics.clippedBadges);
      if (metrics.clippedText.length) fail(failures, "Long-text labels clipped", metrics.clippedText);
      console.log(JSON.stringify({ view: view.name, interaction: "long-text stress", width, result: failures.length ? "FAIL" : "PASS",
        scroll: { content: metrics.scroller.scrollWidth, client: metrics.scroller.clientWidth },
        documentWidth: metrics.documentWidth, failures }));
      totalFailures += failures.length;
    }
  }
  if (browserErrors.length) {
    console.log(JSON.stringify({ result: "FAIL", browserErrors }));
    totalFailures += browserErrors.length;
  }
  console.log(`ACADEMIC_TABLE_WIDTHS ${totalFailures ? "FAIL" : "PASS"} ${totalFailures} failure(s)`);
} finally {
  await browser.close();
}
if (totalFailures) process.exitCode = 1;
