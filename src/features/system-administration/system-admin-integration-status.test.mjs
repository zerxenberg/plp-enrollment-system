import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./system-admin-queries.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
const declaration = ast.program.body.find((node) =>
  node.type === "ExportNamedDeclaration" &&
  node.declaration?.id?.name === "getSystemIntegrationData")?.declaration;
assert.ok(declaration, "System integration loader exists");

function mockClient(tables, log, label) {
  return {
    from(table) {
      log.push(`${label}:${table}`);
      return {
        select() { return this; },
        order() { return this; },
        limit() { return this; },
        then(resolve, reject) {
          return Promise.resolve({ data: tables[table] || [], error: null }).then(resolve, reject);
        },
      };
    },
  };
}

test("administrator integration status reads trusted historical handoffs despite session RLS", async () => {
  const reads = [];
  let authorized = false;
  const session = mockClient({ integration_configurations: [] }, reads, "session");
  const admin = mockClient({
    integration_requests: [
      { source_system: "PLP Admissions", status: "Successful" },
      { source_system: "Other Source", status: "Successful" },
    ],
    synchronization_events: [{ direction: "INBOUND", status: "Successful" }],
    admission_handoffs: [
      { source_name: "PLP Admissions", synchronization_status: "Successful", received_at: "2026-10-29T16:27:33Z" },
      { source_name: "registrar.json", synchronization_status: "Successful", received_at: "2026-10-30T00:00:00Z" },
    ],
  }, reads, "admin");

  const loader = runInNewContext(`(${source.slice(declaration.start, declaration.end)})`, {
    requireRole: async (role) => { assert.equal(role, "system-administrator"); authorized = true; },
    createClient: async () => { assert.ok(authorized); return session; },
    createAdminClient: () => { assert.ok(authorized); return admin; },
    assertQuery: (error) => { if (error) throw error; },
    formatDateTime: (value) => value || "Not recorded",
    formatDate: (value) => value || "Not recorded",
    configuredAdmissionsInvitation: ({ enabled }) => ({ enabled }),
    process: { env: {} },
  });
  const result = await loader();
  assert.equal(result.bridge.successfulHandoffs, 1);
  assert.equal(result.bridge.successfulRequests, 1);
  assert.equal(result.bridge.connectivity, "Successful inbound handoffs recorded");
  assert.equal(result.bridge.lastInboundAtLabel, "2026-10-29T16:27:33Z");
  assert.equal(result.bridge.automaticInvitationConfigured, false);
  assert.deepEqual(reads, [
    "session:integration_configurations",
    "admin:integration_requests",
    "admin:synchronization_events",
    "admin:admission_handoffs",
  ]);
});
