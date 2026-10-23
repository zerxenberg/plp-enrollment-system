import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((item) => {
    const filename = path.join(folder, item.name);
    if (item.isDirectory()) return sourceFiles(filename);
    return /\.[cm]?[jt]sx?$/.test(item.name) ? [filename] : [];
  });
}

test("all portal screens omit legacy Project Simulation branding", () => {
  const files = sourceFiles(path.join(root, "components"));
  assert.ok(files.length > 0);
  const violations = files.filter((file) =>
    /project simulation/i.test(readFileSync(file, "utf8")));
  assert.deepEqual(violations.map((file) => path.relative(root, file)), []);
});

test("user-facing enrollment actions omit legacy Project Simulation wording", () => {
  const sources = [
    "features/academic/registrar-project-simulations.js",
    "features/students/student-portal-actions.js",
  ];
  for (const source of sources) {
    assert.doesNotMatch(
      readFileSync(path.join(root, source), "utf8"),
      /["'`][^"'`]*project simulation[^"'`]*["'`]/i,
      source,
    );
  }
});
