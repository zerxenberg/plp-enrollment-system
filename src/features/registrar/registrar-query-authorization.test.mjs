import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./registrar-queries.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });

for (const name of ["getRegistrarDashboardData", "getRegistrarStudentsData"]) {
  test(`${name} rejects unauthenticated requests before creating a database client`, async () => {
    const declaration = ast.program.body.find((node) =>
      node.type === "ExportNamedDeclaration" &&
      node.declaration?.id?.name === name)?.declaration;
    assert.ok(declaration?.async, `${name} must remain an async protected loader`);

    const calls = [];
    const loader = runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, {
      requireRole: async (role) => {
        calls.push(`requireRole:${role}`);
        throw new Error("Unauthorized Registrar request");
      },
      createClient: async () => {
        calls.push("createClient");
        throw new Error("Database client must not be initialized");
      },
    });

    await assert.rejects(loader(), /Unauthorized Registrar request/);
    assert.deepEqual(calls, ["requireRole:registrar"]);
  });
}
