import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_STYLE, assetKey, type AssetRef, type Design } from "@/lib/certificates/design";
import { buildFieldCatalogue } from "@/lib/certificates/fields";
import { CertificatePreview, type CertificatePreviewProps } from "./CertificatePreview";

const TEMPLATE: AssetRef = {
  bucket: "certificate-assets",
  path: "00000000-0000-0000-0000-000000000000/11111111-1111-4111-8111-111111111111.png",
  type: "png",
  widthPx: 3508,
  heightPx: 2480,
};

const design: Design = {
  v: 1,
  page: { template: TEMPLATE, widthPx: 3508, heightPx: 2480 },
  elements: [
    {
      id: "name",
      name: "Name",
      type: "text",
      x: 20,
      y: 40,
      w: 60,
      h: 9,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.2,
      fit: "shrink",
      paragraphs: [{ runs: [{ kind: "field", field: "person.name", transform: "none", style: { ...DEFAULT_STYLE, sizePct: 6 } }] }],
    },
  ],
};

const render = (over: Partial<CertificatePreviewProps> = {}) =>
  renderToStaticMarkup(
    <CertificatePreview
      eventId="e1"
      groupId="g1"
      design={design}
      assetUrls={{ [assetKey(TEMPLATE)]: "https://example.test/t.png" }}
      catalogue={buildFieldCatalogue({ formSchema: [] })}
      previewRecipients={[{ key: "reg:1", name: "Asha R", values: { "person.name": "Asha R" } }]}
      base={{
        kind: "participants",
        label: "Participants",
        exists: true,
        sourceEventTitle: "Hack Night 2026",
        updatedAt: "2026-09-12T10:00:00Z",
      }}
      onCustomise={() => {}}
      {...over}
    />,
  );

describe("CertificatePreview", () => {
  it("shows the certificate filled with the first real person, on the template", () => {
    const html = render();
    expect(html).toContain('href="https://example.test/t.png"');
    expect(html).toContain("Asha R");
    expect(html).not.toContain("{Name}");
  });

  it("says where the base came from and offers Customise", () => {
    const html = render();
    expect(html).toContain("Council base");
    expect(html).toContain("saved from Hack Night 2026 on 12 September 2026");
    expect(html).toContain("Customise");
  });

  it("drops the source event when it was deleted", () => {
    const html = render({
      base: { kind: "participants", label: "Participants", exists: true, sourceEventTitle: null, updatedAt: "2026-09-12T10:00:00Z" },
    });
    expect(html).toContain("saved 12 September 2026");
    expect(html).not.toContain("saved from");
  });

  it("is read-only: no hit boxes or resize handles", () => {
    const html = render();
    expect(html).not.toContain("cd-hit");
    expect(html).not.toContain("cd-handle");
  });

  it("shows field names when there is nobody to preview as", () => {
    expect(render({ previewRecipients: [] })).toContain("{Name}");
  });
});
