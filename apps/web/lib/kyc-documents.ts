/**
 * Turns a provider's own KYC wording into a checklist a person can scan: which
 * kind of document each line is about (so a picture can stand in for it), and
 * whether the provider asks for it up front or only sometimes. Nothing is
 * added: every row keeps the provider's sentence, and a kind is only named when
 * the sentence names it (Aadhaar, PAN, passport and so on).
 */
export type DocType = "aadhaar" | "pan" | "passport" | "driving" | "id" | "selfie" | "address" | "business" | "bank" | "funds" | "other";

export const DOC_LABEL: Record<DocType, string> = {
  aadhaar: "Aadhaar card",
  pan: "PAN card",
  passport: "Passport",
  driving: "Driving licence",
  id: "Photo ID",
  selfie: "Selfie",
  address: "Proof of address",
  business: "Business papers",
  bank: "Bank details",
  funds: "Source of funds",
  other: "Also needed",
};

/** Display order: identity first, then the supporting papers. */
const ORDER: DocType[] = ["aadhaar", "pan", "passport", "driving", "id", "selfie", "address", "business", "bank", "funds"];

const PATTERNS: Array<[DocType, RegExp]> = [
  ["aadhaar", /aadhaar|aadhar/i],
  ["pan", /\bPAN\b|permanent account number/i],
  ["passport", /passport/i],
  ["driving", /driv(?:er|ing)\S*\s+licen[cs]e/i],
  ["id", /\bID\b|identity|national id|residence (?:card|permit)|voter|government-issued/i],
  ["selfie", /selfie|liveness|video (?:call|kyc|verification)|holding your id|\bface\b/i],
  ["address", /proof of address|utility bill|phone bill|council tax|tenancy|lease|\baddress\b/i],
  ["business", /incorporation|registration|registered|\bGST\b|\bIEC\b|udyam|\bMSME\b|trade licen|articles of association|shareholder|partnership deed|operating agreement|\bLLP\b|\bCIN\b|director|beneficial owner|business (?:proof|document|papers)/i],
  ["bank", /bank (?:account|details|proof|ownership)|cancelled cheque|\bIBAN\b|account number|account statement/i],
  ["funds", /pay stub|payslip|salary|source of (?:funds|money|income)|where the money|proof of income|tax return|\bW-2\b|income tax|invoice/i],
];

const SOMETIMES = /\b(?:if (?:asked|requested|needed|required|it asks|\w+ asks)|sometimes|in some cases|may (?:ask|need|request)|can ask|only when|on request|for (?:larger|large|higher)|extra|possibly|depending)\b/i;

export interface KycDocumentRow {
  /** The kinds of document the sentence names, in display order. */
  types: DocType[];
  /** The provider's own wording. */
  text: string;
  /** "required" unless the sentence says it is only sometimes asked for. */
  need: "required" | "sometimes";
}

export function documentTypes(text: string): DocType[] {
  const found = new Set<DocType>();
  for (const [type, pattern] of PATTERNS) if (pattern.test(text)) found.add(type);
  // A bank statement shown as proof of address is not also a bank-details request.
  if (found.has("address")) found.delete("bank");
  const ordered = ORDER.filter((type) => found.has(type));
  return ordered.length ? ordered : ["other"];
}

/** One row per sentence the provider wrote: its document list, then its note (often the only place a business's papers are named). */
export function kycDocumentRows(documents: readonly string[], note?: string | null): KycDocumentRow[] {
  const lines = [...documents, ...(note ? note.split(/(?<=[.!?])\s+(?=[A-Z])/) : [])]
    .map((line) => line.trim())
    .filter(Boolean);
  // A provider note often repeats a listed document word for word; show it once.
  return [...new Set(lines)].map((text) => ({ types: documentTypes(text), text, need: SOMETIMES.test(text) ? "sometimes" : "required" }));
}
