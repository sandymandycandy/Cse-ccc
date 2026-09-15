import { describe, it, expect } from "vitest";
import {
  certificateFileName,
  chunkBySize,
  countRecipients,
  cutBatch,
  groupByDestination,
  isOutdated,
  memberKey,
  outdatedRecipients,
  pendingRecipients,
  printedFields,
  registrationKey,
  sheetIdentity,
  sheetKey,
  statusByKey,
  type CertificateLedgerRow,
  type Recipient,
} from "./recipients";
import { emptyDesign, type Design } from "./design";

const row = (over: Partial<CertificateLedgerRow>): CertificateLedgerRow => ({
  id: "c1",
  recipient_key: "reg:1",
  serial: "CSE-1",
  issued_at: "2026-09-01T10:00:00Z",
  revoked_at: null,
  revoked_reason: null,
  ...over,
});

describe("statusByKey", () => {
  it("marks a live row as issued", () => {
    expect(statusByKey([row({})]).get("reg:1")).toEqual({
      state: "issued",
      certificateId: "c1",
      serial: "CSE-1",
      issuedAt: "2026-09-01T10:00:00Z",
    });
  });

  it("treats a superseded row with a live successor as issued", () => {
    const s = statusByKey([
      row({ id: "old", revoked_at: "2026-09-02T00:00:00Z", revoked_reason: "superseded" }),
      row({ id: "new", serial: "CSE-2", issued_at: "2026-09-02T00:00:00Z" }),
    ]);
    expect(s.get("reg:1")).toMatchObject({ state: "issued", certificateId: "new" });
  });

  it("marks a standalone revoke as revoked", () => {
    const s = statusByKey([row({ revoked_at: "2026-09-03T00:00:00Z", revoked_reason: "Did not attend" })]);
    expect(s.get("reg:1")).toEqual({ state: "revoked", revokedAt: "2026-09-03T00:00:00Z" });
  });

  it("ignores rows without a recipient key", () => {
    expect(statusByKey([row({ recipient_key: null })]).size).toBe(0);
  });
});

describe("recipient keys", () => {
  it("keys registrations, and their team members under them", () => {
    const taken = new Set<string>();
    expect(registrationKey("abc")).toBe("reg:abc");
    expect(memberKey("abc", { name: "Ravi K", roll: " VTU1002 " }, taken)).toBe("reg:abc:m:vtu1002");
    // Roll wins over name; a member with no roll falls back to the name.
    expect(memberKey("abc", { name: "  Asha   R ", roll: "" }, taken)).toBe("reg:abc:m:asha r");
  });

  it("numbers duplicates inside one team so nobody collides", () => {
    const taken = new Set<string>();
    expect(memberKey("abc", { name: "Ravi", roll: "VTU1" }, taken)).toBe("reg:abc:m:vtu1");
    expect(memberKey("abc", { name: "Ravi", roll: "VTU1" }, taken)).toBe("reg:abc:m:vtu1#2");
    expect(memberKey("abc", { name: "Ravi", roll: "vtu1" }, taken)).toBe("reg:abc:m:vtu1#3");
  });

  it("keys sheet rows by email, else name, so a re-upload keeps people matched", () => {
    const taken = new Set<string>();
    expect(sheetKey("g1", { name: "Asha", email: "A@X.COM" }, taken)).toBe("sheet:g1:a@x.com");
    expect(sheetKey("g1", { name: "No Mail", email: null }, taken)).toBe("sheet:g1:no mail");
    expect(sheetKey("g1", { name: "No Mail", email: null }, taken)).toBe("sheet:g1:no mail#2");
  });
});

describe("sheetIdentity", () => {
  it("is the identity sheetKey is built from: email first, else name", () => {
    expect(sheetIdentity({ name: "Asha", email: " A@X.COM " })).toBe("a@x.com");
    expect(sheetIdentity({ name: "  Asha   R ", email: null })).toBe("asha r");
    expect(sheetKey("g1", { name: "Asha", email: "A@X.COM" }, new Set())).toBe(
      `sheet:g1:${sheetIdentity({ name: "Asha", email: "A@X.COM" })}`,
    );
  });
  it("changes when the email or (without email) the name changes — not otherwise", () => {
    const before = sheetIdentity({ name: "Asha", email: "a@x.com" });
    expect(sheetIdentity({ name: "Asha R", email: "a@x.com" })).toBe(before);
    expect(sheetIdentity({ name: "Asha", email: "asha@x.com" })).not.toBe(before);
    expect(sheetIdentity({ name: "Asha R", email: null })).not.toBe(sheetIdentity({ name: "Asha", email: null }));
  });
});

