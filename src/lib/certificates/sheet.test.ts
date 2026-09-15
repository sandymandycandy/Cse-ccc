import { describe, it, expect } from "vitest";
import { buildSheetRows, detectColumns, parseDelimited, SHEET_LIMITS, validateListRow } from "./sheet";

describe("parseDelimited", () => {
  it("reads a plain comma sheet", () => {
    expect(parseDelimited("Name,Email\nAsha,a@x.com\nRavi,r@x.com")).toEqual([
      ["Name", "Email"],
      ["Asha", "a@x.com"],
      ["Ravi", "r@x.com"],
    ]);
  });

  it("honours quoted fields, commas and doubled quotes inside them", () => {
    expect(parseDelimited('Name,Note\n"Reddy, Asha","She said ""hi"""')).toEqual([
      ["Name", "Note"],
      ["Reddy, Asha", 'She said "hi"'],
    ]);
  });

  it("keeps newlines inside quotes as part of the value", () => {
    expect(parseDelimited('Name,Note\nAsha,"line one\nline two"')).toEqual([
      ["Name", "Note"],
      ["Asha", "line one\nline two"],
    ]);
  });

  it("strips a BOM and handles CRLF", () => {
    expect(parseDelimited("﻿Name,Email\r\nAsha,a@x.com\r\n")).toEqual([
      ["Name", "Email"],
      ["Asha", "a@x.com"],
    ]);
  });

  it("detects semicolon and tab sheets from the header", () => {
    expect(parseDelimited("Name;Email\nAsha;a@x.com")).toEqual([
      ["Name", "Email"],
      ["Asha", "a@x.com"],
    ]);
    expect(parseDelimited("Name\tEmail\nAsha\ta@x.com")).toEqual([
      ["Name", "Email"],
      ["Asha", "a@x.com"],
    ]);
  });

  it("drops blank lines and returns nothing for an empty file", () => {
    expect(parseDelimited("Name\n\nAsha\n\n")).toEqual([["Name"], ["Asha"]]);
    expect(parseDelimited("   ")).toEqual([]);
  });
});

describe("detectColumns", () => {
  it("finds the name and email columns", () => {
    expect(detectColumns(["Full Name", "E-mail", "Role"])).toEqual({ name: 0, email: 1, roll: null });
    expect(detectColumns(["email address", "student name"])).toEqual({ name: 1, email: 0, roll: null });
  });

  it("does not mistake a team or event name for the person's name", () => {
    expect(detectColumns(["Team Name", "Participant", "Email"])).toEqual({ name: 1, email: 2, roll: null });
    expect(detectColumns(["Event name", "Club name"])).toEqual({ name: 0, email: null, roll: null });
  });

  it("falls back to the first column when nothing matches", () => {
    expect(detectColumns(["A", "B"])).toEqual({ name: 0, email: null, roll: null });
    expect(detectColumns([])).toEqual({ name: 0, email: null, roll: null });
  });
});

