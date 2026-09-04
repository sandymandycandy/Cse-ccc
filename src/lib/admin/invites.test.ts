import { describe, it, expect } from "vitest";
import { ADMIN_LIST_SELECT } from "./invites";

/**
 * Pins the fix for a live-only outage: `/admin/users` threw PGRST201 because
 * migration 20260904000000_club_feedback added clubs.feedback_head_id and
 * clubs.feedback_vice_head_id, giving admin_users THREE foreign-key paths to
 * clubs. A bare `clubs ( … )` embed became ambiguous and PostgREST refused it.
 *
 * Nothing in typecheck, lint, the test suite or the build can catch that —
 * PostgREST resolves embeds at request time against the live schema — so this
 * test guards the shape of the select string itself. It is deliberately a
 * string assertion: the failure it prevents is someone "tidying" the FK hint
 * away, which would look like a harmless simplification and take the page down
 * again.
 */
describe("ADMIN_LIST_SELECT", () => {
  it("names the foreign key when embedding clubs", () => {
    expect(ADMIN_LIST_SELECT).toContain("clubs!admin_users_club_id_fkey");
  });

  it("never embeds clubs ambiguously", () => {
    // A bare `clubs(` / `clubs (` with no `!fk` is exactly what broke.
    expect(ADMIN_LIST_SELECT).not.toMatch(/(^|[\s,(])clubs\s*\(/);
  });

  it("still selects the column the page renders", () => {
    // The embed exists to show a club-scoped admin's club; losing short_name
    // would blank that column without failing anything else.
    expect(ADMIN_LIST_SELECT).toContain("short_name");
  });

  it("keeps the admin_totp embed, which is NOT ambiguous", () => {
    // admin_totp has a single FK to admin_users, so it needs no hint — but the
    // page's "2FA" column depends on it being embedded at all.
    expect(ADMIN_LIST_SELECT).toContain("admin_totp");
    expect(ADMIN_LIST_SELECT).toContain("confirmed_at");
  });
});
