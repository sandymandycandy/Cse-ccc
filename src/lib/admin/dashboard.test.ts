import { describe, it, expect } from "vitest";
import {
  buildDocket,
  glanceTiles,
  type DashboardReach,
  docketSummary,
  quickActions,
  type DocketItem,
  type DashboardSignals,
} from "./dashboard";

const NOTHING: DashboardSignals = {
  pending: 0,
  upcoming: 0,
  events: 0,
  feedbackOpen: false,
  feedbackResponses: 0,
  contactUnhandled: 0,
};

const NO_REACH: DashboardReach = {
  canEvents: false,
  canApprove: false,
  canFeedback: false,
  canContact: false,
  canContent: false,
  clubScoped: false,
};

const PRESIDENT: DashboardReach = {
  canEvents: true,
  canApprove: true,
  canFeedback: true,
  canContact: true,
  canContent: true,
  clubScoped: false,
};

const CLUB_HEAD: DashboardReach = {
  canEvents: true,
  canApprove: false,
  canFeedback: false,
  canContact: false,
  // canManage("manage:content") is false for an "own" grant with no resource.
  canContent: false,
  clubScoped: true,
};

// social_media_head: contact inbox, no events grant at all.
const SOCIAL: DashboardReach = {
  canEvents: false,
  canApprove: false,
  canFeedback: false,
  canContact: true,
  canContent: true,
  clubScoped: false,
};

const s = (over: Partial<DashboardSignals>): DashboardSignals => ({ ...NOTHING, ...over });

