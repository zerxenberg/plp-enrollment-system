// Run against the existing local development server:
// node tests/portal-cleanup.smoke.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const accounts = JSON.parse(readFileSync(path.join(root, "src/data/mock/auth-accounts.json"), "utf8"));
const base = process.env.PLP_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BINARY || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const routes = {
  "academic-coordinator": [
    "dashboard", "academic-setup", "sections-schedules", "reports-monitoring",
  ],
  registrar: [
    "dashboard", "academic-scheduling", "enrollment", "notifications",
    "profile", "reports-monitoring",
  ],
  student: ["dashboard", "class-schedule"],
  "system-administrator": ["dashboard", "audit-monitoring", "users-access"],
};

let visits = 0;
try {
  for (const [role, screens] of Object.entries(routes)) {
    const account = accounts.find((candidate) => candidate.role === role);
    assert.ok(account, `Missing demo login for ${role}`);
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await context.addInitScript((session) => {
      localStorage.setItem("plp-demo-session", JSON.stringify(session));
    }, {
      role: account.role, name: account.name, identifier: account.identifier,
      redirect: account.redirect,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const screen of screens) {
      await page.goto(`${base}/${role}/${screen}`);
      await page.locator("h1").first().waitFor();
      const heading = await page.locator("h1").first().textContent();
      assert.ok(heading?.trim(), `Missing page heading on ${role}/${screen}`);
      assert.deepEqual(errors, [], `Browser errors on ${role}/${screen}`);
      visits++;
    }
    await context.close();
  }
  process.stdout.write(`Role portal navigation smoke passed on ${visits} screens across four roles.\n`);
} finally {
  await browser.close();
}