describe("buildSheetRows", () => {
  const rows = [
    ["Name", "Email", "Role"],
    ["Asha", "asha@x.com", "Volunteer"],
    ["  ", "nobody@x.com", "Volunteer"],
    ["Ravi", "not-an-email", "Judge"],
    ["Kim", "", "Judge"],
  ];

  it("builds rows, drops the nameless and blanks bad emails", () => {
    const out = buildSheetRows(rows, { name: 0, email: 1, roll: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rows).toEqual([
      { row_no: 1, name: "Asha", email: "asha@x.com", roll: null, data: { Name: "Asha", Email: "asha@x.com", Role: "Volunteer" } },
      { row_no: 2, name: "Ravi", email: null, roll: null, data: { Name: "Ravi", Email: "not-an-email", Role: "Judge" } },
      { row_no: 3, name: "Kim", email: null, roll: null, data: { Name: "Kim", Email: "", Role: "Judge" } },
    ]);
    expect(out.columns).toEqual(["Name", "Email", "Role"]);
    expect(out.dropped).toBe(1);
    expect(out.invalidEmails).toBe(1);
  });

  it("works without an email column at all", () => {
    const out = buildSheetRows([["Who"], ["Asha"]], { name: 0, email: null, roll: null });
    expect(out.ok && out.rows[0]).toMatchObject({ name: "Asha", email: null, roll: null });
  });

  it("names an unnamed column rather than losing it", () => {
    const out = buildSheetRows([["Name", ""], ["Asha", "x"]], { name: 0, email: null, roll: null });
    expect(out.ok && out.columns).toEqual(["Name", "Column 2"]);
  });

  it("makes duplicate headings unique", () => {
    const out = buildSheetRows([["Name", "Role", "Role"], ["Asha", "a", "b"]], { name: 0, email: null, roll: null });
    expect(out.ok && out.columns).toEqual(["Name", "Role", "Role 2"]);
    expect(out.ok && out.rows[0].data).toEqual({ Name: "Asha", Role: "a", "Role 2": "b" });
  });

  it("refuses a sheet with no usable rows", () => {
    const out = buildSheetRows([["Name"], ["  "]], { name: 0, email: null, roll: null });
    expect(out).toEqual({ ok: false, error: "No rows with a name — check which column holds the name." });
  });

  it("refuses a sheet that is too big", () => {
    const many = [["Name"], ...Array.from({ length: SHEET_LIMITS.rows + 1 }, (_, i) => [`P${i}`])];
    expect(buildSheetRows(many, { name: 0, email: null, roll: null })).toEqual({
      ok: false,
      error: `That sheet has more than ${SHEET_LIMITS.rows} rows. Split it and upload in parts.`,
    });
    const wide = [Array.from({ length: SHEET_LIMITS.columns + 1 }, (_, i) => `C${i}`), ["x"]];
    expect(buildSheetRows(wide, { name: 0, email: null, roll: null })).toMatchObject({ ok: false });
  });

  it("trims over-long cells and headings instead of failing", () => {
    const out = buildSheetRows([["Name", "N".repeat(200)], ["Asha", "v".repeat(900)]], { name: 0, email: null, roll: null });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.columns[1].length).toBe(SHEET_LIMITS.header);
    expect(String(Object.values(out.rows[0].data)[1]).length).toBe(SHEET_LIMITS.cell);
  });
});

describe("roll column", () => {
  it("finds a roll / VTU / register number column and never takes it for the name", () => {
    expect(detectColumns(["Student Roll No", "Student Name", "Email"])).toEqual({ name: 1, email: 2, roll: 0 });
    expect(detectColumns(["VTU No", "Student"])).toEqual({ name: 1, email: null, roll: 0 });
    expect(detectColumns(["Name", "Register Number"])).toEqual({ name: 0, email: null, roll: 1 });
    expect(detectColumns(["Name", "Reg. No"])).toEqual({ name: 0, email: null, roll: 1 });
    // The name fallback skips the roll column too.
    expect(detectColumns(["Enrollment No", "Col B"])).toEqual({ name: 1, email: null, roll: 0 });
  });

  it("carries the roll into each row, blank as null", () => {
    const built = buildSheetRows(
      [
        ["Name", "Roll"],
        ["Asha", " VTU27001 "],
        ["Kim", ""],
      ],
      { name: 0, email: null, roll: 1 },
    );
    expect(built.ok && built.rows.map((r) => r.roll)).toEqual(["VTU27001", null]);
  });
});

describe("validateListRow", () => {
  it("trims and keeps a full row", () => {
    expect(validateListRow({ name: " Asha R ", email: " asha@veltech.edu.in ", roll: " VTU27001 " })).toEqual({
      ok: true,
      row: { name: "Asha R", email: "asha@veltech.edu.in", roll: "VTU27001" },
    });
  });
  it("needs only a name", () => {
    expect(validateListRow({ name: "Kim", email: "", roll: "" })).toEqual({ ok: true, row: { name: "Kim", email: null, roll: null } });
  });
  it("refuses a missing name", () => {
    expect(validateListRow({ name: "  ", email: "a@b.co" })).toEqual({ ok: false, error: "Enter a name." });
  });
  it("refuses a typo'd email instead of dropping it", () => {
    expect(validateListRow({ name: "Kim", email: "kim@gmail" })).toEqual({ ok: false, error: "That email doesn't look right." });
  });
  it("applies the cell cap to every value", () => {
    const long = "x".repeat(SHEET_LIMITS.cell + 1);
    expect(validateListRow({ name: long })).toEqual({ ok: false, error: "That name is too long." });
    expect(validateListRow({ name: "Kim", roll: long })).toEqual({ ok: false, error: "That roll no. is too long." });
  });
  it("ignores non-string input", () => {
    expect(validateListRow({ name: 42 })).toEqual({ ok: false, error: "Enter a name." });
  });
});
