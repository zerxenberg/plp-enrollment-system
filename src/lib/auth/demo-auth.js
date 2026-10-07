import accounts from "@/data/mock/auth-accounts.json";

const SESSION_KEY = "plp-demo-session";

function matchesKnownDemoAccount(session) {
  if (!session || typeof session !== "object") return false;
  return accounts.some((account) =>
    account.role === session.role &&
    account.name === session.name &&
    account.identifier === session.identifier &&
    account.redirect === session.redirect,
  );
}

export function authenticateDemoAccount({ mode, identity, password }) {
  const normalizedIdentity = identity.trim().toLowerCase();
  const allowedRole = mode === "student" ? "student" : "registrar";
  const account = accounts.find((candidate) => {
    const matchesIdentity =
      candidate.identifier.toLowerCase() === normalizedIdentity ||
      candidate.alternateIdentifier.toLowerCase() === normalizedIdentity;
    return candidate.role === allowedRole && matchesIdentity && candidate.password === password;
  });

  if (!account) return null;

  return {
    role: account.role,
    name: account.name,
    identifier: account.identifier,
    redirect: account.redirect,
  };
}

export function saveDemoSession(session) {
  if (!matchesKnownDemoAccount(session)) return false;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return true;
}

export function getDemoSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!matchesKnownDemoAccount(session)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearDemoSession() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
}
