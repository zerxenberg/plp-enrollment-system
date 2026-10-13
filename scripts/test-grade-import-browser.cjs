// npm install --save-dev playwright-core
// Run against an already running local Next.js dev server.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright-core");

const origin = process.env.PLP_TEST_ORIGIN || "http://127.0.0.1:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function dropFiles(page, files) {
  const source = files.map(({ name, buffer, type }) => ({
    name,
    type: type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64: buffer.toString("base64"),
  }));
  await page.evaluate((uploads) => {
    const dropZone = document.querySelector('[aria-label="Drop an XLSX or CSV grade file here, or use Browse Files"]');
    if (!dropZone) throw new Error("Upload modal drop zone is unavailable");
    const transfer = new DataTransfer();
    for (const upload of uploads) {
      const bytes = Uint8Array.from(atob(upload.base64), (char) => char.charCodeAt(0));
      transfer.items.add(new File([bytes], upload.name, { type: upload.type }));
    }
    window.__plpTestTransfer = transfer;
    dropZone.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, source);
  await page.waitForFunction(() => {
    const dropZone = document.querySelector('[aria-label="Drop an XLSX or CSV grade file here, or use Browse Files"]');
    return dropZone && dropZone.className.includes("dragging");
  }, null, { timeout: 3000 });
  await page.evaluate(() => {
    const dropZone = document.querySelector('[aria-label="Drop an XLSX or CSV grade file here, or use Browse Files"]');
    const transfer = window.__plpTestTransfer;
    dropZone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    dropZone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    delete window.__plpTestTransfer;
  });
}

