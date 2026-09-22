import { describe, expect, it } from "vitest";
import {
  EVENT_FORM_TABS,
  capacityHint,
  dayText,
  durationText,
  firstGap,
  gapCount,
  tabGaps,
  tabForField,
  tabWithFirstError,
  type EventFormValues,
} from "./event-form-progress";

const full: EventFormValues = {
  title: "PITCH DESK",
  description: "A pitching contest.",
  venue: "Seminar Hall",
  startsAtLocal: "2026-10-01T10:00",
  endsAtLocal: "2026-10-01T13:40",
  registrationClosesAtLocal: "2026-09-30T23:59",
  fieldCount: 6,
};

describe("EVENT_FORM_TABS", () => {
  it("runs Basics → Cover, numbered for the tab strip", () => {
    expect(EVENT_FORM_TABS.map((t) => t.key)).toEqual([
      "basics",
      "when",
      "registration",
      "form",
      "cover",
    ]);
    expect(EVENT_FORM_TABS.map((t) => t.n)).toEqual(["01", "02", "03", "04", "05"]);
  });
});

describe("durationText", () => {
  it("reads hours and minutes", () => {
    expect(durationText("2026-10-01T10:00", "2026-10-01T13:40")).toBe("3 hours 40 min");
  });

  it("says one hour in the singular", () => {
    expect(durationText("2026-10-01T10:00", "2026-10-01T11:00")).toBe("1 hour");
  });

  it("drops the minutes when it lands on the hour", () => {
    expect(durationText("2026-10-01T10:00", "2026-10-01T13:00")).toBe("3 hours");
  });

  it("gives minutes alone under an hour — never '0 hours 40 min'", () => {
    expect(durationText("2026-10-01T10:00", "2026-10-01T10:40")).toBe("40 min");
  });

  it("spans midnight", () => {
    expect(durationText("2026-10-01T22:00", "2026-10-02T06:30")).toBe("8 hours 30 min");
  });

  it("refuses an end at or before the start — that is the error, not a duration", () => {
    expect(durationText("2026-10-01T13:00", "2026-10-01T10:00")).toBe("—");
    expect(durationText("2026-10-01T10:00", "2026-10-01T10:00")).toBe("—");
  });

  it("refuses a half-filled or malformed pair", () => {
    expect(durationText("", "2026-10-01T13:00")).toBe("—");
    expect(durationText("2026-10-01T10:00", "")).toBe("—");
    expect(durationText("not a date", "2026-10-01T13:00")).toBe("—");
  });
});

describe("dayText", () => {
  // Reuses istFullDate rather than adding a near-duplicate formatter, so the
  // date reads the same here as it does on the public event page.
  it("names the weekday and full date of the start", () => {
    const t = dayText("2026-10-01T10:00");
    expect(t).toContain("Thursday");
    expect(t).toContain("October");
    expect(t).toContain("2026");
  });

  it("reads the IST wall clock, not the machine's timezone", () => {
    // 00:30 IST is still the previous day in UTC — a naive parse would say Wed.
    expect(dayText("2026-10-01T00:30")).toContain("Thursday");
  });

  it("is blank when there is no valid start", () => {
    expect(dayText("")).toBe("");
    expect(dayText("nonsense")).toBe("");
  });
});

describe("tabGaps", () => {
  it("finds nothing outstanding on a complete event", () => {
    expect(tabGaps(full)).toEqual({
      basics: null,
      when: null,
      registration: null,
      form: null,
      cover: null,
    });
  });

  it("asks for a title before a description", () => {
    expect(tabGaps({ ...full, title: "  ", description: "" }).basics).toBe("a title");
  });

  it("asks for a description once the title is there", () => {
    expect(tabGaps({ ...full, description: "" }).basics).toBe("a description");
  });

  it("asks for a venue", () => {
    expect(tabGaps({ ...full, venue: "" }).when).toBe("a venue");
  });

  it("reports an impossible time range as the gap it is", () => {
    expect(tabGaps({ ...full, endsAtLocal: "2026-10-01T09:00" }).when).toBe(
      "a valid start and end",
    );
  });

  it("asks for a registration closing time", () => {
    expect(tabGaps({ ...full, registrationClosesAtLocal: "" }).registration).toBe(
      "a registration closing time",
    );
  });

  it("asks for at least one question", () => {
    expect(tabGaps({ ...full, fieldCount: 0 }).form).toBe("at least one question");
  });

  it("never blocks on the cover — an event can ship without a poster", () => {
    expect(tabGaps({ ...full, fieldCount: 0, title: "" }).cover).toBeNull();
  });
});

describe("firstGap and gapCount", () => {
  it("points at the earliest tab that needs something, in tab order", () => {
    const gaps = tabGaps({ ...full, title: "", registrationClosesAtLocal: "" });
    expect(firstGap(gaps)).toBe("basics");
    expect(gapCount(gaps)).toBe(2);
  });

  it("is null and zero when everything is done", () => {
    const gaps = tabGaps(full);
    expect(firstGap(gaps)).toBeNull();
    expect(gapCount(gaps)).toBe(0);
  });
});

describe("capacityHint", () => {
  it("says capacity is ignored in shortlist mode", () => {
    expect(capacityHint("shortlist")).toMatch(/ignored/i);
  });

  it("explains a blank capacity in seats mode", () => {
    expect(capacityHint("seats")).toMatch(/unlimited/i);
  });
});

/**
 * With five tabs, a rejected save can point at a field on a tab you cannot
 * see. The form has to open that tab, or the error message is invisible and
 * the save looks like it did nothing.
 */
describe("tabForField", () => {
  it("places every field the event action can reject", () => {
    const cases: [string, string][] = [
      ["title", "basics"],
      ["description", "basics"],
      ["clubId", "basics"],
      ["cohostIds", "basics"],
      ["venueText", "when"],
      ["startsAt", "when"],
      ["endsAt", "when"],
      ["selectionMode", "registration"],
      ["capacity", "registration"],
      ["registrationOpensAt", "registration"],
      ["registrationClosesAt", "registration"],
      ["waitlistEnabled", "registration"],
      ["showOnAchievements", "registration"],
      ["whatsappUrl", "registration"],
      ["registrationForm", "form"],
      ["image", "cover"],
    ];
    for (const [field, tab] of cases) expect(tabForField(field)).toBe(tab);
  });

  it("returns null for a field it does not know", () => {
    expect(tabForField("somethingElse")).toBeNull();
  });
});

describe("tabWithFirstError", () => {
  it("opens the earliest tab holding an error, in tab order", () => {
    expect(tabWithFirstError({ capacity: "Too big.", venueText: "Too long." })).toBe("when");
  });

  it("ignores fields it cannot place rather than guessing", () => {
    expect(tabWithFirstError({ mystery: "Nope." })).toBeNull();
  });

  it("is null when nothing was rejected", () => {
    expect(tabWithFirstError({})).toBeNull();
    expect(tabWithFirstError(undefined)).toBeNull();
  });
});
