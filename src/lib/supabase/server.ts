import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  return { url, key };
}

/**
 * Cookie-aware server client (@supabase/ssr) — use where the request's session
 * matters (admin, per-student lookups). RLS applies as the anon/authenticated
 * role. Reading cookies makes the route dynamic.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = publicConfig();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only — safe to
          // ignore; session refresh happens in middleware (Phase 1).
        }
      },
    },
  });
}

/**
 * Cookieless anon client for public, read-only content (clubs, approved events,
 * announcements…). No cookies → the page stays cacheable. RLS still applies as
 * the anon role, so this can only ever see public rows.
 */
export function createPublicClient() {
  const { url, key } = publicConfig();
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
