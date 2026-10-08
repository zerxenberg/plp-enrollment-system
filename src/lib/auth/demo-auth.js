
import accounts from "@/data/mock/auth-accounts.json";

const SESSION_KEY = "plp-demo-session";

function matchesKnownDemoAccount(session) {
  if (!session || typeof session !== "object") return false;
  return accounts.some((account) =>
    account.role === session.role &&
    account.name === session.name &&
    account.identifier === session.identifier &&
    account.redirect === session.redirect
  );
}

export function authenticateDemoAccount({ identity, password }) {
  const normalizedIdentity = String(identity || "").trim().toLowerCase();

  const account = accounts.find((candidate) => {
    const matchesIdentity = [candidate.identifier, candidate.alternateIdentifier, candidate.staffId]
      .some((value) => value && String(value).toLowerCase() === normalizedIdentity);

    return matchesIdentity && candidate.password === password;
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
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
}