async function login(page, id, password, expected) {
  await page.goto(origin);
  // Wait for the client bundle to hydrate; an immediate click after HTML load
  // could otherwise submit the form as a native GET request.
  await page.waitForTimeout(1500);
  await page.locator("#login-identity").fill(id);
  await page.locator("#login-password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname.includes(expected), { timeout: 15000 });
}

async function run() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => console.warn("Network request failed:", request.url(), request.failure()?.errorText));
  try {
    await login(page, "registrar.demo", "Registrar@123", "/registrar/dashboard");
    await page.goto(origin + "/registrar/students");
    await page.getByRole("tab", { name: "Official Grades Import" }).click();
    await page.getByRole("tab", { name: "Upload Grades" }).click();
    const chooseFile = page.getByRole("button", { name: "Choose File" });
    await chooseFile.click();
    const uploadDialog = page.getByRole("dialog", { name: "Upload Grade File" });
    await uploadDialog.waitFor();
    assert.equal(await uploadDialog.getByRole("button", { name: "Browse Files" }).count(), 1);
    assert.equal(await uploadDialog.getByText("Supported formats: XLSX, CSV.").count(), 1);
    assert.equal(await page.locator("body").evaluate((element) => getComputedStyle(element).overflow), "hidden", "Modal should lock page scroll");
    const prevented = await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["test"], "ignored.csv", { type: "text/csv" }));
      const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(prevented, true, "Dropped files outside upload area must not navigate the browser");
    if (process.env.PLP_CAPTURE_UPLOAD_SCREENSHOTS === "1") {
      await page.screenshot({ path: "tests/grade-import/upload-modal-desktop.png", fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBounds = await uploadDialog.boundingBox();
    assert.ok(mobileBounds && mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 390, "Modal must fit within mobile viewport");
    assert.ok(mobileBounds.y >= 0 && mobileBounds.y + mobileBounds.height <= 844, "Modal must remain fully reachable vertically");
    assert.equal(await uploadDialog.getByRole("button", { name: "Browse Files" }).isVisible(), true);
    if (process.env.PLP_CAPTURE_UPLOAD_SCREENSHOTS === "1") {
      await page.screenshot({ path: "tests/grade-import/upload-modal-mobile.png", fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await uploadDialog.getByRole("button", { name: "Cancel" }).click();
    assert.equal(await uploadDialog.count(), 0, "Cancel should close upload dialog");
    await chooseFile.click();
    await page.keyboard.press("Escape");
    assert.equal(await uploadDialog.count(), 0, "Escape should close upload dialog");
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Choose File");
    await chooseFile.click();
    await uploadDialog.getByRole("button", { name: "Close dialog" }).click();
    assert.equal(await uploadDialog.count(), 0, "Close icon must dismiss the modal");
    await chooseFile.click();
    const badPicker = page.waitForEvent("filechooser");
    await uploadDialog.getByRole("button", { name: "Browse Files" }).click();
    await (await badPicker).setFiles({ name: "unsupported.pdf", mimeType: "application/pdf", buffer: Buffer.from("bad") });
    await uploadDialog.getByRole("alert").getByText(/Unsupported file format/).waitFor();
    await dropFiles(page, [
      { name: "one.csv", type: "text/csv", buffer: Buffer.from("first") },
      { name: "two.csv", type: "text/csv", buffer: Buffer.from("second") },
    ]);
    await uploadDialog.getByRole("alert").getByText(/one grade file at a time/).waitFor();
    await uploadDialog.getByRole("button", { name: "Cancel" }).click();
    assert.equal(await page.getByText("No file chosen").count(), 1, "Rejected files must not become selected");
    await chooseFile.click();
    const csv = [
      "student_number,student_full_name,subject_code,academic_year,semester,section_code,grade_value,completion_status,source_record_reference,Subject_name",
      "2024-00123,Juan Dela Cruz,IT204,2025 to 2026,Second Semester,CTC 205,1.75,COMPLETED,CSV-IT204-001,Object Oriented Programming",
    ].join("\n");
    await dropFiles(page, [{ name: "drag-example.csv", type: "text/csv", buffer: Buffer.from(csv) }]);
    assert.equal(await uploadDialog.count(), 0, "Valid CSV drop should close modal");
    await page.getByTitle("drag-example.csv").waitFor();
    await page.getByRole("button", { name: "Parse & Preview File" }).click();
    await page.getByText("Parsed 1 rows", { exact: false }).waitFor();
    await chooseFile.click();
    const invalidReplacement = page.waitForEvent("filechooser");
    await uploadDialog.getByRole("button", { name: "Browse Files" }).click();
    await (await invalidReplacement).setFiles({ name: "unsupported.pdf", mimeType: "application/pdf", buffer: Buffer.from("bad") });
    await uploadDialog.getByRole("alert").getByText(/Unsupported file format/).waitFor();
    await uploadDialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByTitle("drag-example.csv").waitFor();
    await page.getByText("Parsed 1 rows", { exact: false }).waitFor();
    await chooseFile.click();
    const longNamePicker = page.waitForEvent("filechooser");
    await uploadDialog.getByRole("button", { name: "Browse Files" }).click();
    await (await longNamePicker).setFiles({
      name: `${"long-grade-filename-".repeat(12)}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    const longFilename = page.getByTitle(`${"long-grade-filename-".repeat(12)}.csv`);
    const isTruncated = await longFilename.evaluate((element) => (
      getComputedStyle(element).textOverflow === "ellipsis" && element.scrollWidth > element.clientWidth
    ));
    assert.equal(isTruncated, true, "Long selected filenames should truncate instead of overflowing");
    console.log("PASS browser: modal close, Escape, focus restoration, invalid and multiple drop errors, CSV drag upload and parsing");

    await page.getByLabel("Demo Source Verification Reference").fill("DEMO-PROF-RM-2026-001");
    await chooseFile.click();
    const invalidPicker = page.waitForEvent("filechooser");
    await uploadDialog.getByRole("button", { name: "Browse Files" }).click();
    await (await invalidPicker).setFiles(path.resolve("tests/grade-import/PLP_Mock_Official_Student_Grades_Invalid.xlsx"));
    assert.equal(await page.getByText("Parsed 1 rows", { exact: false }).count(), 0, "Replacing selected file should clear stale preview");
    await page.getByRole("button", { name: "Parse & Preview File" }).click();
    await page.getByText("Parsed 7 rows", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Create Import Batch" }).click();
    await page.getByRole("button", { name: "Run Validation" }).click();
    await page.getByText(/blocking validation issues|blocking issue/i).first().waitFor();
    await assert.rejects(page.getByRole("button", { name: "Publish Demo Results" }).click({ timeout: 1000 }), /not enabled|Timeout/);
    console.log("PASS browser: invalid XLSX parsed and validation blocked publication");

    await page.getByRole("tab", { name: "Upload Grades" }).click();
    await page.getByLabel("Demo Source Verification Reference").fill("DEMO-PROF-RM-2026-002");
    await chooseFile.click();
    await dropFiles(page, [{
      name: "PLP_Mock_Official_Student_Grades_Valid.xlsx",
      buffer: fs.readFileSync("tests/grade-import/PLP_Mock_Official_Student_Grades_Valid.xlsx"),
    }]);
    await page.getByRole("button", { name: "Parse & Preview File" }).click();
    await page.getByText("Parsed 3 rows", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Create Import Batch" }).click();
    await page.getByRole("button", { name: "Run Validation" }).click();
    await page.getByText(/Validated 3 row/i).first().waitFor();
    await page.getByRole("checkbox", { name: /sample file matches the demo source reference/i }).check();
    await page.getByRole("button", { name: "Record Simulated Verification" }).click();
    await page.getByRole("button", { name: "Publish Demo Results" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Publish Demo Results" });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Publish Demo Results" }).click();
    await page.getByText(/Published 3 simulated academic/i).first().waitFor();
    await page.reload();
    await page.getByRole("tab", { name: "Grade Import History" }).click();
    await page.getByText(/PUB-/).first().waitFor();
    console.log("PASS browser: valid XLSX published after attestation, history survives refresh");

    await page.getByRole("button", { name: "Logout" }).click();
    await login(page, "2024-00123", "Student@123", "/student/dashboard");
    await page.goto(origin + "/student/academic-records");
    await page.getByRole("tab", { name: "Subject History" }).click();
    const juan = page.getByRole("row").filter({ hasText: "IT204" });
    assert.match(await juan.innerText(), /1\.75/);
    assert.match(await juan.innerText(), /COMPLETED/i);
    await page.reload();
    await page.getByRole("tab", { name: "Subject History" }).click();
    assert.match(await page.getByRole("row").filter({ hasText: "IT204" }).innerText(), /1\.75/, "Grade must survive Student refresh");
    await page.goto(origin + "/student/notifications");
    await page.getByText("Official Academic Results Available").first().waitFor();
    await page.goto(origin + "/student/enrollment");
    await page.getByRole("button", { name: "Academic Eligibility", exact: false }).first().click();
    await page.getByText("IT305", { exact: false }).first().waitFor();
    console.log("PASS browser: Juan sees published grade, own notices, eligibility module");

    await page.getByRole("button", { name: "Logout" }).click();
    await login(page, "2026-01896", "Student@123", "/student/dashboard");
    await page.goto(origin + "/student/academic-records");
    await page.getByRole("tab", { name: "Subject History" }).click();
    const katrina = page.getByRole("row").filter({ hasText: "IT204" });
    assert.match(await katrina.innerText(), /5\.00/);
    assert.match(await katrina.innerText(), /FAILED/i);
    assert.ok(!(await page.locator("body").innerText()).includes("1.75"));
    console.log("PASS browser: student identity isolation and FAILED result");
    await page.getByRole("button", { name: "Logout" }).click();
    await login(page, "2026-00108", "Student@123", "/student/dashboard");
    await page.goto(origin + "/student/academic-records");
    await page.getByRole("tab", { name: "Subject History" }).click();
    const dencie = page.getByRole("row").filter({ hasText: "IT204" });
    assert.match(await dencie.innerText(), /INC/);
    assert.match(await dencie.innerText(), /INCOMPLETE/i);
    console.log("PASS browser: INCOMPLETE academic result and preserved ID-scoped records");
    assert.equal(errors.length, 0, `Browser errors: ${errors.join("; ")}`);
    console.log("PASS browser: no uncaught client page errors");
  } catch (error) {
    fs.mkdirSync("tests/grade-import", { recursive: true });
    await page.screenshot({ path: "tests/grade-import/browser-failure.png", fullPage: true }).catch(() => {});
    console.error("BROWSER TEST FAILED:", error.message);
    console.error("Client errors:", errors);
    console.error("Current URL:", page.url());
    console.error("Page excerpt:", (await page.locator("body").innerText().catch(() => "")).slice(0, 2000));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
run();
