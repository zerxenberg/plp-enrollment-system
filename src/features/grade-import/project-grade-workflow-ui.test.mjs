import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

// Source-level UI contract tests: the real JSX is parsed, then controls and
// event-handler call graphs are inspected. No DOM/browser or database needed.
// Avoid pinning whitespace, CSS classes, and incidental layout nesting.
const traverse = traverseModule.default ?? traverseModule;
const source = readFileSync(new URL("./RegistrarProjectGradeWorkspace.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });

function memberName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "StringLiteral") return node.value;
  if (node?.type === "MemberExpression" && !node.computed) {
    return `${memberName(node.object)}.${memberName(node.property)}`;
  }
  return null;
}

function attribute(opening, name) {
  return opening?.attributes?.find((item) =>
    item.type === "JSXAttribute" && item.name?.name === name);
}

function valueOf(attributeNode) {
  const value = attributeNode?.value;
  return value?.type === "StringLiteral" ? value.value : value?.expression;
}

function findReferences(node, names, out = new Set()) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findReferences(item, names, out);
    return out;
  }
  if (node.type === "Identifier" && names.has(node.name)) out.add(node.name);
  for (const [key, child] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments", "leadingComments",
      "trailingComments", "innerComments"].includes(key)) continue;
    if (child && typeof child === "object") findReferences(child, names, out);
  }
  return out;
}

const protectedActions = new Set();
const functions = new Map();
const eventControls = [];
const allJSX = [];
let steps = null;

traverse(ast, {
  ImportDeclaration(path) {
    if (!path.node.source.value.endsWith("registrar-project-grade-actions")) return;
    for (const specifier of path.node.specifiers) {
      if (specifier.type === "ImportSpecifier") protectedActions.add(specifier.local.name);
    }
  },
  FunctionDeclaration(path) {
    if (path.node.id?.name) functions.set(path.node.id.name, path.node.body);
  },
  VariableDeclarator(path) {
    if (path.node.id.type !== "Identifier") return;
    const init = path.node.init;
    if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
      functions.set(path.node.id.name, init.body);
    }
    if (path.node.id.name === "WORKFLOW_STEPS" && init?.type === "ArrayExpression") {
      steps = init.elements.map((element) => Object.fromEntries(
        element.properties.filter((property) => property.type === "ObjectProperty")
          .map((property) => [memberName(property.key), property.value.value]),
      ));
    }
  },
  JSXOpeningElement(path) {
    const tag = path.node.name.name;
    allJSX.push({ tag, node: path.node, path });
    for (const prop of path.node.attributes) {
      if (prop.type !== "JSXAttribute" ||
          !/^on(?:Click|Submit|KeyDown|Change|FileSelected)$/.test(prop.name.name)) continue;
      eventControls.push({ tag, event: prop.name.name, callback: valueOf(prop),
        node: path.node, path });
    }
  },
});

function actionsFromControl(control) {
  const reachable = new Set();
  const seenFunctions = new Set();
  const names = new Set([...protectedActions, ...functions.keys()]);
  function walk(node) {
    const refs = findReferences(node, names);
    for (const name of refs) {
      if (protectedActions.has(name)) reachable.add(name);
      if (functions.has(name) && !seenFunctions.has(name)) {
        seenFunctions.add(name);
        walk(functions.get(name));
      }
    }
  }
  walk(control.callback);
  return reachable;
}

function controlsForAction(name) {
  return eventControls.filter((control) => actionsFromControl(control).has(name));
}

function stageForControl(control) {
  const containingPanel = control.path.findParent((path) =>
    path.isJSXElement() && valueOf(attribute(path.node.openingElement, "role")) === "tabpanel");
  const id = valueOf(attribute(containingPanel?.node?.openingElement, "id"));
  const idText = id?.type === "TemplateLiteral"
    ? id.quasis.map((part) => part.value.cooked).join(" ") : String(id ?? "");
  return ["upload", "review", "publish"].find((key) => idText.includes(`panel-${key}`)) || null;
}

function hasReference(node, name) {
  return findReferences(node, new Set([name])).has(name);
}

