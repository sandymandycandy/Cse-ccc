import { describe, expect, it } from "vitest";
import type { AdminIdentity, Capability } from "@/lib/auth/capabilities";
import {
  NO_HOSTS,
  canCancelEvent,
  canManageEvent,
  canSetPrimary,
  canViewEvent,
  cohostIdsOf,
  hostsForCopy,
  hostsFromLinks,
  isEmptyPlan,
  normalizeCohosts,
  planHostChanges,
  type EventHosts,
} from "./event-hosts";

// Coding owns the event and AI Forge co-hosts it. Yoga has nothing to do with it.
const CODING = "club-coding";
const FORGE = "club-forge";
const YOGA = "club-yoga";
const cohosted: EventHosts = { primaryClubId: CODING, clubIds: [CODING, FORGE] };

const codingHead: AdminIdentity = { role: "club_head", clubId: CODING };
const forgeHead: AdminIdentity = { role: "club_head", clubId: FORGE };
const forgeVice: AdminIdentity = { role: "vice_head", clubId: FORGE };
const yogaHead: AdminIdentity = { role: "club_head", clubId: YOGA };
const unlinkedHead: AdminIdentity = { role: "club_head", clubId: null };
const tech: AdminIdentity = { role: "tech_head", clubId: null };
const docs: AdminIdentity = { role: "docs_head", clubId: null };

// The four capabilities a co-host exercises on another club's event (spec §1).
const EVENT_CAPS: Capability[] = [
  "manage:events",
  "manage:registrations",
  "manage:results",
  "issue:participation_certificate",
];

describe("hostsFromLinks", () => {
  it("puts the primary first whatever order the rows came back in", () => {
    expect(
      hostsFromLinks([
        { club_id: FORGE, is_primary: false },
        { club_id: CODING, is_primary: true },
      ]),
    ).toEqual({ primaryClubId: CODING, clubIds: [CODING, FORGE] });
  });

  it("falls back to the first row when none is marked primary, as every read site did", () => {
    expect(hostsFromLinks([{ club_id: YOGA, is_primary: false }])).toEqual({
      primaryClubId: YOGA,
      clubIds: [YOGA],
    });
  });

  it("returns no hosts for an event with no link rows", () => {
    expect(hostsFromLinks([])).toEqual(NO_HOSTS);
    expect(hostsFromLinks(null)).toEqual(NO_HOSTS);
  });

  it("lists a club once even if it appears twice", () => {
    expect(
      hostsFromLinks([
        { club_id: CODING, is_primary: true },
        { club_id: FORGE, is_primary: false },
        { club_id: FORGE, is_primary: false },
      ]).clubIds,
    ).toEqual([CODING, FORGE]);
  });
});

describe("cohostIdsOf", () => {
  it("is every host but the primary", () => {
    expect(cohostIdsOf(cohosted)).toEqual([FORGE]);
    expect(cohostIdsOf(NO_HOSTS)).toEqual([]);
  });
});

describe("canManageEvent", () => {
  for (const cap of EVENT_CAPS) {
    describe(cap, () => {
      it("lets the primary club's head act", () => {
        expect(canManageEvent(codingHead, cap, cohosted)).toBe(true);
      });
      it("lets the co-host club's head act", () => {
        expect(canManageEvent(forgeHead, cap, cohosted)).toBe(true);
      });
      it("refuses an unrelated club's head", () => {
        expect(canManageEvent(yogaHead, cap, cohosted)).toBe(false);
      });
      it("refuses a club-scoped head with no club (fail closed)", () => {
        expect(canManageEvent(unlinkedHead, cap, cohosted)).toBe(false);
      });
      it("lets a council role act on any event", () => {
        expect(canManageEvent(tech, cap, cohosted)).toBe(true);
      });
    });
  }

  // ⚠️ The asymmetry this feature fixes, named so nobody "simplifies" it back.
  // The club-scoped event LIST matches any event_clubs row. A head who is shown
  // an event must be able to act on it, not be refused because the check only
  // looked at the primary.
  it("REGRESSION: a head whose club hosts the event but is not primary can act on it", () => {
    const hosts: EventHosts = { primaryClubId: YOGA, clubIds: [YOGA, FORGE] };
    expect(canManageEvent(forgeHead, "manage:events", hosts)).toBe(true);
  });

  it("gives a vice head exactly the grants the matrix gives them", () => {
    expect(canManageEvent(forgeVice, "manage:events", cohosted)).toBe(true);
    expect(canManageEvent(forgeVice, "issue:participation_certificate", cohosted)).toBe(false);
  });

  it("refuses a role with no grant, co-host or not", () => {
    expect(canManageEvent(docs, "manage:events", cohosted)).toBe(false);
  });

  it("refuses club-scoped heads on an event with no hosts, but not the council", () => {
    expect(canManageEvent(codingHead, "manage:events", NO_HOSTS)).toBe(false);
    expect(canManageEvent(tech, "manage:events", NO_HOSTS)).toBe(true);
  });

  it("still matches the primary if a caller built hosts without listing it", () => {
    expect(
      canManageEvent(codingHead, "manage:events", { primaryClubId: CODING, clubIds: [] }),
    ).toBe(true);
  });
});

