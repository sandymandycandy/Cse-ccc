import { describe, it, expect } from "vitest";
import { validateFeedbackDraft, type FeedbackDraft } from "./form-validation";

const ok: FeedbackDraft = {
  vtu: "vtu12345",
  studentName: "Asha R",
  clubId: "11111111-1111-4111-8111-111111111111",
  clubRating: 4,
  activities: "The sessions have been genuinely useful.",
};

describe("validateFeedbackDraft", () => {
  it("passes a complete draft", () => {
    expect(validateFeedbackDraft(ok)).toEqual({});
  });

  it("catches every missing required field at once, so one pass fixes them all", () => {
    const errors = validateFeedbackDraft({
      vtu: "",
      studentName: "",
      clubId: "",
      clubRating: null,
      activities: "",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "activities",
      "clubId",
      "clubRating",
      "studentName",
      "vtu",
    ]);
  });

  it("tells the reader what to do, not what is wrong", () => {
    const errors = validateFeedbackDraft({ ...ok, clubId: "" });
    // Copy rule: an error names the fix, never just the failure.
    expect(errors.clubId).toMatch(/choose/i);
  });

  it("trims before measuring, so whitespace is not an answer", () => {
    expect(validateFeedbackDraft({ ...ok, studentName: "   " }).studentName).toBeDefined();
    expect(validateFeedbackDraft({ ...ok, activities: "    " }).activities).toBeDefined();
  });

  it("mirrors the server's bounds so the two cannot disagree", () => {
    expect(validateFeedbackDraft({ ...ok, vtu: "ab" }).vtu).toBeDefined(); // min 3
    expect(validateFeedbackDraft({ ...ok, vtu: "a".repeat(21) }).vtu).toBeDefined(); // max 20
    expect(validateFeedbackDraft({ ...ok, studentName: "A" }).studentName).toBeDefined(); // min 2
    expect(validateFeedbackDraft({ ...ok, activities: "four" }).activities).toBeDefined(); // min 5
  });

  it("accepts the exact boundary values", () => {
    expect(validateFeedbackDraft({ ...ok, vtu: "abc" })).toEqual({});
    expect(validateFeedbackDraft({ ...ok, studentName: "Al" })).toEqual({});
    expect(validateFeedbackDraft({ ...ok, activities: "12345" })).toEqual({});
  });

  it("requires a club rating but never a leader rating", () => {
    expect(validateFeedbackDraft({ ...ok, clubRating: null }).clubRating).toBeDefined();
    // Leader ratings are optional by design — no opinion is a valid answer.
    expect(validateFeedbackDraft({ ...ok, headRating: null, viceRating: null })).toEqual({});
  });
});
