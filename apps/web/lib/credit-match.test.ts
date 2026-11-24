import { describe, expect, it } from "vitest";
import { parseCsv } from "./spreadsheet";
import { findCredits, parseStatementDate } from "./credit-match";

const hdfc = `Account Statement for XXXX1234
Period: 01/11/2026 to 30/11/2026

Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
02/11/26,UPI-GROCERY STORE,UPI1,02/11/26,450.00,,100000.00
05/11/26,NEFT CR-INWARD REMIT INV-2041 ACME INC,N1,05/11/26,,"1,55,980.00","2,55,980.00"
06/11/26,IMPS-SOMEONE ELSE,I1,06/11/26,,"1,50,000.00","4,05,980.00"
09/11/26,SALARY,S1,09/11/26,,"75,000.00","4,80,980.00"
10/11/26,NEFT CR-LATE CREDIT,N2,10/11/26,,"1,56,500.00","6,37,480.00"`;

describe("finding the credit for an invoice in a bank statement", () => {
  it("prefers the credit that names the invoice, then credits near the expected amount", () => {
    const result = findCredits(parseCsv(hdfc), { invoiceNumber: "INV-2041", expected: 156_952.26, quoteDate: "2026-11-04" });
    expect(result.readable).toBe(true);
    expect(result.candidates.map((c) => [c.match, c.amount, c.date])).toEqual([
      ["invoice", 155_980, "2026-11-05"],
      ["amount", 156_500, "2026-11-10"],
      ["amount", 150_000, "2026-11-06"],
    ]);
    expect(result.credits).toBe(4);
  });

  it("ignores debits and credits that arrived before the quote", () => {
    const result = findCredits(parseCsv(hdfc), { invoiceNumber: "NOPE-1", expected: 156_952.26, quoteDate: "2026-11-08" });
    expect(result.candidates.map((c) => c.amount)).toEqual([156_500]);
  });

  it("reads a single signed amount column with a Dr/Cr marker", () => {
    const csv = `Date,Description,Amount,Dr/Cr\n2026-11-02,Rent,25000,DR\n2026-11-05,INV 2041 payment,155980,CR`;
    expect(findCredits(parseCsv(csv), { invoiceNumber: "INV-2041", expected: null, quoteDate: null }).candidates).toMatchObject([{ amount: 155_980, match: "invoice", date: "2026-11-05" }]);
  });

  it("says when the file is not a statement it can read", () => {
    expect(findCredits(parseCsv("Name,Colour\nAna,Red"), { invoiceNumber: "INV-1", expected: 1000, quoteDate: null })).toMatchObject({ readable: false, candidates: [] });
  });

  it("does not match short invoice numbers inside unrelated text", () => {
    const csv = `Date,Narration,Credit\n2026-11-05,PAYMENT 12 ITEMS,500\n`;
    expect(findCredits(parseCsv(csv), { invoiceNumber: "12", expected: null, quoteDate: null }).candidates).toEqual([]);
  });

  it("reads the date formats banks use", () => {
    expect(parseStatementDate("05/11/26")).toBe("2026-11-05");
    expect(parseStatementDate("05-11-2026")).toBe("2026-11-05");
    expect(parseStatementDate("5-Nov-2026")).toBe("2026-11-05");
    expect(parseStatementDate("05 Nov 2026")).toBe("2026-11-05");
    expect(parseStatementDate("2026-11-05T10:00:00")).toBe("2026-11-05");
    expect(parseStatementDate("46331")).toBe("2026-11-05");
    expect(parseStatementDate("31/02/2026")).toBeNull();
    expect(parseStatementDate("")).toBeNull();
  });
});
