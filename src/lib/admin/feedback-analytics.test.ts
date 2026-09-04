import { describe, it, expect } from "vitest";
import {
  computeFeedbackAnalytics,
  THIN_SAMPLE,
  type AnalyticsResponse,
} from "./feedback-analytics";

const r = (o: Partial<AnalyticsResponse> = {}): AnalyticsResponse => ({
  clubId: "c1",
  vtu: "vtu1",
  clubRating: 4,
  headRating: 4,
  headName: "Head One",
  viceRating: 4,
  viceName: "Vice One",
  activities: "some text",
  suggestions: "",
  createdAt: "2026-09-04T10:00:00Z",
  ...o,
});

const clubs = [
  { id: "c1", name: "Alpha" },
  { id: "c2", name: "Beta" },
  { id: "c3", name: "Gamma" },
];

const base = { clubs, previous: null, memberCount: 100, belowThreshold: 3 };

describe("computeFeedbackAnalytics — headlines", () => {
  it("handles an empty period without dividing by zero", () => {
    const a = computeFeedbackAnalytics({ ...base, responses: [] });
    expect(a.totals.responses).toBe(0);
    expect(a.totals.clubsCovered).toBe(0);
    expect(a.totals.clubAvg).toBeNull();
    expect(a.totals.reachPct).toBe(0);
  });

  it("counts responses, clubs covered and reach", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [r(), r(), r({ clubId: "c2" })],
    });
    expect(a.totals.responses).toBe(3);
    expect(a.totals.clubsCovered).toBe(2);
    expect(a.totals.clubsTotal).toBe(3);
    expect(a.totals.reachPct).toBe(3); // 3 of 100 members
  });

  it("averages each target to one decimal, ignoring nulls", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [
        r({ clubRating: 5, headRating: 4, viceRating: null }),
        r({ clubRating: 4, headRating: 3, viceRating: null }),
      ],
    });
    expect(a.totals.clubAvg).toBe(4.5);
    expect(a.totals.headAvg).toBe(3.5);
    expect(a.totals.viceAvg).toBeNull();
  });
});

describe("computeFeedbackAnalytics — distribution", () => {
  it("buckets each rating 1..5", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [r({ clubRating: 5 }), r({ clubRating: 5 }), r({ clubRating: 1 })],
    });
    expect(a.distribution.club).toEqual([1, 0, 0, 0, 2]);
  });

  it("excludes null ratings from the buckets", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [r({ headRating: null }), r({ headRating: 2 })],
    });
    expect(a.distribution.head).toEqual([0, 1, 0, 0, 0]);
  });
});

describe("computeFeedbackAnalytics — silent clubs", () => {
  it("lists clubs with no responses, by name", () => {
    const a = computeFeedbackAnalytics({ ...base, responses: [r({ clubId: "c1" })] });
    expect(a.silentClubs.map((c) => c.name)).toEqual(["Beta", "Gamma"]);
  });

  it("is empty when every club responded", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [r({ clubId: "c1" }), r({ clubId: "c2" }), r({ clubId: "c3" })],
    });
    expect(a.silentClubs).toEqual([]);
  });
});

describe("computeFeedbackAnalytics — guards (design D3)", () => {
  it("marks a club with fewer than THIN_SAMPLE responses as thin", () => {
    const a = computeFeedbackAnalytics({ ...base, responses: [r(), r()] });
    const alpha = a.clubs.find((c) => c.clubId === "c1")!;
    expect(alpha.responses).toBe(2);
    expect(alpha.thin).toBe(true);
  });

  it("does not mark a club at or above THIN_SAMPLE", () => {
    const responses = Array.from({ length: THIN_SAMPLE }, () => r());
    const a = computeFeedbackAnalytics({ ...base, responses });
    expect(a.clubs.find((c) => c.clubId === "c1")!.thin).toBe(false);
  });

  it("keeps a thin club OFF the watchlist even when its score is low", () => {
    // One furious response must never put a club on a watchlist.
    const a = computeFeedbackAnalytics({ ...base, responses: [r({ clubRating: 1 })] });
    expect(a.clubWatchlist).toEqual([]);
  });

  it("puts a low-scoring club on the watchlist once the sample is not thin", () => {
    const responses = Array.from({ length: THIN_SAMPLE }, () => r({ clubRating: 2 }));
    const a = computeFeedbackAnalytics({ ...base, responses });
    expect(a.clubWatchlist).toHaveLength(1);
    expect(a.clubWatchlist[0].responses).toBe(THIN_SAMPLE);
  });

  it("never lists a leader without a response count", () => {
    const responses = Array.from({ length: THIN_SAMPLE }, () => r({ headRating: 2 }));
    const a = computeFeedbackAnalytics({ ...base, responses });
    expect(a.leaderWatchlist[0].responses).toBe(THIN_SAMPLE);
    expect(a.leaderWatchlist[0].name).toBe("Head One");
    expect(a.leaderWatchlist[0].role).toBe("Club head");
  });

  it("keeps a thinly-rated leader off the watchlist", () => {
    const a = computeFeedbackAnalytics({ ...base, responses: [r({ headRating: 1 })] });
    expect(a.leaderWatchlist).toEqual([]);
  });

  it("counts duplicate VTUs across the period", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [r({ vtu: "a" }), r({ vtu: "A" }), r({ vtu: "b" })],
    });
    expect(a.integrity.duplicateVtus).toBe(1);
    expect(a.integrity.responsesFromDuplicates).toBe(2);
  });
});

describe("computeFeedbackAnalytics — trend", () => {
  it("is null with no previous period", () => {
    const a = computeFeedbackAnalytics({ ...base, responses: [r()] });
    expect(a.trend).toBeNull();
  });

  it("reports deltas against the previous period", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [r({ clubRating: 5 })],
      previous: { label: "12 Aug – 30 Aug", clubAvg: 4, headAvg: 3, viceAvg: null, responses: 10 },
    });
    expect(a.trend!.clubAvgDelta).toBe(1);
    expect(a.trend!.responsesDelta).toBe(-9);
    // No previous vice figure to compare against.
    expect(a.trend!.viceAvgDelta).toBeNull();
  });
});

describe("computeFeedbackAnalytics — engagement and timeline", () => {
  it("counts responses carrying free text", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [
        r({ activities: "real feedback", suggestions: "do more" }),
        r({ activities: "", suggestions: "" }),
      ],
    });
    expect(a.engagement.withSuggestions).toBe(1);
    expect(a.engagement.withActivities).toBe(1);
  });

  it("groups responses per IST day, oldest first", () => {
    const a = computeFeedbackAnalytics({
      ...base,
      responses: [
        r({ createdAt: "2026-09-04T10:00:00Z" }),
        r({ createdAt: "2026-09-04T11:00:00Z" }),
        r({ createdAt: "2026-09-03T10:00:00Z" }),
      ],
    });
    expect(a.timeline).toEqual([
      { day: "2026-09-03", count: 1 },
      { day: "2026-09-04", count: 2 },
    ]);
  });
});