function hasStageTest(node, key) {
  if (!node || typeof node !== "object") return false;
  if ((node.type === "BinaryExpression" || node.type === "LogicalExpression") &&
      ["==", "===", "&&"].includes(node.operator)) {
    if (node.type === "BinaryExpression" &&
      ((node.left?.type === "Identifier" && ["activeStep", "visibleStep"].includes(node.left.name) &&
        node.right?.type === "StringLiteral" && node.right.value === key) ||
       (node.right?.type === "Identifier" && ["activeStep", "visibleStep"].includes(node.right.name) &&
        node.left?.type === "StringLiteral" && node.left.value === key))) return true;
  }
  return Object.entries(node).some(([property, child]) =>
    !["loc", "start", "end", "extra"].includes(property) &&
    child && typeof child === "object" &&
    (Array.isArray(child) ? child.some((element) => hasStageTest(element, key)) : hasStageTest(child, key)));
}

function isStageControlledPanel(key) {
  // Hidden DOM panels and conditionally mounted panels are both accessible
  // approaches, provided inactive stage controls cannot remain visible.
  const hiddenPanel = allJSX.some(({ node }) => {
    if (valueOf(attribute(node, "role")) !== "tabpanel") return false;
    const id = valueOf(attribute(node, "id"));
    const idParts = id?.type === "TemplateLiteral" ? id.quasis.map((part) =>
      part.value.cooked).join(" ") : String(id ?? "");
    const hidden = valueOf(attribute(node, "hidden"));
    return idParts.includes(`panel-${key}`) && hidden?.type === "BinaryExpression" &&
      hidden.operator === "!==" &&
      (hasReference(hidden, "activeStep") || hasReference(hidden, "visibleStep")) &&
      (hidden.left?.value === key || hidden.right?.value === key);
  });
  if (hiddenPanel) return true;
  let conditionalPanel = false;
  traverse(ast, {
    JSXExpressionContainer(path) {
      const expr = path.node.expression;
      if (!["LogicalExpression", "ConditionalExpression"].includes(expr?.type)) return;
      const branch = expr.type === "LogicalExpression" ? expr.right : expr.consequent;
      const condition = expr.type === "LogicalExpression" ? expr.left : expr.test;
      if (hasStageTest(condition, key) && containsJSX(branch)) conditionalPanel = true;
    },
  });
  return conditionalPanel;
}

function containsJSX(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "JSXElement" || node.type === "JSXFragment") return true;
  return Object.entries(node).some(([property, child]) =>
    !["loc", "start", "end", "extra"].includes(property) && child &&
    typeof child === "object" &&
    (Array.isArray(child) ? child.some(containsJSX) : containsJSX(child)));
}

