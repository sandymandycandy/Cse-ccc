import { describe, expect, it } from "vitest";
import { isLongForm, splitChoice } from "./choice-display";
import type { FormField } from "./schema";

describe("splitChoice", () => {
  it("pulls the numbered tag and the lead title out of a theme option", () => {
    expect(
      splitChoice(
        "Theme-1 - AI for Sustainability – Smart solutions for water, energy, agriculture, waste, pollution & climate.",
      ),
    ).toEqual({
      tag: "Theme-1",
      title: "AI for Sustainability",
      text: "Smart solutions for water, energy, agriculture, waste, pollution & climate.",
    });
  });

  it("keeps the body whole when there is no lead phrase", () => {
    expect(splitChoice("Theme-2 - Intelligent agents that reason, collaborate, use tools & solve tasks.")).toEqual({
      tag: "Theme-2",
      title: null,
      text: "Intelligent agents that reason, collaborate, use tools & solve tasks.",
    });
  });

  it("accepts other separators and tag shapes", () => {
    expect(splitChoice("Track 3: Web apps").tag).toBe("Track 3");
    expect(splitChoice("Problem 12 — Smart parking").tag).toBe("Problem 12");
  });

  it("does not invent a tag for a plain option", () => {
    expect(splitChoice("Yes - I agree")).toEqual({ tag: null, title: "Yes", text: "I agree" });
    expect(splitChoice("CSE")).toEqual({ tag: null, title: null, text: "CSE" });
  });
});

describe("isLongForm", () => {
  const radio = (options: string[]): FormField =>
    ({ id: "t", kind: "radio", label: "Theme", required: true, options }) as FormField;

  it("is long for a team event", () => {
    expect(isLongForm([{ id: "team", kind: "team", label: "Team", required: true } as FormField])).toBe(true);
  });

  it("is long for a question with several wordy options", () => {
    expect(isLongForm([radio(["a", "b", "c", "Theme-4 - AI for patient care, medical analysis & hospital workflows."])])).toBe(true);
  });

  it("is not long for the default form or short options", () => {
    expect(isLongForm(null)).toBe(false);
    expect(isLongForm([radio(["1", "2", "3", "4", "5"])])).toBe(false);
  });
});
