/**
 * An audit storage outage must not keep a freshly authenticated session alive
 * after application authorization has failed. Do not expose database errors,
 * account identifiers, credentials, or tokens in the denial response.
 */
export async function denySignedInAccount({ audit, signOut, message }) {
  try {
    await signOut();
  } catch {
    // Authorization is still denied, including when Auth sign-out is down.
    // Database RLS remains the authoritative guard for outstanding tokens.
  }
  try {
    await audit();
  } catch {
    // Authentication denial takes priority over optional audit availability.
  }
  return { ok: false, message };
}

/** Successful login never depends on availability of the audit RPC. */
export async function auditSuccessfulLogin(audit) {
  try {
    await audit();
  } catch {
    // Preserve successfully authorized user session; audit is best-effort.
  }
}
