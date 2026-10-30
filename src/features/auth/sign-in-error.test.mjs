import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_CONFIGURATION_ERROR_MESSAGE,
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  isAuthServiceUnavailable,
  signInFailureMessage,
} from "./sign-in-error.mjs";

test("network and Supabase outage failures do not claim a password is incorrect", () => {
  for (const error of [
    { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 },
    { message: "Failed to fetch" },
    { message: "getaddrinfo ENOTFOUND example.supabase.co" },
    { status: 503, message: "Service Unavailable" },
  ]) {
    assert.equal(isAuthServiceUnavailable(error), true);
    assert.equal(signInFailureMessage(error), AUTH_SERVICE_UNAVAILABLE_MESSAGE);
  }
});

test("invalid API key is reported as a configuration problem", () => {
  assert.equal(signInFailureMessage({ message: "Invalid API key", status: 401 }),
    AUTH_CONFIGURATION_ERROR_MESSAGE);
  assert.equal(signInFailureMessage({ code: "invalid_api_key", status: 401 }),
    AUTH_CONFIGURATION_ERROR_MESSAGE);
});

test("actual credential rejection retains a neutral credential message", () => {
  assert.equal(signInFailureMessage({ name: "AuthApiError", status: 400,
    code: "invalid_credentials", message: "Invalid login credentials" }),
    INVALID_CREDENTIALS_MESSAGE);
  assert.equal(signInFailureMessage(null), INVALID_CREDENTIALS_MESSAGE);
});
