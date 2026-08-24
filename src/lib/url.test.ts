import { describe, it, expect } from "vitest";
import { isSafeHttpUrl, isSafeLinkHref } from "./url";

describe("isSafeHttpUrl", () => {
  it("accepts http and https absolute URLs", () => {
    expect(isSafeHttpUrl("https://drive.google.com/abc")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
    expect(isSafeHttpUrl("  https://example.com/x  ")).toBe(true); // trimmed
  });

  it("rejects dangerous and non-web schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>")).toBe(false);
    expect(isSafeHttpUrl("mailto:a@b.com")).toBe(false); // not a web destination
    expect(isSafeHttpUrl("ftp://host/file")).toBe(false);
  });

  it("rejects relative paths and garbage", () => {
    expect(isSafeHttpUrl("/relative/path")).toBe(false);
    expect(isSafeHttpUrl("example.com")).toBe(false); // no scheme → not absolute
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});

describe("isSafeLinkHref", () => {
  it("accepts http, https and mailto", () => {
    expect(isSafeLinkHref("https://example.com")).toBe(true);
    expect(isSafeLinkHref("http://example.com")).toBe(true);
    expect(isSafeLinkHref("mailto:a@b.com")).toBe(true);
  });

  it("rejects javascript/data and other schemes", () => {
    expect(isSafeLinkHref("javascript:alert(1)")).toBe(false);
    expect(isSafeLinkHref("data:text/html,x")).toBe(false);
    expect(isSafeLinkHref("/relative")).toBe(false);
  });
});
