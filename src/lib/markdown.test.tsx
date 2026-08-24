import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "./markdown";

const html = (md: string) => renderToStaticMarkup(<>{renderMarkdown(md)}</>);

describe("renderMarkdown — safe subset", () => {
  it("wraps plain text in a paragraph", () => {
    expect(html("hello world")).toBe("<p>hello world</p>");
  });

  it("renders bold, italic, and inline code", () => {
    expect(html("a **b** c")).toContain("<strong>b</strong>");
    expect(html("a *b* c")).toContain("<em>b</em>");
    expect(html("a `b` c")).toContain("<code>b</code>");
  });

  it("renders headings as h2–h4 (never h1 — the page owns h1)", () => {
    expect(html("# Title")).toBe("<h2>Title</h2>");
    expect(html("## Sub")).toBe("<h3>Sub</h3>");
    expect(html("### Small")).toBe("<h4>Small</h4>");
  });

  it("renders unordered and ordered lists", () => {
    expect(html("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(html("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("renders a safe http/https/mailto link with rel+target", () => {
    const out = html("[x](https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(html("[m](mailto:a@b.com)")).toContain('href="mailto:a@b.com"');
  });

  // ── security: the whole point of not shipping raw HTML ──────────────────────

  it("escapes raw HTML instead of emitting live tags (XSS)", () => {
    const out = html("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes an <img onerror> payload", () => {
    const out = html('<img src=x onerror="alert(1)">');
    expect(out).not.toMatch(/<img[^>]*onerror/i);
    expect(out).toContain("&lt;img");
  });

  it("does NOT create an anchor for a javascript: URL — renders as inert text", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("<a "); // no anchor at all
    expect(out).not.toContain('href="javascript:'); // and never an executable href
  });

  it("does NOT create an anchor for a data: URL", () => {
    const out = html("[x](data:text/html,<script>alert(1)</script>)");
    expect(out).not.toContain("<a ");
  });
});
