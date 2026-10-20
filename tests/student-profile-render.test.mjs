import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { loadBindings, transform } = require("next/dist/build/swc");
const source = readFileSync(
  new URL("../src/components/student/StudentProfile.js", import.meta.url),
  "utf8",
);

await loadBindings();
const compiled = await transform(source, {
  filename: "StudentProfile.js",
  jsc: {
    parser: { syntax: "ecmascript", jsx: true },
    transform: { react: { runtime: "automatic" } },
    target: "es2022",
  },
  module: { type: "commonjs" },
});

function renderProfile(mode, profile) {
  const testModule = { exports: {} };
  const elements = {
    PageHeader: ({ title, description }) => React.createElement(
      "header", null, React.createElement("h1", null, title),
      React.createElement("p", null, description),
    ),
    InternalTabs: ({ items, selected, children }) => React.createElement(
      "section", null, React.createElement(
        "nav", null, items.map((item) => React.createElement(
          "span", { key: item.value, "aria-current": selected === item.value },
          item.label,
        )),
      ), children,
    ),
  };
  const testRequire = (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return require("react/jsx-runtime");
    if (name === "@/components/ui/PortalUI") return elements;
    throw new Error(`Unexpected component dependency: ${name}`);
  };
  vm.runInNewContext(compiled.code, {
    module: testModule,
    exports: testModule.exports,
    require: testRequire,
  }, { filename: "StudentProfile.compiled.js" });
  const Profile = testModule.exports.default;
  return renderToStaticMarkup(React.createElement(Profile, { mode, profile }));
}

test("authenticated PROJECT_ONLY profile renders only linked fictional values", () => {
  const html = renderProfile("project", {
    studentNumber: "26-50001",
    fullName: "Generated Student One",
    email: "generated@example.invalid",
    program: "BSIT",
    yearLevel: "1",
    studentType: "New Student",
    curriculum: "BSIT-2024",
    major: null,
    accountStatus: "Active (project account)",
  });
  assert.match(html, /Generated Student One/);
  assert.match(html, /26-50001/);
  assert.match(html, /Proposed Curriculum/);
  assert.match(html, /Not verified/);
  assert.match(html, /No official record/);
  assert.doesNotMatch(html, /Juan Dela Cruz|APP-2024-01987|IN_PROGRESS|REGULAR/);
});

test("authenticated ordinary Student reads own PostgreSQL profile without demo fallback", () => {
  const html = renderProfile("live", {
    studentNumber: "STUDENT-009",
    fullName: "Linked Student Nine",
    email: "nine@example.invalid",
    program: "BSED",
    yearLevel: "2nd Year",
    studentType: "TRANSFEREE",
    curriculum: "CUR-BSED-2026",
    academicClassification: "IRREGULAR",
    studentStatus: "ACTIVE",
    accountStatus: "Active",
  });
  assert.match(html, /Linked Student Nine/);
  assert.match(html, /STUDENT-009/);
  assert.match(html, /CUR-BSED-2026/);
  assert.match(html, /IRREGULAR/);
  assert.doesNotMatch(html, /Juan Dela Cruz|APP-2024-01987|BSIT Curriculum 2024/);
});

test("unverified and formerly demo mode fail closed without rendering personal records", () => {
  for (const mode of ["unavailable", "demo", undefined]) {
    const html = renderProfile(mode, {
      studentNumber: "ATTACKER",
      fullName: "Unverified Account",
    });
    assert.match(html, /Student Profile is temporarily unavailable/);
    assert.doesNotMatch(html, /Unverified Account|ATTACKER|Juan Dela Cruz/);
  }
  assert.doesNotMatch(source, /DemoDataProvider|useDemoData|student\.academicResults|student\.enrollment/);
});