test("three named stages default to Upload, and history mode opens Review", () => {
  assert.deepEqual(steps?.map(({ key, label }) => ({ key, label })), [
    { key: "upload", label: "Upload Grades" },
    { key: "review", label: "Review Grades" },
    { key: "publish", label: "Publish Grades" },
  ]);
  assert.match(source, /useState\(historyOnly\s*\?\s*["']review["']\s*:\s*["']upload["']\)/);
  assert.ok(functions.has("selectStep"), "a dedicated stage selection handler exists");
  assert.ok(hasReference(functions.get("selectStep"), "setActiveStep"));
  // If a separate view stage normalizes read-only history mode, it must derive
  // from the actual controlled stage rather than from unrelated local state.
  let visibleStepInitializer;
  traverse(ast, {
    VariableDeclarator(path) {
      if (path.node.id.name === "visibleStep") visibleStepInitializer = path.node.init;
    },
  });
  if (visibleStepInitializer) {
    assert.ok(hasReference(visibleStepInitializer, "activeStep"));
    assert.ok(hasReference(visibleStepInitializer, "historyOnly"));
  }
});

test("stage navigation uses accessible tabs, keyboard handling, and a labelled tab panel", () => {
  const tabList = allJSX.find(({ node }) => valueOf(attribute(node, "role")) === "tablist");
  const tab = allJSX.find(({ node }) => valueOf(attribute(node, "role")) === "tab");
  const panel = allJSX.find(({ node }) => valueOf(attribute(node, "role")) === "tabpanel");
  assert.ok(tabList && attribute(tabList.node, "aria-label"), "stage navigation has an accessible name");
  assert.ok(tab && attribute(tab.node, "aria-selected") &&
    attribute(tab.node, "aria-controls") && attribute(tab.node, "tabIndex"),
  "stage buttons expose selected state, panel association, and roving keyboard focus");
  assert.ok(eventControls.some(({ event, node }) =>
    event === "onKeyDown" && valueOf(attribute(node, "role")) === "tab"),
  "stage tabs handle arrow/home/end keyboard navigation");
  assert.ok(panel && attribute(panel.node, "aria-labelledby"),
    "the active stage is an accessible, labelled tab panel");
});

test("stage state references resolve to variables in scope before rendering", () => {
  // Compilation and ordinary source checks can miss an undeclared stage alias
  // until the Registrar opens the actual page. Catch that runtime error here.
  const stageNames = new Set(["activeStep", "requestedStep", "visibleStep"]);
  const unresolved = [];
  traverse(ast, {
    Identifier(path) {
      if (path.isReferencedIdentifier() && stageNames.has(path.node.name) &&
          !path.scope.hasBinding(path.node.name)) {
        unresolved.push(path.node.name);
      }
    },
  });
  assert.deepEqual(unresolved, [], "every stage selector must use a defined state variable");
});

test("all three workflow stages are independently hidden or conditionally mounted", () => {
  for (const key of ["upload", "review", "publish"]) {
    assert.ok(isStageControlledPanel(key), `${key} has a JSX-rendered conditional panel`);
  }
});

test("preview/stage/validate/verify/corrections/publish each have a reachable UI event control", () => {
  for (const action of [
    "previewProjectGradeFile",
    "stageProjectGradeFile",
    "validateProjectGradeBatch",
    "attestProjectGradeBatch",
    "requestProjectGradeCorrections",
    "publishProjectGradeBlock",
  ]) {
    assert.ok(protectedActions.has(action), `protected ${action} is still imported`);
    assert.ok(controlsForAction(action).length > 0,
      `protected ${action} is reachable from an onClick/onSubmit UI control`);
  }
  assert.ok(protectedActions.has("loadProjectGradeWorkspace"));
  assert.ok(hasReference(ast.program, "loadProjectGradeWorkspace"),
    "protected workspace loader remains called by the component");
  // Historical template creation was an unused import before the redesign;
  // exposing it is optional, not a regression required by this workflow.
});

test("invalid roster preview never offers staging or a misleading continue button", () => {
  assert.ok(hasReference(functions.get("stageFile"), "preview"));
  assert.ok(hasReference(functions.get("stageFile"), "stageProjectGradeFile"));
  assert.match(source, /preview\.invalidRows\s*\|\|\s*preview\.missingStudents\.length/);
  assert.match(source, /preview\.requiredRows === preview\.rowCount/);
  assert.match(source, /preview\.outsideRosterRows > 0/);
  assert.ok(controlsForAction("downloadProjectGradeTemplate").length > 0,
    "Registrar can download the trusted eligible continuing student roster");
  assert.doesNotMatch(source, />Continue to Review Grades<\/Button>/,
    "a tab change must not masquerade as uploading or staging a file");
  assert.match(source, /Preview Grades alone does not upload the workbook/);
  assert.match(source, /View Staged Review Batches/);
});

test("protected operations remain on their appropriate stage, with publishing behind a dialog", () => {
  const placements = new Map([
    ["previewProjectGradeFile", "upload"],
    ["stageProjectGradeFile", "upload"],
    ["validateProjectGradeBatch", "review"],
    ["attestProjectGradeBatch", "review"],
    ["requestProjectGradeCorrections", "review"],
  ]);
  for (const [action, expectedStage] of placements) {
    assert.ok(controlsForAction(action).some((control) =>
      stageForControl(control) === expectedStage),
    `${action} must remain reachable from the ${expectedStage} stage`);
  }
  const confirm = controlsForAction("publishProjectGradeBlock");
  assert.ok(confirm.some((control) => control.path.findParent((path) =>
    path.isJSXElement() && path.node.openingElement.name.name === "Modal")),
  "protected block publication remains inside a confirmation modal");
  assert.ok(eventControls.some((control) =>
    stageForControl(control) === "publish" &&
    hasReference(control.callback, "setPublishConfirmed")),
  "Publish stage includes a button to open the confirmation modal");
});

test("Publish requires explicit confirmation and retains completeness/conflict checks", () => {
  const modal = allJSX.find(({ tag, node }) => tag === "Modal" &&
    valueOf(attribute(node, "open"))?.name === "publishConfirmed");
  assert.ok(modal, "publication confirmation dialog remains");
  const confirmation = eventControls.filter(({ callback }) =>
    hasReference(callback, "publish"));
  assert.ok(confirmation.some(({ tag }) => tag === "Button"),
    "only a dedicated confirm control invokes the publication handler");
  assert.ok(eventControls.some(({ callback }) =>
    hasReference(callback, "setPublishConfirmed")), "review button opens dialog");
  for (const required of ["publishConfirmed", "publicationAvailable", "progress", "release"]) {
    assert.ok(hasReference(functions.get("publish"), required),
      `publish handler retains ${required} safety gate`);
  }
});

test("Review keeps batch history search, selection, row inspection, and paginated releases", () => {
  for (const state of ["batchSearch", "setSelectedBatchId", "setShowRows", "batchPage",
    "releaseSearch", "releasePage", "filteredBatches", "filteredReleases"]) {
    assert.ok(hasReference(ast.program, state), `${state} remains in UI source`);
  }
  assert.ok(allJSX.some(({ tag, node }) => tag === "DataTable" &&
    hasReference(valueOf(attribute(node, "rows")), "batchListing")),
  "protected source batches table is still visible");
  assert.ok(allJSX.some(({ tag, node }) => tag === "DataTable" &&
    hasReference(valueOf(attribute(node, "rows")), "releaseListing")),
  "protected historical release ledger remains visible");
  const tableInStage = (identifier, stage) => allJSX.some(({ tag, node, path }) =>
    tag === "DataTable" && hasReference(valueOf(attribute(node, "rows")), identifier) &&
    stageForControl({ path }) === stage);
  assert.ok(tableInStage("batchListing", "review"), "batch history belongs in Review Grades");
  assert.ok(tableInStage("releaseListing", "publish"),
    "release ledger belongs in Publish Grades");
  const showRows = eventControls.some(({ callback }) => hasReference(callback, "setShowRows"));
  assert.ok(showRows, "source row inspection is actionable");
  assert.ok(eventControls.some(({ callback }) => hasReference(callback, "setBatchPage")),
    "batch history pagination is actionable");
  assert.ok(eventControls.some(({ callback }) => hasReference(callback, "setReleasePage")),
    "release ledger pagination is actionable");
  assert.ok(hasReference(functions.get("selectStep"), "historyOnly"),
    "history mode still prevents entry into upload stage");
});

test("verified batch display is derived consistently and hides the pending verification notice", () => {
  assert.ok(hasReference(ast.program, "projectGradeBatchDisplayStatus"),
    "review source details and publication checklist consume a derived display state");
  assert.match(source, /selectedBatch\.status === "READY_FOR_REVIEW" && selectedBatch\.verified_at/,
    "a verified batch shows its completed verification notice");
  assert.match(source, /readyForVerification:[^\n]+!batch\.verified_at/,
    "previous verification prompt only applies before verification is recorded");
});

test("Historical Block Grade Release separates notice, button and warnings with responsive spacing", () => {
  const css = readFileSync(new URL("./RegistrarProjectGradeWorkspace.module.css", import.meta.url), "utf8");
  assert.match(source, /Historical Block Grade Release<\/h4>/);
  for (const className of ["releaseSection", "releaseContent", "releaseNotice", "releaseActions", "releaseWarning"]) {
    assert.ok(source.includes(`styles.${className}`), `${className} is applied in the release UI`);
    assert.ok(css.includes(`.${className}`), `${className} has a scoped CSS rule`);
  }
  assert.match(css, /\.releaseContent\s*\{[^}]*display:\s*grid;[^}]*gap:\s*18px;/s);
  assert.match(css, /\.releaseActions\s*\{[^}]*align-items:\s*center;/s);
  assert.match(css, /@media \(max-width: 440px\)[\s\S]*\.releaseActions button\s*\{\s*width:\s*100%;/);
  assert.doesNotMatch(source, /className="notice warning" style=\{\{ marginTop: 10 \}\}/,
    "release warnings are spaced by layout rather than inline margins");
  assert.match(source, /!progress\.complete \|\| progress\.conflicts/,
    "publication warning keeps its original completeness gate");
});
