import { describe, it, expect } from "vitest";
import {
  certificateFileName,
  countRecipients,
  pendingRecipients,
  registrationKey,
  statusByKey,
  type CertificateLedgerRow,
  type Recipient,
} from "./recipients";

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

describe("pending + counts", () => {
  const r = (key: string, email: string | null, status: Recipient["status"]): Recipient => ({
    key,
    registrationId: key,
    name: key,
    email,
    values: {},
    status,
  });
  const list = [
    r("a", "a@x", { state: "pending" }),
    r("b", null, { state: "pending" }),
    r("c", "c@x", { state: "issued", certificateId: "1", serial: "S", issuedAt: "t" }),
    r("d", "d@x", { state: "revoked", revokedAt: "t" }),
  ];

  it("emails only pending recipients with an address; records any pending one", () => {
    expect(pendingRecipients(list, "email").map((x) => x.key)).toEqual(["a"]);
    expect(pendingRecipients(list, "record").map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("counts", () => {
    expect(countRecipients(list)).toEqual({ total: 4, issued: 1, revoked: 1, pendingEmail: 1, noEmail: 1 });
  });

  it("keys registrations", () => {
    expect(registrationKey("abc")).toBe("reg:abc");
  });
});

describe("certificateFileName", () => {
  it("builds a safe, bounded file name", () => {
    expect(certificateFileName("Asha R", "Hack: Night/2026")).toBe("Certificate - Asha R - Hack Night 2026.pdf");
    expect(certificateFileName("", "X")).toBe("Certificate - Participant - X.pdf");
    expect(certificateFileName("a".repeat(300), "X").length).toBeLessThanOrEqual(120);
  });
});
