import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { allowProjectOnlyLogin } from "@/lib/auth/project-only-login-guard";
import { requireProjectOnlyInitialPasswordRotation } from "@/lib/auth/project-only-first-login-rotation.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAILURE = "Invalid credentials or account access.";
const IDENTIFIER_TYPES = ["STUDENT_NUMBER", "EMPLOYEE_ID", "ACCOUNT_ID", "USERNAME"];
const reply = (message, status) => NextResponse.json(
  { ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });

function fingerprint(secret, kind, value) {
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

export async function POST(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const privateKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const pepper = process.env.AUTH_IDENTIFIER_HASH_SECRET;
  if (!url || !publicKey || !privateKey || !pepper || pepper.length < 32) {
    return reply("University ID sign in is temporarily unavailable.", 503);
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2048) return reply(FAILURE, 400);
  let input;
  try {
    input = await request.json();
  } catch {
    return reply(FAILURE, 400);
  }
  const identifier = String(input?.identity || "").trim().toUpperCase();
  const password = input?.password;
  if (!/^[A-Z0-9._/\\-]{3,64}$/.test(identifier) ||
      typeof password !== "string" || password.length < 1 || password.length > 1024) {
    return reply(FAILURE, 401);
  }

  const admin = createClient(url, privateKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const ip = (request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const budgetKeys = [
    { p_key_hash: fingerprint(pepper, "identifier", identifier), p_kind: "IDENTIFIER" },
    { p_key_hash: fingerprint(pepper, "ip", ip), p_kind: "IP" },
  ];
  try {
    // A database-backed throttle is shared across serverless instances and
    // serialized by PostgreSQL's ON CONFLICT row lock.
    const budgets = await Promise.all(budgetKeys.map((key) =>
      admin.rpc("claim_identifier_login_budget", key)));
    if (budgets.some((budget) => budget.error)) return reply("Authentication is temporarily unavailable.", 503);
    if (budgets.some((budget) => budget.data !== true)) {
      return reply("Too many sign in attempts. Please try again later.", 429);
    }

    const identifiers = await admin.from("user_login_identifiers")
      .select("user_id")
      .in("identifier_type", IDENTIFIER_TYPES)
      .eq("identifier_value", identifier).limit(100);
    if (identifiers.error) return reply("Authentication is temporarily unavailable.", 503);
    // Identifier types may legitimately duplicate a value for the same owner.
    // Ambiguity between different owners must always fail closed.
    const owners = new Set((identifiers.data || []).map((row) => row.user_id));
    if (owners.size !== 1 || identifiers.data.length >= 100) return reply(FAILURE, 401);

    const mapping = await admin.from("app_users")
      .select("id,email,auth_user_id,source_account_key,role_code,account_status,login_enabled")
      .eq("id", [...owners][0]).maybeSingle();
    if (mapping.error) return reply("Authentication is temporarily unavailable.", 503);
    const account = mapping.data;
    if (!account || !account.auth_user_id || account.login_enabled !== true ||
        account.account_status !== "Active") return reply(FAILURE, 401);

    const auth = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await auth.auth.signInWithPassword({
      email: account.email, password,
    });
    if (error || !data.user || !data.session ||
        data.user.id !== account.auth_user_id || !data.user.email_confirmed_at) {
      return reply(FAILURE, 401);
    }
    if (!(await allowProjectOnlyLogin(admin, account, data.user))) {
      return reply(FAILURE, 401);
    }
    const initialPasswordChangeRequired =
      await requireProjectOnlyInitialPasswordRotation(admin, account, data.user);
    return NextResponse.json({
      ok: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      initialPasswordChangeRequired,
      projectOnly: String(account.source_account_key || "").startsWith("PROJECT_ONLY:"),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return reply("Authentication is temporarily unavailable.", 503);
  }
}
