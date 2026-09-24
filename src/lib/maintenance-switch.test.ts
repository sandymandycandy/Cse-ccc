import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSwitchReader,
  fetchMaintenanceSwitch,
  SWITCH_TTL_MS,
  SWITCH_TIMEOUT_MS,
} from "./maintenance-switch";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("createSwitchReader", () => {
  it("reads once and serves the cached value inside the TTL", async () => {
    const c = clock();
    const fetcher = vi.fn().mockResolvedValue(true);
    const read = createSwitchReader(fetcher, c.now);
    expect(await read()).toBe(true);
    c.advance(SWITCH_TTL_MS - 1);
    expect(await read()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-reads after the TTL so a flip lands within ~10 s", async () => {
    const c = clock();
    const fetcher = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const read = createSwitchReader(fetcher, c.now);
    await read();
    c.advance(SWITCH_TTL_MS);
    expect(await read()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good value when a later read fails", async () => {
    const c = clock();
    const fetcher = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("down"));
    const read = createSwitchReader(fetcher, c.now);
    await read();
    c.advance(SWITCH_TTL_MS);
    expect(await read()).toBe(true);
  });

  it("returns null when it has never read a value", async () => {
    const read = createSwitchReader(vi.fn().mockRejectedValue(new Error("down")), clock().now);
    expect(await read()).toBeNull();
  });

  // A dead database must not be hit (and waited on) by every single visitor.
  it("backs off for a TTL after a failure", async () => {
    const c = clock();
    const fetcher = vi.fn().mockRejectedValue(new Error("down"));
    const read = createSwitchReader(fetcher, c.now);
    await read();
    c.advance(SWITCH_TTL_MS - 1);
    await read();
    expect(fetcher).toHaveBeenCalledTimes(1);
    c.advance(1);
    await read();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight read between concurrent callers", async () => {
    let resolve!: (v: boolean) => void;
    const fetcher = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    const read = createSwitchReader(fetcher, clock().now);
    const a = read();
    const b = read();
    resolve(true);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("fetchMaintenanceSwitch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stub(response: Response | Error) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const f = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
    vi.stubGlobal("fetch", f);
    return f;
  }

  it("reads the single row with the anon key only", async () => {
    const f = stub(new Response(JSON.stringify([{ maintenance: true }]), { status: 200 }));
    expect(await fetchMaintenanceSwitch()).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://db.test/rest/v1/site_settings?select=maintenance&id=eq.true");
    expect(init.headers).toEqual({ apikey: "anon-key" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on an HTTP error, a missing row, or a non-boolean", async () => {
    stub(new Response("nope", { status: 404 }));
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
    stub(new Response("[]", { status: 200 }));
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
    stub(new Response(JSON.stringify([{ maintenance: "yes" }]), { status: 200 }));
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
  });

  it("throws when the Supabase env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
  });

  it("uses a 1.5 s timeout", () => {
    expect(SWITCH_TIMEOUT_MS).toBe(1_500);
  });
});
