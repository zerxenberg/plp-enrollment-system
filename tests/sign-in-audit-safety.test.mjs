import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditSuccessfulLogin,
  denySignedInAccount,
} from "../src/lib/auth/sign-in-audit-safety.mjs";

test("denied account is signed out BEFORE attempting an audit that fails", async () => {
  const order = [];
  const result = await denySignedInAccount({
    message: "Account access denied.",
    signOut: async () => { order.push("sign-out"); },
    audit: async () => { order.push("audit"); throw Error("audit database offline"); },
  });
  assert.deepEqual(order, ["sign-out", "audit"]);
  assert.deepEqual(result, { ok: false, message: "Account access denied." });
});

test("denial stays fail-closed even if Auth logout is unavailable", async () => {
  let auditAttempted = false;
  const result = await denySignedInAccount({
    message: "Invalid account access.",
    signOut: async () => { throw Error("signOut network error"); },
    audit: async () => { auditAttempted = true; },
  });
  assert.equal(auditAttempted, true);
  assert.equal(result.ok, false);
});

test("authorized login does not fail because the audit RPC throws", async () => {
  await assert.doesNotReject(() =>
    auditSuccessfulLogin(async () => { throw Error("temporary audit failure"); }));
});
