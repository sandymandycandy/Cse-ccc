import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegistrationFormBuilder } from "./RegistrationFormBuilder";
import { defaultFormFor, type FormField } from "@/lib/registration-form/schema";

const render = (fields: FormField[]) => renderToStaticMarkup(
  <RegistrationFormBuilder initialJson={JSON.stringify(fields)} />,
);
const decode = (value: string) => value.replaceAll("&quot;", '"')
  .replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

describe("RegistrationFormBuilder", () => {
  it("submits the complete existing schema even when every question is collapsed", () => {
    const fields = defaultFormFor();
    const html = render(fields);
    const input = html.match(/<input[^>]*name="registrationForm"[^>]*>/)?.[0] ?? "";
    const value = input.match(/value="([^"]*)"/)?.[1] ?? "";
    expect(JSON.parse(decode(value))).toEqual(fields);
    expect(html.match(/<details /g)).toHaveLength(fields.length);
    expect(html).not.toMatch(/<details[^>]*\sopen=/);
  });

  it("counts section headings separately from questions and required answers", () => {
    const html = render([
      defaultFormFor()[0],
      { id: "section", kind: "section", identity: null, label: "About you", required: false },
    ]);
    expect(html).toContain("1 question");
    expect(html).toContain("1 required");
    expect(html).toContain("1 section");
    expect(html).not.toContain(" ? ");
  });

  it("keeps independent choice-option inputs, including an unfinished blank option", () => {
    const html = render([{ id: "choice", kind: "radio", identity: null, label: "Choose a session", required: false, options: ["Morning", ""] }]);
    expect(html).toContain('aria-label="Option 1 for Choose a session"');
    expect(html).toContain('aria-label="Option 2 for Choose a session"');
    expect(html).toContain("Add option");
    expect(html).not.toContain("Options (one per line)");
  });

  it("names the reorder and remove actions for assistive technology", () => {
    const html = render(defaultFormFor());
    expect(html).toContain('aria-label="Move Full name up"');
    expect(html).toContain('aria-label="Remove Full name"');
    expect(html).toContain('aria-label="Move Year down"');
  });
});
