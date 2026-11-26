import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { auditCsv, auditPayments, detectAuditColumns, EXAMPLE_BANK_CSV, EXAMPLE_PROVIDER_CSV, readAuditRows, summarizeAudit } from "./payment-audit";
import { parseAmount, parseCsv, parseXlsx } from "./spreadsheet";

function load(csv: string, kind: "provider" | "bank") {
  const table = parseCsv(csv);
  return readAuditRows(table, detectAuditColumns(table[0]!, kind)).rows;
}

describe("spreadsheet reading", () => {
  it("parses quoted CSV fields, doubled quotes, CRLF and semicolons", () => {
    expect(parseCsv("﻿a,b\r\n\"x, y\",\"say \"\"hi\"\"\"\r\n")).toEqual([["a", "b"], ["x, y", "say \"hi\""]]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("reads money cells in Indian, European and bracketed formats", () => {
    expect(parseAmount("1,23,456.78")).toBe(123456.78);
    expect(parseAmount("INR 1,234")).toBe(1234);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("(1,000.00)")).toBe(-1000);
    expect(parseAmount("")).toBeNull();
  });

  it("reads the first worksheet of an .xlsx file, shared and inline strings", async () => {
    const files: Record<string, string> = {
      "xl/sharedStrings.xml": "<sst><si><t>Name</t></si><si><t>Amount</t></si><si><r><t>Asha</t></r><r><t> R</t></r></si></sst>",
      "xl/worksheets/sheet1.xml": "<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c></row><row r=\"2\"><c r=\"A2\" t=\"s\"><v>2</v></c><c r=\"C2\"><v>1500.5</v></c></row><row r=\"3\"><c r=\"A3\" t=\"inlineStr\"><is><t>Tom &amp; Co</t></is></c><c r=\"B3\"><v>42</v></c></row></sheetData></worksheet>",
    };
    const zip = buildZip(files);
    expect(await parseXlsx(zip)).toEqual([["Name", "Amount"], ["Asha R", "", "1500.5"], ["Tom & Co", "42"]]);
  });
});

describe("payment audit", () => {
  const lines = auditPayments(load(EXAMPLE_PROVIDER_CSV, "provider"), load(EXAMPLE_BANK_CSV, "bank"));
  const by = (reference: string) => lines.find((line) => line.reference === reference)!;

  it("finds the reference inside bank narrations and measures the shortfall in bps", () => {
    expect(by("INV-2041")).toMatchObject({ status: "matched", differenceMinor: 0, bps: 0 });
    expect(by("INV-2042")).toMatchObject({ status: "matched", differenceMinor: 43_000, bps: 46 });
    expect(by("INV-2044")).toMatchObject({ status: "matched", differenceMinor: 369_000, bps: 132 });
  });

  it("flags what can't be trusted instead of pairing it", () => {
    expect(by("INV-2043").status).toBe("missing_at_bank");
    expect(by("INV-2045")).toMatchObject({ status: "duplicate", note: expect.stringContaining("credited twice") });
    expect(by("INV-2046")).toMatchObject({ status: "check_amount", bps: 1810 });
    expect(by("UPI/REF77310/SELF").status).toBe("not_in_report");
  });

  it("says why a credit has no provider row instead of a bare 'not in report'", () => {
    expect(by("UPI/REF77310/SELF").note).toMatch(/your own accounts/);
    const [rowWithoutReference] = auditPayments(load("Reference,Recipient amount\nINV-9,5000", "provider"), load("Narration,Credit\nNEFT CR 4999.50,4999.50", "bank"));
    expect(rowWithoutReference).toMatchObject({ status: "missing_at_bank", note: expect.stringContaining("close in amount") });
    const credit = auditPayments(load("Reference,Recipient amount\nINV-9,5000", "provider"), load("Narration,Credit\nNEFT CR 4999.50,4999.50", "bank")).find((line) => line.status === "not_in_report");
    expect(credit?.note).toMatch(/close to INV-9/);
    expect(auditPayments([], load("Narration,Credit\nUPI/123/JOHN,900", "bank"))[0]!.note).toMatch(/UPI credit/);
    expect(auditPayments([], load("Narration,Credit\nINT.PD:01-10,12.5", "bank"))[0]!.note).toMatch(/interest/i);
  });

  it("calls a credit claimed by two reported payments ambiguous", () => {
    const provider = load("Reference,Recipient amount\nACME-77,100\nACME-77X,100", "provider");
    const bank = load("Narration,Credit\nACME-77X PAYMENT,100", "bank");
    expect(auditPayments(provider, bank).filter((line) => line.status === "ambiguous")).toHaveLength(2);
  });

  it("totals matched rows per currency and exports formula-safe CSV", () => {
    const summary = summarizeAudit(lines);
    expect(summary.counts).toMatchObject({ matched: 3, missing_at_bank: 1, duplicate: 1, check_amount: 1, not_in_report: 1 });
    expect(summary.totals).toEqual([{ currency: "INR", reported: 531_850.4, credited: 527_730.4, differenceMinor: 412_000, bps: 77 }]);
    const csv = auditCsv([{ ...lines[0]!, note: "=HYPERLINK(\"x\")" }]);
    expect(csv.split("\r\n")[1]).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
  });
});

/** A minimal stored-or-deflated zip, enough for the reader (no CRC check). */
function buildZip(files: Record<string, string>): ArrayBuffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...chunks, centralBytes, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
}