const person = (over: Partial<Recipient>): Recipient => ({
  key: "reg:1",
  groupId: "g1",
  groupLabel: "Participation",
  kind: "registration",
  registrationId: "1",
  name: "Asha",
  teamLabel: null,
  email: "asha@x.com",
  deliverTo: "asha@x.com",
  viaLeader: false,
  values: {},
  status: { state: "pending" },
  ...over,
});

describe("pending + counts", () => {
  const list = [
    person({ key: "a" }),
    person({ key: "b", email: null, deliverTo: null }),
    person({ key: "c", status: { state: "issued", certificateId: "1", serial: "S", issuedAt: "t" } }),
    person({ key: "d", status: { state: "revoked", revokedAt: "t" } }),
  ];

  it("emails only pending recipients with a destination; records any pending one", () => {
    expect(pendingRecipients(list, "email").map((x) => x.key)).toEqual(["a"]);
    expect(pendingRecipients(list, "record").map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("counts", () => {
    expect(countRecipients(list)).toEqual({ total: 4, issued: 1, revoked: 1, pendingEmail: 1, noEmail: 1 });
  });
});

describe("groupByDestination", () => {
  it("puts everyone sharing an address in one email, in list order", () => {
    const leader = person({ key: "reg:1", name: "Asha", deliverTo: "asha@x.com" });
    const mate = person({ key: "reg:1:m:v2", name: "Ravi", kind: "member", email: null, deliverTo: "asha@x.com", viaLeader: true });
    const other = person({ key: "reg:2", name: "Kim", deliverTo: "KIM@X.com" });
    const dests = groupByDestination([leader, mate, other]);
    expect(dests).toHaveLength(2);
    expect(dests[0]).toMatchObject({ email: "asha@x.com" });
    expect(dests[0].recipients.map((r) => r.name)).toEqual(["Asha", "Ravi"]);
    // Case-insensitive grouping keeps the address as first written.
    expect(dests[1].email).toBe("KIM@X.com");
  });

  it("skips recipients with nowhere to send", () => {
    expect(groupByDestination([person({ deliverTo: null })])).toEqual([]);
  });
});

describe("cutBatch", () => {
  const dest = (email: string, n: number) => ({
    email,
    recipients: Array.from({ length: n }, (_, i) => person({ key: `${email}:${i}` })),
  });

  it("takes whole destinations until the batch is big enough", () => {
    const batch = cutBatch([dest("a", 3), dest("b", 30), dest("c", 20), dest("d", 5)], 40);
    expect(batch.map((d) => d.email)).toEqual(["a", "b", "c"]);
    expect(batch.flatMap((d) => d.recipients)).toHaveLength(53);
  });

  it("never splits a destination, even one larger than the batch", () => {
    const batch = cutBatch([dest("big", 90), dest("next", 1)], 40);
    expect(batch.map((d) => d.email)).toEqual(["big"]);
  });

  it("returns nothing when there is nothing to do", () => {
    expect(cutBatch([], 40)).toEqual([]);
  });
});

describe("chunkBySize", () => {
  it("splits once the running total would pass the cap", () => {
    const items = [5, 5, 5, 30, 1];
    expect(chunkBySize(items, (n) => n * 1024 * 1024, 20 * 1024 * 1024)).toEqual([[5, 5, 5], [30], [1]]);
  });

  it("keeps an over-cap item on its own rather than dropping it", () => {
    expect(chunkBySize([50], (n) => n * 1024 * 1024, 20 * 1024 * 1024)).toEqual([[50]]);
  });

  it("returns nothing for no items", () => {
    expect(chunkBySize([], () => 1, 10)).toEqual([]);
  });
});

describe("certificateFileName", () => {
  it("builds a safe, bounded file name", () => {
    expect(certificateFileName("Asha R", "Hack: Night/2026")).toBe("Certificate - Asha R - Hack Night 2026.pdf");
    expect(certificateFileName("", "X")).toBe("Certificate - Participant - X.pdf");
    expect(certificateFileName("a".repeat(300), "X").length).toBeLessThanOrEqual(120);
  });
});

describe("outdated certificates", () => {
  const style = { font: "lora", sizePct: 4, bold: false, italic: false, underline: false, color: "#000000" } as const;
  const textEl = (id: string, fields: string[], hidden = false) => ({
    id,
    name: id,
    type: "text" as const,
    x: 0,
    y: 0,
    w: 50,
    h: 10,
    locked: false,
    hidden,
    align: "left" as const,
    lineHeight: 1.2,
    fit: "wrap" as const,
    paragraphs: [
      {
        runs: [
          { kind: "text" as const, text: "Hello ", style },
          ...fields.map((field) => ({ kind: "field" as const, field, transform: "none" as const, style })),
        ],
      },
    ],
  });
  const design = (elements: unknown[]): Design => ({ ...emptyDesign(), elements: elements as Design["elements"] });

  describe("printedFields", () => {
    it("lists the fields visible text prints, once each, without the per-certificate ones", () => {
      const d = design([
        textEl("a", ["person.name", "event.title", "person.name"]),
        textEl("b", ["cert.serial", "cert.issueDate", "cert.group"]),
        textEl("hidden", ["person.phone"], true),
        { id: "qr", name: "QR", type: "qr", x: 0, y: 0, w: 5, h: 5, locked: false, hidden: false, color: "#000000" },
      ]);
      expect(printedFields(d).sort()).toEqual(["cert.group", "event.title", "person.name"]);
    });
  });

  describe("isOutdated", () => {
    const base = {
      live: { designVersionId: "v1", values: { "person.name": "Asha R", "person.phone": "1", "cert.serial": "CSE-OLD" } },
      currentVersionId: "v1",
      printed: ["person.name"],
      current: { "person.name": "Asha R", "person.phone": "1", "cert.serial": "" },
    };

    it("is current when the design version and every printed value match", () => {
      expect(isOutdated(base)).toBe(false);
    });

    it("is outdated when issued with another design version", () => {
      expect(isOutdated({ ...base, currentVersionId: "v2" })).toBe(true);
    });

    it("is outdated when the current design has never been issued", () => {
      expect(isOutdated({ ...base, currentVersionId: null })).toBe(true);
    });

    it("is outdated when a printed value changed", () => {
      expect(isOutdated({ ...base, current: { ...base.current, "person.name": "Asha Rao" } })).toBe(true);
    });

    it("ignores changes to values the design does not print", () => {
      expect(isOutdated({ ...base, current: { ...base.current, "person.phone": "2" } })).toBe(false);
    });

    it("treats a missing value as empty on both sides", () => {
      expect(isOutdated({ ...base, printed: ["team.name"], current: { ...base.current, "team.name": "" } })).toBe(false);
    });
  });

  describe("outdatedRecipients", () => {
    const person = (key: string, groupId: string, status: Recipient["status"], name = "Asha R"): Recipient => ({
      key,
      groupId,
      groupLabel: "Participation",
      kind: "registration",
      registrationId: null,
      name,
      teamLabel: null,
      email: null,
      deliverTo: null,
      viaLeader: false,
      values: { "person.name": name },
      status,
    });
    const issued = (id: string) => ({ state: "issued" as const, certificateId: id, serial: `S-${id}`, issuedAt: "2026-09-14T00:00:00Z" });

    it("returns issued recipients whose certificate is outdated, in list order", () => {
      const recipients = [
        person("a", "g1", issued("c-a"), "Asha Rao"), // name corrected since
        person("b", "g1", issued("c-b")), // current
        person("c", "g1", { state: "pending" }),
        person("d", "g2", issued("c-d")), // g2's design changed
        person("e", "g1", issued("c-missing")), // no details loaded: leave alone
      ];
      const live = new Map([
        ["c-a", { designVersionId: "v1", values: { "person.name": "Asha R" } }],
        ["c-b", { designVersionId: "v1", values: { "person.name": "Asha R" } }],
        ["c-d", { designVersionId: "old", values: { "person.name": "Asha R" } }],
      ]);
      const groups = new Map([
        ["g1", { versionId: "v1", printed: ["person.name"] }],
        ["g2", { versionId: "new", printed: ["person.name"] }],
      ]);
      expect(outdatedRecipients(recipients, live, groups).map((r) => r.key)).toEqual(["a", "d"]);
    });
  });
});