describe("canViewEvent", () => {
  it("shows a co-host's head the event", () => {
    expect(canViewEvent(forgeHead, "manage:registrations", cohosted)).toBe(true);
  });

  it("hides it from an unrelated club and from a head with no club", () => {
    expect(canViewEvent(yogaHead, "manage:registrations", cohosted)).toBe(false);
    expect(canViewEvent(unlinkedHead, "manage:registrations", cohosted)).toBe(false);
  });

  it("shows a council role any event", () => {
    expect(canViewEvent(tech, "manage:results", cohosted)).toBe(true);
  });

  it("lets a read grant see without managing", () => {
    // The President holds view:audit as "read", the one read grant in the matrix.
    const president: AdminIdentity = { role: "president", clubId: null };
    expect(canViewEvent(president, "view:audit", cohosted)).toBe(true);
    expect(canManageEvent(president, "view:audit", cohosted)).toBe(false);
  });

  it("refuses a role with no grant", () => {
    expect(canViewEvent(docs, "manage:registrations", cohosted)).toBe(false);
  });
});

describe("canCancelEvent", () => {
  it("lets the primary club's head cancel", () => {
    expect(canCancelEvent(codingHead, cohosted)).toBe(true);
  });

  it("does NOT let a co-host's head cancel", () => {
    expect(canCancelEvent(forgeHead, cohosted)).toBe(false);
  });

  it("lets the council cancel", () => {
    expect(canCancelEvent(tech, cohosted)).toBe(true);
  });

  it("never lets a vice head cancel, even their own club's event", () => {
    const codingVice: AdminIdentity = { role: "vice_head", clubId: CODING };
    expect(canCancelEvent(codingVice, cohosted)).toBe(false);
  });

  it("refuses a head with no club, and any club-scoped head on an event with no hosts", () => {
    expect(canCancelEvent(unlinkedHead, cohosted)).toBe(false);
    expect(canCancelEvent(codingHead, NO_HOSTS)).toBe(false);
  });
});

describe("canSetPrimary", () => {
  it("lets the current primary club's head reassign", () => {
    expect(canSetPrimary(codingHead, cohosted)).toBe(true);
  });

  // ⚠️ Otherwise a co-host could take the primary and lock the owner out of cancelling.
  it("does NOT let a co-host's head reassign", () => {
    expect(canSetPrimary(forgeHead, cohosted)).toBe(false);
  });

  it("refuses an unrelated head and allows the council", () => {
    expect(canSetPrimary(yogaHead, cohosted)).toBe(false);
    expect(canSetPrimary(tech, cohosted)).toBe(true);
  });
});

describe("normalizeCohosts", () => {
  it("drops the primary, blanks and repeats, keeping the order given", () => {
    expect(normalizeCohosts(CODING, [FORGE, "", CODING, YOGA, FORGE, " "])).toEqual([FORGE, YOGA]);
  });

  it("is empty when nothing was ticked", () => {
    expect(normalizeCohosts(CODING, [])).toEqual([]);
  });
});

describe("planHostChanges", () => {
  it("inserts the primary and the co-hosts for a new event", () => {
    expect(planHostChanges(NO_HOSTS, { primaryClubId: CODING, cohostIds: [FORGE] })).toEqual({
      removeCohosts: [],
      primary: { op: "insert", clubId: CODING },
      addCohosts: [FORGE],
    });
  });

  it("does nothing when nothing changed", () => {
    expect(isEmptyPlan(planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [FORGE] }))).toBe(true);
  });

  it("adds a co-host", () => {
    expect(planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [FORGE, YOGA] })).toEqual({
      removeCohosts: [],
      primary: null,
      addCohosts: [YOGA],
    });
  });

  it("removes a co-host, including a co-host removing itself", () => {
    expect(planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [] })).toEqual({
      removeCohosts: [FORGE],
      primary: null,
      addCohosts: [],
    });
  });

  // The writer relies on this: the promoted co-host's row is deleted BEFORE the
  // primary row is repointed at it, or the (event_id, club_id) key clashes.
  it("promotes a co-host: drops its co-host row, moves the primary, keeps the old owner as co-host", () => {
    expect(planHostChanges(cohosted, { primaryClubId: FORGE, cohostIds: [CODING] })).toEqual({
      removeCohosts: [FORGE],
      primary: { op: "move", clubId: FORGE },
      addCohosts: [CODING],
    });
  });

  it("moves the primary to a new club without keeping the old one", () => {
    expect(
      planHostChanges({ primaryClubId: CODING, clubIds: [CODING] }, { primaryClubId: YOGA, cohostIds: [] }),
    ).toEqual({ removeCohosts: [], primary: { op: "move", clubId: YOGA }, addCohosts: [] });
  });

  it("never plans the primary as its own co-host", () => {
    expect(
      planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [CODING, FORGE] }).addCohosts,
    ).toEqual([]);
  });
});

describe("hostsForCopy", () => {
  it("keeps the hosts as they are for the council", () => {
    expect(hostsForCopy(tech, cohosted)).toEqual(cohosted);
  });

  it("keeps the hosts as they are for the owning club's head", () => {
    expect(hostsForCopy(codingHead, cohosted)).toEqual(cohosted);
  });

  // A club-scoped creator's own club is always the primary (spec §2), and a
  // duplicate is a creation.
  it("makes a co-host's copy their own club's, keeping the original owner as co-host", () => {
    expect(hostsForCopy(forgeHead, cohosted)).toEqual({ primaryClubId: FORGE, clubIds: [FORGE, CODING] });
    expect(hostsForCopy(forgeVice, cohosted).primaryClubId).toBe(FORGE);
  });
});
