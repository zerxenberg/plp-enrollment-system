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
  new URL("../src/components/student/ProjectOnlyStudentModuleBoundary.js", import.meta.url),
  "utf8",
);

// Compile actual JSX through the project's own Next.js SWC transformer,
// then mock only navigation and presentation components. The assertions
// exercise rendered output without a browser, a live login or database.
await loadBindings();
const compiled = await transform(source, {
  filename: "ProjectOnlyStudentModuleBoundary.js",
  jsc: {
    parser: { syntax: "ecmascript", jsx: true },
    transform: { react: { runtime: "automatic" } },
    target: "es2022",
  },
  module: { type: "commonjs" },
});

function renderBoundary(pathname, authenticatedProfile) {
  const testModule = { exports: {} };
  const components = {
    Card: ({ children }) => React.createElement("section", { "data-test": "card" }, children),
    EmptyState: ({ title, description }) => React.createElement(
      "div",
      { "data-test": "empty-state" },
      React.createElement("strong", null, title),
      React.createElement("p", null, description),
    ),
    PageHeader: ({ title, description }) => React.createElement(
      "header",
      null,
      React.createElement("h1", null, title),
      React.createElement("p", null, description),
    ),
  };
  const mockedRequire = (name) => {
    if (name === "next/navigation") return { usePathname: () => pathname };
    if (name === "@/components/ui/PortalUI") return components;
    if (name === "react/jsx-runtime") return require("react/jsx-runtime");
    throw new Error(`Unexpected import: ${name}`);
  };
  vm.runInNewContext(compiled.code, {
    module: testModule,
    exports: testModule.exports,
    require: mockedRequire,
  }, { filename: "ProjectOnlyStudentModuleBoundary.compiled.js" });
  const Boundary = testModule.exports.default;
  return renderToStaticMarkup(React.createElement(
    Boundary,
    { authenticatedProfile },
    React.createElement("div", { "data-test": "mock-record" }, "SHARED_DEMO_GRADE_FAILED"),
  ));
}

test("authenticated PROJECT_ONLY pages render verified server-owned module content", () => {
  for (const path of [
    "/student/dashboard",
    "/student/enrollment",
    "/student/academic-records",
    "/student/class-schedule",
    "/student/notifications",
    "/student/future-academic-module",
    "/student",
  ]) {
    for (const profile of [{ mode: "project" }, { kind: "complete" }]) {
      const html = renderBoundary(path, profile);
      assert.match(html, /SHARED_DEMO_GRADE_FAILED/);
      assert.doesNotMatch(html, /Student information unavailable/);
    }
  }
});

test("Student Profile is rendered only after the project account boundary is verified", () => {
  for (const path of ["/student/student-profile", "/student/student-profile/"]) {
    for (const profile of [{ mode: "project" }, { kind: "complete" }]) {
      const html = renderBoundary(path, profile);
      assert.match(html, /SHARED_DEMO_GRADE_FAILED/);
      assert.doesNotMatch(html, /Student information unavailable/);
    }
  }
});

test("legacy, demo, or unverified accounts cannot access project student modules", () => {
  for (const profile of [{ mode: "demo" }, { kind: "legacy" }]) {
    const html = renderBoundary("/student/enrollment", profile);
    assert.match(html, /Student information unavailable/);
    assert.doesNotMatch(html, /SHARED_DEMO_GRADE_FAILED/);
  }

  for (const profile of [
    undefined,
    null,
    { mode: "unavailable" },
    { kind: "denied" },
    { mode: "demo", kind: "complete" },
    { mode: "project", kind: "legacy" },
  ]) {
    const html = renderBoundary("/student/enrollment", profile);
    assert.match(html, /Student information unavailable/);
    assert.doesNotMatch(html, /SHARED_DEMO_GRADE_FAILED/);
  }
});

test("boundary cannot query the shared demo provider or create another authentication source", () => {
  assert.match(source, /mode === "project"/);
  assert.doesNotMatch(source, /useDemoData|DemoDataProvider|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /auth\.getUser|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});
