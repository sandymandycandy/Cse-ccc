import { describe, it, expect, afterEach } from "vitest";
import { siteOrigin } from "./site-origin";

const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("siteOrigin", () => {
  it("returns the configured origin, dropping any path", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://cse-ccc.vercel.app/some/path";
    expect(siteOrigin()).toBe("https://cse-ccc.vercel.app");
  });

  it("returns null when unset — callers must fail closed", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteOrigin()).toBeNull();
  });

  it("returns null when blank, which is how the env regresses in practice", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(siteOrigin()).toBeNull();
  });

  it("returns null for a malformed value rather than guessing", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a url";
    expect(siteOrigin()).toBeNull();
  });
});
