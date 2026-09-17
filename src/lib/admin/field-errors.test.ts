import { describe, expect, it } from "vitest";
import { toFieldErrors, visibleFieldErrors } from "./field-errors";

describe("toFieldErrors", () => {
  it("files each complaint under the field it is about", () => {
    expect(
      toFieldErrors([
        { path: ["subject"], message: "Give it a subject." },
        { path: ["message"], message: "Write a message." },
      ]),
    ).toEqual({ subject: "Give it a subject.", message: "Write a message." });
  });

  // A field can fail two rules at once. The first is the one to act on, and
  // stacking both under one input just makes it harder to read.
  it("keeps the first complaint per field", () => {
    expect(
      toFieldErrors([
        { path: ["subject"], message: "Too short." },
        { path: ["subject"], message: "Also wrong." },
      ]),
    ).toEqual({ subject: "Too short." });
  });

  it("uses the top-level field for a nested path", () => {
    expect(toFieldErrors([{ path: ["link", 0, "href"], message: "Bad URL." }])).toEqual({
      link: "Bad URL.",
    });
  });

  // A whole-form issue has no field to sit under; it belongs in the banner, and
  // silently filing it under "" would hide it entirely.
  it("ignores an issue with no path", () => {
    expect(toFieldErrors([{ path: [], message: "Form is wrong." }])).toEqual({});
  });

  it("is empty for no issues", () => {
    expect(toFieldErrors([])).toEqual({});
  });
});

describe("visibleFieldErrors", () => {
  const visible = ["password", "totp"];
  const FALLBACK = "That link has expired. Ask for a new one.";

  it("shows complaints about fields the form actually renders", () => {
    expect(
      visibleFieldErrors([{ path: ["password"], message: "Too short." }], visible, FALLBACK),
    ).toEqual({ fieldErrors: { password: "Too short." } });
  });

  /**
   * ⚠️ The case this exists for. A complaint about a hidden `token` has no
   * input to sit under; without the fallback the form would refuse to submit
   * and say nothing at all about why.
   */
  it("falls back to a banner when the only bad field is hidden", () => {
    expect(
      visibleFieldErrors([{ path: ["token"], message: "Required" }], visible, FALLBACK),
    ).toEqual({ error: FALLBACK });
  });

  it("shows both when a visible and a hidden field are each wrong", () => {
    expect(
      visibleFieldErrors(
        [
          { path: ["totp"], message: "Enter the 6-digit code." },
          { path: ["secret"], message: "Required" },
        ],
        visible,
        FALLBACK,
      ),
    ).toEqual({ fieldErrors: { totp: "Enter the 6-digit code." }, error: FALLBACK });
  });

  it("treats a whole-form issue as a banner", () => {
    expect(
      visibleFieldErrors(
        [
          { path: ["password"], message: "Too short." },
          { path: [], message: "Form is wrong." },
        ],
        visible,
        FALLBACK,
      ),
    ).toEqual({ fieldErrors: { password: "Too short." }, error: FALLBACK });
  });
});
