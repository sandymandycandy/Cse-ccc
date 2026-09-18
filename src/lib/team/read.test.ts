import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const from = vi.fn();
/**
 * Simulates an unreachable client. Thrown from plain code on purpose, NOT from
 * `from.mockImplementation(() => { throw })`: with mockReset() in a hook,
 * vitest 4 reports a vi.fn's thrown error as a test failure even when the code
 * under test caught it. Verified 2026-09-18 — the SUT had caught it and
 * returned normally, and the test still failed.
 */
let fail: Error | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (...a: unknown[]) => {
      if (fail) throw fail;
      return from(...a);
    },
  }),
}));

const { getTeamProfileRows } = await import("./read");

const select = (result: unknown) => ({ select: vi.fn().mockResolvedValue(result) });

beforeEach(() => {
  from.mockReset();
  fail = null;
});

describe("getTeamProfileRows", () => {
  it("maps snake_case columns to the camelCase row shape", async () => {
    from.mockReturnValue(
      select({
        data: [
          {
            member_id: "a-person",
            name: "A",
            role: "Head",
            year: "III",
            department: "CSE",
            email: "a@b.c",
            description: null,
            portfolio: null,
            photo_path: "p.jpg",
            photo_width: 800,
            photo_height: 1000,
            photo_blur: "data:x",
            focal_x: 40,
            focal_y: 30,
          },
        ],
        error: null,
      }),
    );
    const [r] = await getTeamProfileRows();
    expect(r).toEqual({
      memberId: "a-person",
      name: "A",
      role: "Head",
      year: "III",
      department: "CSE",
      email: "a@b.c",
      description: null,
      portfolio: null,
      photoPath: "p.jpg",
      photoWidth: 800,
      photoHeight: 1000,
      photoBlur: "data:x",
      focalX: 40,
      focalY: 30,
    });
    expect(from).toHaveBeenCalledWith("team_profiles");
  });

  // The resilience property. /team must render from src/data/ccc.ts when the
  // database is unreachable, rather than going blank or throwing.
  it("returns [] when the query errors, and does not throw", async () => {
    from.mockReturnValue(select({ data: null, error: { message: "boom" } }));
    await expect(getTeamProfileRows()).resolves.toEqual([]);
  });

  it("returns [] when the client itself throws", async () => {
    fail = new Error("no connection");
    await expect(getTeamProfileRows()).resolves.toEqual([]);
  });
});
