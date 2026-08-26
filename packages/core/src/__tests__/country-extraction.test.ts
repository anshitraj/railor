/**
 * The `@google/genai` client is fully mocked at models.generateContent — no
 * real API credits spent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING", BOOLEAN: "BOOLEAN", ARRAY: "ARRAY" },
}));

const {
  extractCountryProfile,
  ExtractionRefusedError,
  ExtractionTruncatedError,
  ExtractionInvalidError,
  GeminiNotConfiguredError,
} = await import("../country-research/extract.js");

const empty = { value: null, sourceUrls: [] as string[] };
const emptyArr = { value: [] as string[], sourceUrls: [] as string[] };

/** Every field null/empty except one, so the "missing info stays null" assertion has real signal. */
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    centralBankName: { value: "Reserve Bank of India", sourceUrls: ["https://rbi.org.in/x"] },
    regulatorNames: emptyArr,
    pspLicensingSummary: empty,
    ibanSupported: { value: false, sourceUrls: [] },
    ibanNote: empty,
    swiftSupported: { value: true, sourceUrls: [] },
    swiftNote: empty,
    instantPaymentAvailable: { value: true, sourceUrls: [] },
    instantPaymentSystem: { value: "UPI", sourceUrls: [] },
    localPaymentRails: emptyArr,
    bankAccountRequirements: emptyArr,
    routingCodeType: empty,
    routingCodeDescription: empty,
    cryptoStatus: empty,
    stablecoinStatus: empty,
    kycRequirements: emptyArr,
    kybRequirements: emptyArr,
    amlRequirements: emptyArr,
    crossBorderRestrictions: emptyArr,
    supportedPayoutCurrencies: emptyArr,
    ...overrides,
  };
}

const sources = [{ url: "https://rbi.org.in/x", title: "RBI", category: "central_bank", content: "The Reserve Bank of India is the central bank." }];

const cleanResponse = (parsed: unknown) => ({
  text: JSON.stringify(parsed),
  candidates: [{ finishReason: "STOP" }],
});

describe("extractCountryProfile", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGenerateContent.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws GeminiNotConfiguredError when the key is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(extractCountryProfile("India", sources)).rejects.toBeInstanceOf(GeminiNotConfiguredError);
  });

  it("refuses to extract from zero sources without calling Gemini", async () => {
    await expect(extractCountryProfile("India", [])).rejects.toBeInstanceOf(ExtractionInvalidError);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns a valid extraction, passing null/empty fields through unfabricated", async () => {
    mockGenerateContent.mockResolvedValue(cleanResponse(fixture()));

    const result = await extractCountryProfile("India", sources);
    expect(result.centralBankName.value).toBe("Reserve Bank of India");
    // Nothing in the fixture said anything about PSP licensing or crypto — must stay null, not guessed.
    expect(result.pspLicensingSummary.value).toBeNull();
    expect(result.cryptoStatus.value).toBeNull();
    expect(result.kycRequirements.value).toEqual([]);
  });

  it("surfaces a blocked prompt as ExtractionRefusedError", async () => {
    mockGenerateContent.mockResolvedValue({
      text: undefined,
      candidates: [],
      promptFeedback: { blockReason: "SAFETY" },
    });
    await expect(extractCountryProfile("India", sources)).rejects.toBeInstanceOf(ExtractionRefusedError);
  });

  it("surfaces a SAFETY finish reason as ExtractionRefusedError", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined, candidates: [{ finishReason: "SAFETY" }] });
    await expect(extractCountryProfile("India", sources)).rejects.toBeInstanceOf(ExtractionRefusedError);
  });

  it("surfaces a MAX_TOKENS finish reason as ExtractionTruncatedError", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(fixture()), candidates: [{ finishReason: "MAX_TOKENS" }] });
    await expect(extractCountryProfile("India", sources)).rejects.toBeInstanceOf(ExtractionTruncatedError);
  });

  it("rejects invalid JSON instead of writing garbage downstream", async () => {
    mockGenerateContent.mockResolvedValue({ text: "not json", candidates: [{ finishReason: "STOP" }] });
    await expect(extractCountryProfile("India", sources)).rejects.toBeInstanceOf(ExtractionInvalidError);
  });

  it("rejects a malformed (but valid-JSON) response instead of writing garbage downstream", async () => {
    mockGenerateContent.mockResolvedValue(cleanResponse({ totally: "wrong shape" }));
    await expect(extractCountryProfile("India", sources)).rejects.toBeInstanceOf(ExtractionInvalidError);
  });
});
