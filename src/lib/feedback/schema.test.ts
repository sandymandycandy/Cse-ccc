import { describe, it, expect } from "vitest";
import { FeedbackSchema } from "./schema";

const valid = {
  vtu: "vtu12345",
  studentName: "Asha R",
  clubId: "11111111-1111-4111-8111-111111111111",
  clubRating: 4,
  activities: "Good sessions this month.",
};

describe("FeedbackSchema", () => {
  it("accepts the minimal required payload", () => {
    const r = FeedbackSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("defaults the optional text fields to empty strings", () => {
    const r = FeedbackSchema.parse(valid);
    expect(r.headComment).toBe("");
    expect(r.suggestions).toBe("");
  });

  it("leaves absent leader ratings null", () => {
    const r = FeedbackSchema.parse(valid);
    expect(r.headRating).toBeNull();
    expect(r.viceRating).toBeNull();
  });

  it("allows a comment with no rating", () => {
    const r = FeedbackSchema.safeParse({ ...valid, headComment: "Very approachable." });
    expect(r.success).toBe(true);
  });

  it("allows a rating with no comment", () => {
    const r = FeedbackSchema.safeParse({ ...valid, headRating: 5 });
    expect(r.success).toBe(true);
  });

  it("rejects a rating outside 1..5", () => {
    expect(FeedbackSchema.safeParse({ ...valid, clubRating: 6 }).success).toBe(false);
    expect(FeedbackSchema.safeParse({ ...valid, clubRating: 0 }).success).toBe(false);
  });

  it("rejects a fractional rating", () => {
    expect(FeedbackSchema.safeParse({ ...valid, clubRating: 3.5 }).success).toBe(false);
  });

  it("requires activities feedback", () => {
    expect(FeedbackSchema.safeParse({ ...valid, activities: "" }).success).toBe(false);
  });

  it("rejects a non-uuid club", () => {
    expect(FeedbackSchema.safeParse({ ...valid, clubId: "coding" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(FeedbackSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });

  it("rejects a filled honeypot", () => {
    expect(FeedbackSchema.safeParse({ ...valid, website: "http://spam" }).success).toBe(false);
  });
});
