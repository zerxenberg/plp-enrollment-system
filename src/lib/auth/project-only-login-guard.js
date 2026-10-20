import "server-only";

// Both authentication entrypoints must use this server-only implementation.
// The policy is separately importable by offline mock tests, without secrets.
export { allowProjectOnlyLogin } from "./project-only-login-policy.mjs";
