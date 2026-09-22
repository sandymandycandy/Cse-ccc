import { describe, expect, it } from "vitest";
import { groupLinkFor, isGroupLink } from "./whatsapp";

describe("isGroupLink", () => {
  it("accepts an https WhatsApp invite", () => {
    expect(isGroupLink("https://chat.whatsapp.com/ABCdef123")).toBe(true);
  });

  it("accepts any other https link, so a club can use a different group", () => {
    expect(isGroupLink("https://t.me/somegroup")).toBe(true);
  });

  it("rejects plain http — an invite must not travel in the clear", () => {
    expect(isGroupLink("http://chat.whatsapp.com/ABCdef123")).toBe(false);
  });

  it("rejects a javascript: payload", () => {
    expect(isGroupLink("javascript:alert(1)")).toBe(false);
  });

  it("rejects a bare domain with no scheme", () => {
    expect(isGroupLink("chat.whatsapp.com/ABCdef123")).toBe(false);
  });

  it("rejects the empty string and blanks", () => {
    expect(isGroupLink("")).toBe(false);
    expect(isGroupLink("   ")).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(isGroupLink(null)).toBe(false);
    expect(isGroupLink(42)).toBe(false);
  });

  it("rejects a link longer than the column allows", () => {
    expect(isGroupLink(`https://chat.whatsapp.com/${"x".repeat(300)}`)).toBe(false);
  });

  it("rejects a link with whitespace in it", () => {
    expect(isGroupLink("https://chat.whatsapp.com/A BC")).toBe(false);
  });
});

describe("groupLinkFor", () => {
  const link = "https://chat.whatsapp.com/ABCdef123";

  it("offers the group to a confirmed seat", () => {
    expect(groupLinkFor("registered", link)).toBe(link);
  });

  it("offers the group to a shortlist application", () => {
    expect(groupLinkFor("submitted", link)).toBe(link);
  });

  it("offers the group to a waitlisted entry", () => {
    expect(groupLinkFor("waitlisted", link)).toBe(link);
  });

  it("offers nothing on a duplicate — they were already given it", () => {
    expect(groupLinkFor("duplicate", link)).toBeNull();
  });

  it("offers nothing when registration did not land", () => {
    expect(groupLinkFor("full", link)).toBeNull();
    expect(groupLinkFor("closed", link)).toBeNull();
  });

  it("offers nothing when the event has no link", () => {
    expect(groupLinkFor("registered", null)).toBeNull();
    expect(groupLinkFor("registered", "")).toBeNull();
  });

  it("refuses a stored link that is not safe to hand out", () => {
    expect(groupLinkFor("registered", "http://chat.whatsapp.com/x")).toBeNull();
  });

  it("trims a stored link before handing it out", () => {
    expect(groupLinkFor("registered", `  ${link}  `)).toBe(link);
  });
});
