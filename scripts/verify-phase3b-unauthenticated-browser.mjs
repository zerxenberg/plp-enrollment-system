// Browser smoke test of the real login page without synthetic sessions.
// No real credentials are used and no university record is changed.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.PLP_TEST_BASE_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHROME_EXECUTABLE ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath: chromePath });

try {
  for (const width of [390, 768, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const identifier = page.locator("#login-identity");
    const password = page.locator("#login-password");
    await identifier.waitFor();
    await page.waitForFunction(() => {
      const input = document.querySelector("#login-identity");
      return input && Object.keys(input).some((key) => key.startsWith("__reactProps$"));
    });
    assert.equal(await identifier.count(), 1, "University ID or email input missing");
    assert.equal(await password.count(), 1, "Password input missing");
    const doc = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    assert.ok(doc.content <= doc.viewport + 4,
      `Login has unexpected horizontal overflow at ${width}px: ${JSON.stringify(doc)}`);

    await page.getByRole("button", { name: /^login$/i }).click();
    await page.waitForFunction(() => document.querySelector("#login-identity")?.getAttribute("aria-invalid") === "true");
    assert.equal(await identifier.getAttribute("aria-invalid"), "true",
      "Empty identity must expose accessible validation");
    assert.equal(await password.getAttribute("aria-invalid"), "true",
      "Empty password must expose accessible validation");
    assert.deepEqual(errors, [], `Unexpected client exceptions at ${width}px`);
    console.log(`PASS unauthenticated login layout and validation at ${width}px`);
    await page.close();
  }
} finally {
  await browser.close();
}
