import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";
import { displaySubjectCode } from "../academic/project-academic-display-aliases.mjs";

// Inspect the real Project Grade Import JSX without loading Next.js or
// triggering protected actions. Execute each user-visible display expression
// against canonical fixture codes to catch accidental internal-code leakage.
const source = readFileSync(new URL("./RegistrarProjectGradeWorkspace.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });

const fixture = Object.freeze([
  { raw: "P8F26-BSCS-T02-M1", expected: "CS 151", name: "Computer Science Subject" },
  { raw: "P8F26-BSIT-T02-M1", expected: "IT 151", name: "Computer Programming 2" },
  { raw: "P8F26-GE-T02-1", expected: "GE 151", name: "Readings in Philippine History" },
  { raw: "LEGACY-SUBJECT", expected: "LEGACY-SUBJECT", name: "Legacy Subject" },
]);

function walk(node, predicate, matches = []) {
  if (!node || typeof node !== "object") return matches;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, predicate, matches);
    return matches;
  }
  if (predicate(node)) matches.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments",
      "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
    if (value && typeof value === "object") walk(value, predicate, matches);
  }
  return matches;
}

function memberName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression" && !node.computed) {
    return `${memberName(node.object)}.${memberName(node.property)}`;
  }
  return null;
}

function attribute(opening, name) {
  return opening.attributes?.find((attr) =>
    attr.type === "JSXAttribute" && attr.name.name === name);
}

function valueOf(attr) {
  return attr?.value?.type === "JSXExpressionContainer"
    ? attr.value.expression : attr?.value?.value;
}

function textOf(node) {
  return walk(node, (item) => item.type === "JSXText")
    .map((item) => item.value.replace(/\s+/g, " ").trim()).join(" ");
}

function jsxElements(tag) {
  return walk(ast, (node) => node.type === "JSXElement" &&
    node.openingElement.name.name === tag);
}

function expressionsIn(node) {
  return walk(node, (item) => item.type === "JSXExpressionContainer")
    .map((item) => item.expression);
}

function getDisplayCall(node, argName) {
  const calls = walk(node, (item) => item.type === "CallExpression" &&
    item.callee?.type === "Identifier" &&
    item.callee.name === "displaySubjectCode" &&
    memberName(item.arguments?.[0]) === argName);
  assert.ok(calls.length, `displaySubjectCode(${argName}) missing from subject surface`);
  return calls[0];
}

function evaluate(expression, bindings) {
  return runInNewContext(source.slice(expression.start, expression.end), {
    displaySubjectCode,
    ...bindings,
  });
}

function assertAliases(call, rawProperty, label) {
  for (const entry of fixture) {
    const value = evaluate(call, {
      subject: { code: entry.raw, name: entry.name },
      item: { code: entry.raw, subject_code: entry.raw, name: entry.name },
    });
    assert.equal(value, entry.expected, `${label}: ${entry.raw}`);
    assert.equal(rawProperty(entry), entry.raw, `${label}: canonical key remains raw`);
  }
}

function tableColumn(rowsName, columnKey) {
  const table = jsxElements("DataTable").find((element) =>
    memberName(valueOf(attribute(element.openingElement, "rows"))) === rowsName);
  assert.ok(table, `DataTable rows=${rowsName} exists`);
  const columns = valueOf(attribute(table.openingElement, "columns"));
  assert.equal(columns?.type, "ArrayExpression", `${rowsName} uses table column definitions`);
  const column = columns.elements.find((item) =>
    item?.properties?.some((field) =>
      field.key?.name === "key" && field.value?.value === columnKey));
  assert.ok(column, `${rowsName} includes ${columnKey} column`);
  const render = column.properties.find((field) => field.key?.name === "render")?.value;
  assert.ok(render?.type === "ArrowFunctionExpression", "subject column has a render function");
  return render;
}

test("Phase 8 fixture resolves canonical subject aliases without changing raw database identifiers", () => {
  for (const { raw, expected } of fixture) {
    assert.equal(displaySubjectCode(raw), expected);
  }
  const importModule = ast.program.body.find((item) =>
    item.type === "ImportDeclaration" &&
    item.source.value.endsWith("project-academic-display-aliases.mjs"));
  assert.ok(importModule?.specifiers.some((item) =>
    item.imported?.name === "displaySubjectCode"),
  "project grade import uses the established Academic Coordinator subject-code formatter");
});

test("Previous Semester Subjects dropdown shows formatted codes while its selection value stays canonical", () => {
  const select = jsxElements("select").find((element) =>
    memberName(valueOf(attribute(element.openingElement, "value"))) === "subject.code");
  assert.ok(select, "subject selection remains bound to the raw subject.code");
  const options = walk(select, (node) => node.type === "JSXElement" &&
    node.openingElement.name.name === "option");
  assert.equal(options.length, 1, "subject options continue to come from subject catalog");
  const option = options[0];
  assert.equal(memberName(valueOf(attribute(option.openingElement, "value"))), "item.code",
    "React option values remain the actual project subject codes");
  assert.equal(memberName(valueOf(attribute(option.openingElement, "key"))), "item.code");
  assertAliases(getDisplayCall(option.children, "item.code"), ({ raw }) => raw, "subject dropdown");
});

test("Upload instruction and historical professor label display the canonical subject code", () => {
  const uploadInstruction = jsxElements("p").find((node) =>
    textOf(node).includes("Choose one CSV or XLSX file for"));
  assert.ok(uploadInstruction, "upload instructions remain visible");
  const strong = walk(uploadInstruction, (node) =>
    node.type === "JSXElement" && node.openingElement.name.name === "strong")[0];
  assert.ok(strong, "upload subject remains emphasized");
  assertAliases(getDisplayCall(expressionsIn(strong), "subject.code"),
    ({ raw }) => raw, "upload subject instruction");

  const professorLabel = jsxElements("label").find((node) =>
    textOf(node).includes("Professor for"));
  assert.ok(professorLabel, "professor mapping identifies the current historical subject");
  assertAliases(getDisplayCall(expressionsIn(professorLabel), "subject.code"),
    ({ raw }) => raw, "professor mapping label");
});

test("Review Grades source batch history shows formatted codes without rewriting batch subject identity", () => {
  const column = tableColumn("batchListing.items", "subject");
  assertAliases(getDisplayCall(column, "item.subject_code"),
    ({ raw }) => raw, "batch history subject table");
  assert.match(source, /item\.subject_code === subject\?\.code/,
    "selected source batch still matches the stored raw subject code");
  assert.match(source, /entry\.code === item\.subject_code/,
    "professor attribution still matches raw subject codes");
});

test("Publish Grades historical checklist displays canonical codes and retains raw subject keys", () => {
  const table = jsxElements("DataTable").find((node) =>
    memberName(valueOf(attribute(node.openingElement, "rows"))) === "subjects");
  assert.ok(table, "historical subject checklist remains available");
  assert.equal(valueOf(attribute(table.openingElement, "rowKey")), "code",
    "table row key remains the canonical subject identifier");
  const render = tableColumn("subjects", "subject");
  const strong = walk(render, (node) =>
    node.type === "JSXElement" && node.openingElement.name.name === "strong")[0];
  assert.ok(strong, "historical subject code is emphasized in the checklist");
  assertAliases(getDisplayCall(expressionsIn(strong), "item.code"),
    ({ raw }) => raw, "publication checklist");
  assert.match(source, /setSubjectCode\(item\.code\)/,
    "View Subject continues to navigate by the stored raw subject code");
  assert.match(source, /form\.set\("subject_code", subject\.code\)/,
    "grade import form still sends the original source subject code");
});
