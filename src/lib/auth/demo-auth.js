
const SESSION_KEY = "plp-demo-session";
const SESSION_EVENT = "plp-demo-session-changed";
const ALLOWED_ROLES = new Set([
  "student",
  "registrar",
  "academic-coordinator",
  "system-administrator",
]);

function isValidContext(session) {
  return Boolean(
    session &&
    typeof session === "object" &&
    ALLOWED_ROLES.has(session.role) &&
    session.name &&
    session.identifier &&
    session.redirect
  );
}

// Temporary compatibility bridge for the remaining mock-data layer.
// Authentication is performed by Supabase Auth. No password is stored here.
export function saveDemoSession(session) {
  if (typeof window === "undefined" || !isValidContext(session)) return false;

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_EVENT));
  return true;
}

export function getDemoSession() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);

    if (!isValidContext(session)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}
