import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceCheckInput } from "../pricing.js";
import { alAnsariPublicReference } from "../public-pricing/al-ansari.js";

const now = new Date("2026-11-18T15:26:00Z");
const input = {
  sourceCurrency: "AED", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
  context: { country: "AE", profile: "personal", direction: "send", purpose: "personal" },
} satisfies PriceCheckInput;
const config = '<script>var CC_Ajax_Object = {"ajax_url":"https://alansariexchange.com/wp-admin/admin-ajax.php","ajax_nonce":"testnonce1"};</script>';

describe("Al Ansari's public UAE bank-transfer reference", () => {
  it("uses the displayed currency and bank-transfer method without setting fees or rank", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("admin-ajax.php")) return Response.json({ amount: "25380.711", get_rate: "25.3807", status_msg: "SUCCESS" });
      if (String(url).includes("alansariexchange.com/send-money")) return new Response(config);
      return new Response(null, { status: 503 });
    });
    const result = await comparePrices(input, { fetcher, now });
    expect(result.rows.find(row => row.providerSlug === "al-ansari-exchange")).toMatchObject({
      basis: "live_public", partial: true, costComplete: false, feeAmount: null, recipientAmount: 25380.71, shortfall: null,
    });
    const request = fetcher.mock.calls.find(([url]) => String(url).endsWith("admin-ajax.php"))?.[1];
    expect(request?.method).toBe("POST");
    expect(Object.fromEntries(request?.body as URLSearchParams)).toMatchObject({ currfrom: "91", currto: "26", cntcode: "26", trtype: "BT", amt: "1000" });
  });

  it("leaves USD-to-INR unpriced by this calculator", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(alAnsariPublicReference({ ...input, sourceCurrency: "USD" }, fetcher, now)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a different calculator endpoint before posting", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(config.replace("alansariexchange.com", "other.example")));
    await expect(alAnsariPublicReference(input, fetcher, now)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
