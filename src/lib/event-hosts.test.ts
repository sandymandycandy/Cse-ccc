import { describe, expect, it } from "vitest";
import { hostLabel, hostedByLine, orderHosts } from "./event-hosts";

describe("orderHosts", () => {
  it("puts the primary first and keeps the co-hosts in the order given", () => {
    expect(
      orderHosts([
        { is_primary: false, clubs: { name: "AI Forge" } },
        { is_primary: true, clubs: { name: "Coding Club" } },
        { is_primary: false, clubs: { name: "Yoga Club" } },
      ]).map((c) => c.name),
    ).toEqual(["Coding Club", "AI Forge", "Yoga Club"]);
  });

  it("keeps the order when no row is marked primary, so the first row stands in", () => {
    expect(
      orderHosts([
        { is_primary: false, clubs: { name: "A" } },
        { is_primary: false, clubs: { name: "B" } },
      ]).map((c) => c.name),
    ).toEqual(["A", "B"]);
  });

  it("skips a link whose embedded club came back null", () => {
    expect(
      orderHosts([
        { is_primary: true, clubs: null },
        { is_primary: false, clubs: { name: "B" } },
      ]).map((c) => c.name),
    ).toEqual(["B"]);
  });

  it("is empty for no links", () => {
    expect(orderHosts([])).toEqual([]);
    expect(orderHosts(null)).toEqual([]);
  });
});

describe("hostLabel", () => {
  it("is the club alone for one host", () => {
    expect(hostLabel(["Coding"])).toBe("Coding");
  });

  it("joins two hosts, primary first", () => {
    expect(hostLabel(["Coding", "Ai Forge"])).toBe("Coding × Ai Forge");
  });

  it("joins three", () => {
    expect(hostLabel(["Coding", "Ai Forge", "Yoga"])).toBe("Coding × Ai Forge × Yoga");
  });

  it("preserves the order it is given", () => {
    expect(hostLabel(["Ai Forge", "Coding"])).toBe("Ai Forge × Coding");
  });

  it("is empty for no hosts, so callers keep their own fallback", () => {
    expect(hostLabel([])).toBe("");
  });
});

describe("hostedByLine", () => {
  it("says nothing for one host or none, because the club name is already on the page", () => {
    expect(hostedByLine(["Coding"])).toBeNull();
    expect(hostedByLine([])).toBeNull();
  });

  it("names the owner and its co-host", () => {
    expect(hostedByLine(["Coding", "Ai Forge"])).toBe("Hosted by Coding with Ai Forge");
  });

  it("lists several co-hosts in plain English", () => {
    expect(hostedByLine(["Coding", "Ai Forge", "Yoga"])).toBe("Hosted by Coding with Ai Forge and Yoga");
    expect(hostedByLine(["A", "B", "C", "D"])).toBe("Hosted by A with B, C and D");
  });
});
