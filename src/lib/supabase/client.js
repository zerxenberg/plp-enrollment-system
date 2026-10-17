
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

// Reuse the SSR-compatible browser session for the Academic Coordinator
// live data layer and the shared authentication workflows.
export const supabase = createClient();
