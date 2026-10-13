// Run against a locally running Next.js instance. Exercises the actual demo UI.
// Explicit invocation keeps this browser scenario out of Node's unit test discovery.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = process.env.PLP_TEST_BASE_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHROME_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const accounts = JSON.parse(readFileSync(new URL("../src/data/mock/auth-accounts.json", import.meta.url), "utf8"));
const coordinator = accounts.find((entry) => entry.role === "academic-coordinator");
assert.ok(coordinator, "Missing Academic Coordinator demo identity");

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const rowFor = (version) => page.locator(".academic-curriculum-heading-group").filter({
  has: page.getByText(version, { exact: true }),
});
const statusOf = async (version) => (await rowFor(version).locator(".academic-curriculum-status").innerText()).trim();
const clickAction = async (version, action) => rowFor(version).getByRole("button", { name: action, exact: true }).click();
const confirmAction = async (action) => page.getByRole("dialog").getByRole("button", { name: `Confirm ${action}` }).click();

try {
  await page.goto(baseUrl);
  await page.evaluate((account) => localStorage.setItem("plp-demo-session", JSON.stringify({
    role: account.role, name: account.name, identifier: account.identifier, redirect: account.redirect,
  })), coordinator);
  await page.goto(`${baseUrl}/academic-coordinator/academic-setup?view=curriculum`);
  await page.getByRole("heading", { name: "Academic Setup", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("tab", { name: "Curriculum" }).click();

  const oldVersion = "BSIT Curriculum 2024";
  const copyVersion = `${oldVersion} Copy`;
  assert.equal(await statusOf(oldVersion), "Active");
  await clickAction(oldVersion, "Duplicate");
  await rowFor(copyVersion).waitFor();
  assert.equal(await statusOf(copyVersion), "Draft");

  await clickAction(copyVersion, "Activate");
  let modal = page.getByRole("dialog", { name: "Activate Curriculum Version" });
  await modal.waitFor();
  assert.ok((await modal.innerText()).includes(oldVersion));
  await modal.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await statusOf(copyVersion), "Draft", "Cancel must not change statuses");

  await clickAction(copyVersion, "Activate");
  await confirmAction("Activate");
  assert.equal(await statusOf(oldVersion), "Inactive");
  assert.equal(await statusOf(copyVersion), "Active");

  await clickAction(copyVersion, "Deactivate");
  modal = page.getByRole("dialog", { name: "Deactivate Curriculum Version" });
  assert.match(await modal.innerText(), /without an Active curriculum/);
  await confirmAction("Deactivate");
  assert.equal(await statusOf(copyVersion), "Inactive");

  await clickAction(copyVersion, "Archive");
  await confirmAction("Archive");
  assert.equal(await statusOf(copyVersion), "Archived");
  assert.equal(await rowFor(copyVersion).getByRole("button", { name: "Activate" }).count(), 0);

  await clickAction(copyVersion, "Restore");
  await confirmAction("Restore");
  assert.equal(await statusOf(copyVersion), "Inactive");

  await page.reload();
  await page.getByRole("tab", { name: "Curriculum" }).click();
  assert.equal(await statusOf(oldVersion), "Inactive");
  assert.equal(await statusOf(copyVersion), "Inactive");

  await clickAction(copyVersion, "History");
  const history = page.getByRole("dialog", { name: `Version History · ${copyVersion}` });
  await history.waitFor();
  const details = await history.innerText();
  assert.match(details, /Curriculum activated/);
  assert.match(details, /Curriculum archived/);
  assert.match(details, /Curriculum restored/);
  await history.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await clickAction(copyVersion, "Activate");
  modal = page.getByRole("dialog", { name: "Activate Curriculum Version" });
  const mobileDialog = await modal.boundingBox();
  assert.ok(mobileDialog && mobileDialog.x >= -1 && mobileDialog.x + mobileDialog.width <= 391,
    "Curriculum confirmation must fit within the mobile viewport");
  await modal.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await statusOf(copyVersion), "Inactive");
  assert.deepEqual(errors, [], "No browser runtime exceptions should occur");
  process.stdout.write("PASS: Curriculum lifecycle, switching, cancellation, archive/restore, history, persistence and mobile confirmation.\n");
} finally {
  await browser.close();
}
