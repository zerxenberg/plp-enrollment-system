/**
 * Read-only anonymous Supabase RLS smoke test.
 * Loads the publishable key locally without printing credentials.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z0-9_]+=/.test(line))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
  }));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Public Supabase environment variables are required.");
const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let violations = 0;
for (const table of ["app_users", "student_profiles", "academic_reviews",
  "programs", "subjects", "academic_change_history",
  "user_login_identifiers", "auth_identifier_rate_limits"]) {
  const { data, error } = await client.from(table).select("*").limit(1);
  if (error && !["42501", "PGRST301"].includes(error.code)) {
    console.log(`${table}: INCONCLUSIVE: request failed (${error.code || "unknown"})`);
    violations++;
    continue;
  }
  // Either SQL permission denied or RLS filtering all rows is correct.
  const exposed = !error && (data || []).length > 0;
  console.log(`${table}: ${exposed ? "FAIL: visible to anonymous client" : "PASS: not visible anonymously"}`);
  if (exposed) violations++;
}
if (violations > 0) process.exitCode = 1;
