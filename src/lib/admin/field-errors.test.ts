import { describe, expect, it } from "vitest";
import { toFieldErrors } from "./field-errors";

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
