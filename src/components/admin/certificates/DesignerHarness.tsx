"use client";

import { summarizeBases, type BaseDesign, type BaseKind } from "@/lib/certificates/bases";
import { DEFAULT_STYLE, assetKey, type AssetRef, type Design } from "@/lib/certificates/design";
import { buildFieldCatalogue } from "@/lib/certificates/fields";
import { defaultFormFor, type FormField } from "@/lib/registration-form/schema";
import { DesignerLoader } from "./DesignerLoader";
import { DesignTab } from "./DesignTab";
import { ListEditor } from "./ListEditor";

// Sample data only — never a real person.
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const TEMPLATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="3508" height="2480"><rect width="3508" height="2480" fill="#fbf7ee"/><rect x="90" y="90" width="3328" height="2300" fill="none" stroke="#8c5a2b" stroke-width="24"/><rect x="150" y="150" width="3208" height="2180" fill="none" stroke="#8c5a2b" stroke-width="6"/></svg>`;
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="280" fill="#3f5e4c"/><text x="300" y="370" font-size="220" text-anchor="middle" fill="#fff" font-family="sans-serif">CSE</text></svg>`;

const TEMPLATE: AssetRef = {
  bucket: "certificate-assets",
  path: "00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.png",
  type: "png",
  widthPx: 3508,
  heightPx: 2480,
};
const LOGO: AssetRef = {
  bucket: "certificate-assets",
  path: "00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000002.png",
  type: "png",
  widthPx: 600,
  heightPx: 600,
};

const projectQ: FormField = { id: "project", kind: "short_text", identity: null, label: "Project title", required: false };
const catalogue = buildFieldCatalogue({ formSchema: [...defaultFormFor(), projectQ] });

const design: Design = {
  v: 1,
  page: { template: TEMPLATE, widthPx: 3508, heightPx: 2480 },
  elements: [
    { id: "logo", name: "Club logo", type: "image", x: 45, y: 8, w: 10, h: 14.15, locked: false, hidden: false, opacity: 1, asset: LOGO },
    { id: "qr", name: "Verification QR", type: "qr", x: 84, y: 72, w: 10, h: 14.15, locked: false, hidden: false, color: "#1a1a1a" },
    {
      id: "title",
      name: "Title",
      type: "text",
      x: 10,
      y: 26,
      w: 80,
      h: 8,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.2,
      fit: "wrap",
      paragraphs: [{ runs: [{ kind: "text", text: "CERTIFICATE OF PARTICIPATION", style: { ...DEFAULT_STYLE, font: "cinzel", bold: true, sizePct: 5, color: "#8c5a2b" } }] }],
    },
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
      paragraphs: [{ runs: [{ kind: "field", field: "person.name", transform: "title", style: { ...DEFAULT_STYLE, font: "greatvibes", sizePct: 8, color: "#22241f" } }] }],
    },
    {
      id: "body",
      name: "Body",
      type: "text",
      x: 15,
      y: 55,
      w: 70,
      h: 10,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.4,
      fit: "wrap",
      paragraphs: [
        {
          runs: [
            { kind: "text", text: "of the ", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "field", field: "person.department", transform: "none", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6, bold: true } },
            { kind: "text", text: " department participated in ", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "field", field: "event.title", transform: "none", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6, italic: true } },
            { kind: "text", text: " held on ", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "field", field: "event.date", transform: "none", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "text", text: ".", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
          ],
        },
      ],
    },
  ],
};

const people = [
  { key: "reg:1", name: "asha r", department: "CSE" },
  { key: "reg:2", name: "VENKATA SATYA SAI KRISHNA PRASAD REDDY", department: "Information Technology" },
].map((p) => ({
  key: p.key,
  name: p.name,
  values: {
    "person.name": p.name,
    "person.department": p.department,
    "event.title": "Hack Night 2026",
    "event.date": "14 September 2026",
    "form.project": "Smart Bins",
  },
}));

export function DesignerHarness() {
  return (
    <DesignerLoader
      eventId="00000000-0000-4000-8000-000000000000"
      groupId="00000000-0000-4000-8000-00000000000a"
      initialDesign={design}
      initialAssetUrls={{ [assetKey(TEMPLATE)]: svgUrl(TEMPLATE_SVG), [assetKey(LOGO)]: svgUrl(LOGO_SVG) }}
      catalogue={catalogue}
      previewRecipients={people}
      issuedCount={0}
      designSources={[]}
      baseKind={null}
      followsBase={false}
      bases={NO_BASES}
      savableBases={[]}
      baseImpact={{}}
      offline
    />
  );
}

const NO_BASES = summarizeBases(new Map());

const SAVED_BASES = summarizeBases(
  new Map<BaseKind, BaseDesign>([
    ["participants", { kind: "participants", design, sourceEventTitle: "Hack Night 2026", updatedAt: "2026-09-12T10:00:00Z" }],
  ]),
);

/** A Participants group following a saved council base, as a council admin sees it. */
export function BaseHarness() {
  return (
    <DesignTab
      eventId="00000000-0000-4000-8000-000000000000"
      groupId="00000000-0000-4000-8000-00000000000b"
      initialDesign={design}
      initialAssetUrls={{ [assetKey(TEMPLATE)]: svgUrl(TEMPLATE_SVG), [assetKey(LOGO)]: svgUrl(LOGO_SVG) }}
      catalogue={catalogue}
      previewRecipients={people}
      issuedCount={0}
      designSources={[]}
      baseKind="participants"
      followsBase
      bases={SAVED_BASES}
      savableBases={["participants", "volunteers"]}
      baseImpact={{ participants: { following: 9, withLive: 2 } }}
      offline
    />
  );
}

/** A Volunteers list with typed people. */
export function ListHarness() {
  return (
    <div className="cd-groups">
      <ListEditor
        eventId="00000000-0000-4000-8000-000000000000"
        groupId="00000000-0000-4000-8000-00000000000c"
        groupName="Volunteers"
        rows={[
          { id: "r1", row_no: 1, name: "Asha R", email: "asha@example.test", roll: "VTU27001", data: {} },
          { id: "r2", row_no: 2, name: "Karthik S", email: null, roll: "VTU27044", data: {} },
        ]}
        offline
      />
    </div>
  );
}
