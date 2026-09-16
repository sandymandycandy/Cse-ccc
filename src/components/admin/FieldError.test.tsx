import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldError, fieldClass, fieldProps } from "./FieldError";

describe("FieldError", () => {
  const errors = { subject: "Give it a subject — at least 3 characters." };

  it("renders the complaint for its own field", () => {
    const html = renderToStaticMarkup(<FieldError errors={errors} name="subject" />);
    expect(html).toContain("Give it a subject");
    expect(html).toContain('role="alert"');
  });

  // Forms put one under every input unconditionally, so the quiet case has to
  // render nothing at all rather than an empty element taking up space.
  it("renders nothing for a field that is fine", () => {
    expect(renderToStaticMarkup(<FieldError errors={errors} name="message" />)).toBe("");
    expect(renderToStaticMarkup(<FieldError name="subject" />)).toBe("");
  });

  it("ties the message to its input for assistive tech", () => {
    const html = renderToStaticMarkup(<FieldError errors={errors} name="subject" />);
    expect(html).toContain('id="subject-err"');
    expect(fieldProps(errors, "subject")).toEqual({
      "aria-invalid": true,
      "aria-describedby": "subject-err",
    });
  });

  it("adds nothing to an input that is fine", () => {
    expect(fieldProps(errors, "message")).toEqual({});
    expect(fieldProps(undefined, "subject")).toEqual({});
  });

  // `.field.err` is what turns the border and the text rust.
  it("marks the wrapping field so the design system colours it", () => {
    expect(fieldClass(errors, "subject")).toBe("field err");
    expect(fieldClass(errors, "message")).toBe("field");
    expect(fieldClass(errors, "subject", "field cf-row")).toBe("field cf-row err");
  });
});