describe("buildDocket", () => {
  it("is empty when nothing is waiting, so the page can say so", () => {
    expect(buildDocket(NOTHING, PRESIDENT)).toEqual([]);
  });

  it("asks an approver to review, with a link", () => {
    const [row, ...rest] = buildDocket(s({ pending: 3 }), PRESIDENT);
    expect(rest).toHaveLength(0);
    expect(row.count).toBe(3);
    expect(row.tone).toBe("act");
    expect(row.href).toBe("/admin/events/approvals");
    expect(row.cta).toBe("Review");
  });

  it("tells a club head their events are with someone else, and offers no review link", () => {
    // A club head cannot approve. The same number means a different thing to
    // them: it is waiting elsewhere, not on them.
    const [row] = buildDocket(s({ pending: 2 }), CLUB_HEAD);
    expect(row.count).toBe(2);
    expect(row.tone).toBe("wait");
    expect(row.cta).toBeNull();
    expect(row.href).not.toBe("/admin/events/approvals");
  });

  it("singularises the count in the row's wording", () => {
    const [one] = buildDocket(s({ pending: 1 }), PRESIDENT);
    const [many] = buildDocket(s({ pending: 2 }), PRESIDENT);
    expect(one.text).toContain("event ");
    expect(one.text).not.toContain("events");
    expect(many.text).toContain("events");
  });

  it("surfaces unanswered contact messages to whoever holds the inbox", () => {
    const [row] = buildDocket(s({ contactUnhandled: 4 }), SOCIAL);
    expect(row.count).toBe(4);
    expect(row.href).toBe("/admin/contact");
    expect(row.tone).toBe("act");
  });

  it("surfaces feedback only once responses exist", () => {
    // An open window with nothing in it is not waiting on anyone — the quick
    // action already says the window is open.
    expect(buildDocket(s({ feedbackOpen: true }), PRESIDENT)).toEqual([]);
    const [row] = buildDocket(s({ feedbackOpen: true, feedbackResponses: 7 }), PRESIDENT);
    expect(row.count).toBe(7);
    expect(row.href).toBe("/admin/feedback");
  });

  it("orders the docket approvals, then contact, then feedback", () => {
    const rows = buildDocket(
      s({ pending: 1, contactUnhandled: 1, feedbackOpen: true, feedbackResponses: 1 }),
      PRESIDENT,
    );
    expect(rows.map((r) => r.key)).toEqual(["approvals", "contact", "feedback"]);
  });

  it("shows nothing a role cannot reach, even when the count is non-zero", () => {
    // Fail closed: a count the caller happened to fetch must never leak into a
    // docket row for a role without the grant.
    const loud = s({ pending: 9, contactUnhandled: 9, feedbackOpen: true, feedbackResponses: 9 });
    expect(buildDocket(loud, NO_REACH)).toEqual([]);
    expect(buildDocket(loud, CLUB_HEAD).map((r) => r.key)).toEqual(["approvals"]);
    expect(buildDocket(loud, SOCIAL).map((r) => r.key)).toEqual(["contact"]);
  });

  it("gives every row a distinct key", () => {
    const rows = buildDocket(
      s({ pending: 1, contactUnhandled: 1, feedbackOpen: true, feedbackResponses: 1 }),
      PRESIDENT,
    );
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe("glanceTiles", () => {
  it("shows upcoming and total events to a role with events reach", () => {
    const tiles = glanceTiles(s({ upcoming: 2, events: 12 }), PRESIDENT);
    expect(tiles.map((t) => t.n)).toEqual([2, 12]);
    expect(tiles.every((t) => t.href === "/admin/events")).toBe(true);
  });

  it("names the total by the role's actual reach", () => {
    expect(glanceTiles(s({ events: 5 }), PRESIDENT)[1].label).toBe("All events");
    expect(glanceTiles(s({ events: 5 }), CLUB_HEAD)[1].label).toBe("Your club's events");
  });

  it("shows no event tiles to a role with no events grant", () => {
    // docs_head / social_media_head land on /admin but hold no manage:events.
    // Counting events at them is noise they cannot act on.
    expect(glanceTiles(s({ upcoming: 3, events: 12 }), SOCIAL)).toEqual([]);
  });

  it("keeps a zero tile rather than hiding it, so the count stays legible", () => {
    // "0 upcoming events" is information. An absent tile is not.
    const tiles = glanceTiles(NOTHING, PRESIDENT);
    expect(tiles.map((t) => t.n)).toEqual([0, 0]);
  });

  it("does not repeat the pending count already on the docket", () => {
    const tiles = glanceTiles(s({ pending: 3, upcoming: 1, events: 4 }), PRESIDENT);
    expect(tiles.map((t) => t.label)).not.toContain("Pending approval");
  });
});

describe("docketSummary", () => {
  const act = (key: string): DocketItem => ({
    key,
    count: 1,
    text: "x",
    tone: "act",
    href: "/x",
    cta: "Go",
  });
  const wait = (key: string): DocketItem => ({ ...act(key), tone: "wait", cta: null });

  it("says so plainly when nothing needs the reader", () => {
    expect(docketSummary([])).toBe("Nothing needs your attention right now.");
  });

  it("counts only what is waiting on the READER, not on someone else", () => {
    // A club head's pending events are a `wait` row — real information, but not
    // a task for them. Counting it would send them looking for work to do.
    expect(docketSummary([wait("approvals")])).toBe("Nothing needs your attention right now.");
  });

  it("agrees the verb with the count", () => {
    expect(docketSummary([act("a")])).toBe("1 thing needs your attention.");
    expect(docketSummary([act("a"), act("b")])).toBe("2 things need your attention.");
  });

  it("counts rows, not the numbers inside them", () => {
    // Two rows of 9 each is still two things to go and deal with.
    const nine = { ...act("a"), count: 9 };
    expect(docketSummary([nine, { ...nine, key: "b" }])).toBe("2 things need your attention.");
  });
});

describe("quickActions", () => {
  it("leads with Create event for a role that runs events", () => {
    const [first] = quickActions(PRESIDENT);
    expect(first.label).toBe("Create event");
    expect(first.primary).toBe(true);
  });

  it("offers the content action to whoever holds content, alongside events", () => {
    expect(quickActions(PRESIDENT).map((a) => a.key)).toEqual(["event", "announcement"]);
  });

  it("promotes the content action when there is no event action to lead", () => {
    // social_media_head holds content but no events grant.
    const actions = quickActions(SOCIAL);
    expect(actions.map((a) => a.key)).toEqual(["announcement"]);
    expect(actions[0].primary).toBe(true);
  });

  it("marks exactly one action primary", () => {
    for (const reach of [PRESIDENT, SOCIAL, CLUB_HEAD]) {
      const actions = quickActions(reach);
      expect(actions.filter((a) => a.primary).length).toBeLessThanOrEqual(1);
    }
  });

  it("is empty for a role that can start nothing, so the block can be hidden", () => {
    // docs_head holds manage:resources alone and still lands on /admin. An
    // empty "Quick actions" heading is worse than no heading.
    expect(quickActions(NO_REACH)).toEqual([]);
  });

  it("never points at a page the role cannot open", () => {
    expect(quickActions(CLUB_HEAD).map((a) => a.href)).toEqual(["/admin/events/new"]);
  });
});
