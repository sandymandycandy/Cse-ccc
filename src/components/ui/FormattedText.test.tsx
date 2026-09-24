import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormattedText } from "./FormattedText";

describe("FormattedText", () => {
  it("makes a paragraph per blank-line block", () => {
    const html = renderToStaticMarkup(
      <FormattedText text={"AIForge Expo\n\nA one-day hackathon.\r\n\r\nPrize Pool"} />,
    );
    expect(html.match(/<p/g)).toHaveLength(3);
    expect(html).toContain("<p>A one-day hackathon.</p>");
  });

  it("keeps single line breaks inside a paragraph for pre-line to show", () => {
    const html = renderToStaticMarkup(<FormattedText text={"Date: 9 Oct\nTime: 9 AM"} />);
    expect(html).toContain("<p>Date: 9 Oct\nTime: 9 AM</p>");
  });

  it("renders nothing extra for blank runs", () => {
    const html = renderToStaticMarkup(<FormattedText text={"\n\nOne\n\n\n\n"} />);
    expect(html.match(/<p/g)).toHaveLength(1);
  });
});
