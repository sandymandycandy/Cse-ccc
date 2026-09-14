import { describe, it, expect } from "vitest";
import { isAnnouncementLive, pickHeroAnnouncement, type HeroCandidate } from "./hero";

/** A candidate carrying an extra field, to prove the picker returns the row itself. */
interface Row extends HeroCandidate {
  slug: string;
}

const a = (slug: string, publishedAt: string, expiresAt: string | null = null): Row => ({
  slug,
  publishedAt,
  expiresAt,
});

const NOW = new Date("2026-09-14T12:00:00Z");

describe("pickHeroAnnouncement", () => {
  it("returns null when there are no announcements", () => {
    expect(pickHeroAnnouncement([], NOW)).toBeNull();
  });

  it("returns the only announcement when it has no expiry", () => {
    const only = a("ganesh", "2026-09-13T17:11:58Z");
    expect(pickHeroAnnouncement([only], NOW)).toBe(only);
  });

  it("returns the newest by publishedAt, not the first in the list", () => {
    const older = a("older", "2026-09-01T00:00:00Z");
    const newer = a("newer", "2026-09-13T00:00:00Z");
    expect(pickHeroAnnouncement([older, newer], NOW)?.slug).toBe("newer");
  });

  it("skips an announcement whose expiry has passed", () => {
    const expired = a("expired", "2026-09-13T00:00:00Z", "2026-09-14T09:00:00Z");
    expect(pickHeroAnnouncement([expired], NOW)).toBeNull();
  });

  it("keeps an announcement whose expiry is still in the future", () => {
    const live = a("live", "2026-09-13T00:00:00Z", "2026-09-15T00:00:00Z");
    expect(pickHeroAnnouncement([live], NOW)?.slug).toBe("live");
  });

  it("treats an expiry exactly at now as already expired", () => {
    const boundary = a("boundary", "2026-09-13T00:00:00Z", "2026-09-14T12:00:00Z");
    expect(pickHeroAnnouncement([boundary], NOW)).toBeNull();
  });

  it("falls through to an older live announcement when the newest has expired", () => {
    const expiredNewest = a("newest", "2026-09-13T00:00:00Z", "2026-09-14T09:00:00Z");
    const olderLive = a("older", "2026-09-10T00:00:00Z");
    expect(pickHeroAnnouncement([expiredNewest, olderLive], NOW)?.slug).toBe("older");
  });

  it("treats a null expiry as never expiring, even against a newer expired one", () => {
    const forever = a("forever", "2026-01-01T00:00:00Z", null);
    const expired = a("expired", "2026-09-13T00:00:00Z", "2026-09-14T09:00:00Z");
    expect(pickHeroAnnouncement([expired, forever], NOW)?.slug).toBe("forever");
  });

  it("returns null when every announcement has expired", () => {
    const rows = [
      a("one", "2026-09-13T00:00:00Z", "2026-09-14T09:00:00Z"),
      a("two", "2026-09-12T00:00:00Z", "2026-09-13T00:00:00Z"),
    ];
    expect(pickHeroAnnouncement(rows, NOW)).toBeNull();
  });

  it("ignores an unparseable expiry rather than hiding the announcement", () => {
    const odd = a("odd", "2026-09-13T00:00:00Z", "not-a-date");
    expect(pickHeroAnnouncement([odd], NOW)?.slug).toBe("odd");
  });
});

describe("isAnnouncementLive", () => {
  it("is true when there is no expiry", () => {
    expect(isAnnouncementLive(null, NOW)).toBe(true);
  });

  it("is true when the expiry is in the future", () => {
    expect(isAnnouncementLive("2026-09-15T00:00:00Z", NOW)).toBe(true);
  });

  it("is false when the expiry has passed", () => {
    expect(isAnnouncementLive("2026-09-14T09:00:00Z", NOW)).toBe(false);
  });

  it("is false at the exact expiry instant", () => {
    expect(isAnnouncementLive("2026-09-14T12:00:00Z", NOW)).toBe(false);
  });

  it("is true for an unparseable expiry, so bad data cannot hide a notice", () => {
    expect(isAnnouncementLive("not-a-date", NOW)).toBe(true);
  });
});
