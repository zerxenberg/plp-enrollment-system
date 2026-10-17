/**
 * Read-only four-role acceptance test against actual Supabase Auth sessions.
 *
 * Set PHASE3B_STUDENT_EMAIL/PASSWORD, PHASE3B_REGISTRAR_EMAIL/PASSWORD,
 * PHASE3B_COORDINATOR_EMAIL/PASSWORD, PHASE3B_ADMIN_EMAIL/PASSWORD through
 * a secure shell or CI secrets environment. Never check credentials into Git.
 * This script intentionally makes no data changes.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z0-9_]+=/.test(line))
  .map((line) => {
    const idx = line.indexOf("=");
    return [line.slice(0, idx), line.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
  }));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Public Supabase settings are not configured.");

const testRoles = [
  ["student", "STUDENT"],
  ["registrar", "REGISTRAR"],
  ["academic-coordinator", "COORDINATOR"],
  ["system-administrator", "ADMIN"],
];
const missing = testRoles.filter(([, prefix]) =>
  !process.env[`PHASE3B_${prefix}_EMAIL`] ||
  !process.env[`PHASE3B_${prefix}_PASSWORD`]);
if (missing.length) {
  for (const [role] of missing) {
    console.error(`NOT TESTED: ${role} has no securely supplied test credentials.`);
  }
  console.error("Four-role acceptance is BLOCKED, not passed. No test accounts were created.");
  process.exit(2);
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  if (!condition) failures += 1;
}

for (const [role, prefix] of testRoles) {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: login, error: loginError } = await client.auth.signInWithPassword({
    email: process.env[`PHASE3B_${prefix}_EMAIL`],
    password: process.env[`PHASE3B_${prefix}_PASSWORD`],
  });
  if (loginError || !login.user || !login.user.email_confirmed_at) {
    check(`${role}: real verified Supabase login`, false);
    continue;
  }
  check(`${role}: real verified Supabase login`, true);

  const { data: account, error: mappingError } = await client.from("app_users")
    .select("id,auth_user_id,role_code,account_status,login_enabled")
    .eq("auth_user_id", login.user.id).maybeSingle();
  const authorized = !mappingError && account?.auth_user_id === login.user.id &&
    account.role_code === role && account.account_status === "Active" &&
    account.login_enabled === true;
  check(`${role}: enabled and linked role mapping`, authorized);
  if (!authorized) {
    await client.auth.signOut();
    continue;
  }

  const { data: liveRole, error: roleError } = await client.rpc("current_role_code");
  check(`${role}: SQL identity helper`, !roleError && liveRole === role);
  const { error: catalogError } = await client.from("programs").select("code").limit(1);
  check(`${role}: authorized academic catalog reference`, !catalogError);

  const { data: students, error: studentError } = await client
    .from("student_profiles").select("id,user_id").limit(20);
  if (role === "student") {
    check("student: personal student record only",
      !studentError && students?.length === 1 && students[0].user_id === account.id);
  } else if (role === "registrar") {
    check("registrar: permitted enrollment student reference",
      !studentError && students?.length > 0);
  } else {
    check(`${role}: full student profiles prohibited`,
      !studentError && students?.length === 0);
  }

  const { data: references, error: referenceError } = await client.rpc(
    "coordinator_student_references", { p_program_code: "BSIT" });
  if (role === "academic-coordinator") {
    check("coordinator: scoped student reference RPC",
      !referenceError && Array.isArray(references));
  } else {
    check(`${role}: coordinator student reference RPC forbidden`,
      referenceError?.code === "42501");
  }

  if (role === "academic-coordinator") {
    const { data, error } = await client.rpc("manage_curriculum_version", {
      p_code: "__PHASE3B_NONEXISTENT__",
      p_action: "VALIDATE",
    });
    check("coordinator: authorized read-only curriculum validation path",
      !error && data?.ok === false);
  } else {
    const { error } = await client.rpc("save_academic_block", {
      p_id: null, p_term_id: null, p_code: "NOT_A_BLOCK",
      p_program_code: "NONEXISTENT", p_curriculum_code: "NONEXISTENT",
      p_year_level: 1, p_section_letter: "Z", p_capacity: 1,
      p_major_name: null,
    });
    check(`${role}: Coordinator mutation rejected before validation`,
      error?.code === "42501");
  }
  await client.auth.signOut();
}

if (failures) {
  console.error(`${failures} four-role acceptance check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("Read-only four-role role-mapping and security checks passed.");
  console.log("This does NOT validate mutable CRUD, browser E2E or race conditions.");
}
