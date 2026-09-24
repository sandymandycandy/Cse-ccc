// Reads the admin maintenance switch (public.site_settings) for src/proxy.ts.
//
// The proxy runs on every public request, so this must never cost a database
// round-trip per visitor or hang when the database is down:
// - each server instance caches the value for SWITCH_TTL_MS;
// - a read is abandoned after SWITCH_TIMEOUT_MS;
// - after a failure it waits a full TTL before trying again, serving the last
//   good value (or null, meaning "unknown") in between.
// It uses the anon key through PostgREST: the row is public-read by RLS, and
// the proxy should hold no more privilege than it needs.

export const SWITCH_TTL_MS = 10_000;
export const SWITCH_TIMEOUT_MS = 1_500;

export function createSwitchReader(
  fetcher: () => Promise<boolean>,
  now: () => number = Date.now,
): () => Promise<boolean | null> {
  let last: { value: boolean; at: number } | null = null;
  let failedAt: number | null = null;
  let inflight: Promise<boolean | null> | null = null;

  return function readSwitch(): Promise<boolean | null> {
    const t = now();
    if (last && t - last.at < SWITCH_TTL_MS) return Promise.resolve(last.value);
    if (failedAt !== null && t - failedAt < SWITCH_TTL_MS) {
      return Promise.resolve(last?.value ?? null);
    }
    if (!inflight) {
      inflight = fetcher()
        .then((value) => {
          last = { value, at: now() };
          failedAt = null;
          return value;
        })
        .catch((err: unknown) => {
          failedAt = now();
          console.error("maintenance switch read failed:", err instanceof Error ? err.message : err);
          return last?.value ?? null;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}

export async function fetchMaintenanceSwitch(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");

  const res = await fetch(`${url}/rest/v1/site_settings?select=maintenance&id=eq.true`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(SWITCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`site_settings read failed: HTTP ${res.status}`);

  const rows = (await res.json()) as Array<{ maintenance?: unknown }>;
  const value = rows.length === 1 ? rows[0].maintenance : undefined;
  if (typeof value !== "boolean") throw new Error("site_settings row missing or malformed");
  return value;
}

/** The instance the proxy shares for the life of the server process. */
export const getMaintenanceSwitch = createSwitchReader(fetchMaintenanceSwitch);
