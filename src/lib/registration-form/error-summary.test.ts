import { describe, expect, it } from "vitest";
import { errorSummary } from "./error-summary";
import type { FormField } from "./schema";

const fields = [
  { id: "a", kind: "short_text", label: "Team leader mobile no", required: true },
  { id: "b", kind: "team", label: "Team members", required: true },
] as FormField[];

describe("errorSummary", () => {
  it("names each field with its problem, in form order", () => {
    expect(
      errorSummary(fields, { b: "Member 1: check VTU NUMBER.", a: "Enter a 10-digit mobile number" }),
    ).toEqual([
      { id: "a", text: "Team leader mobile no: Enter a 10-digit mobile number" },
      { id: "b", text: "Team members: Member 1: check VTU NUMBER." },
    ]);
  });

  it("keeps an error for a field the page does not know, rather than hiding it", () => {
    expect(errorSummary(fields, { zz: "This field is required." })).toEqual([
      { id: "zz", text: "This field is required." },
    ]);
  });
});
