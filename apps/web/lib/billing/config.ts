/**
 * Which ways to pay are switched on, read from the environment.
 *
 *   Card and UPI (Dodo Payments, merchant of record):
 *     DODO_PAYMENTS_API_KEY, DODO_PAYMENTS_WEBHOOK_KEY,
 *     DODO_PAYMENTS_ENVIRONMENT = test_mode | live_mode (default test_mode),
 *     DODO_PRODUCT_PLUS / _PRO / _BUSINESS  — monthly subscription products,
 *     DODO_PRODUCT_TOP_UP                   — one-time, pay-what-you-want product.
 *   USDC (ArcPay, on Arc):
 *     ARCPAY_API_KEY (sk_arc_test_… or sk_arc_live_…), ARCPAY_WEBHOOK_SECRET,
 *     ARCPAY_BASE_URL (default https://arcpay.systems).
 *
 * A production deployment never offers a test-mode provider unless
 * BILLING_ALLOW_TEST_MODE=enabled, so test keys can't hand out real plans.
 */
import type { BillingPlan } from "@railor/database";

export type PayMethod = "card" | "usdc";
export const PAY_METHODS: readonly PayMethod[] = ["card", "usdc"];

export interface DodoConfig {
  apiKey: string;
  webhookKey: string | null;
  baseUrl: string;
  testMode: boolean;
  products: Record<BillingPlan | "topUp", string | null>;
}

export interface ArcPayConfig {
  apiKey: string;
  webhookSecret: string | null;
  baseUrl: string;
  testMode: boolean;
}

const read = (name: string) => process.env[name]?.trim() || null;
const productId = (name: string) => { const value = read(name); return value && /^[A-Za-z0-9_-]{3,80}$/.test(value) ? value : null; };

export function testModeAllowed(): boolean {
  return process.env.VERCEL_ENV !== "production" || read("BILLING_ALLOW_TEST_MODE")?.toLowerCase() === "enabled";
}

export function dodoConfig(): DodoConfig | null {
  const apiKey = read("DODO_PAYMENTS_API_KEY");
  if (!apiKey) return null;
  const testMode = read("DODO_PAYMENTS_ENVIRONMENT") !== "live_mode";
  if (testMode && !testModeAllowed()) return null;
  return {
    apiKey,
    webhookKey: read("DODO_PAYMENTS_WEBHOOK_KEY"),
    baseUrl: testMode ? "https://test.dodopayments.com" : "https://live.dodopayments.com",
    testMode,
    products: {
      plus: productId("DODO_PRODUCT_PLUS"),
      pro: productId("DODO_PRODUCT_PRO"),
      business: productId("DODO_PRODUCT_BUSINESS"),
      topUp: productId("DODO_PRODUCT_TOP_UP"),
    },
  };
}

export function arcpayConfig(): ArcPayConfig | null {
  const apiKey = read("ARCPAY_API_KEY");
  if (!apiKey) return null;
  const testMode = !apiKey.startsWith("sk_arc_live_");
  if (testMode && !testModeAllowed()) return null;
  let baseUrl = "https://arcpay.systems";
  const custom = read("ARCPAY_BASE_URL");
  if (custom) {
    const url = new URL(custom);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) throw new Error("ARCPAY_BASE_URL must be HTTPS");
    baseUrl = url.origin;
  }
  return { apiKey, webhookSecret: read("ARCPAY_WEBHOOK_SECRET"), baseUrl, testMode };
}

/** The plan a Dodo product sells, or null for a product Railor doesn't know. */
export function planForDodoProduct(config: DodoConfig, product: string | null | undefined): BillingPlan | null {
  if (!product) return null;
  for (const plan of ["plus", "pro", "business"] as const) if (config.products[plan] === product) return plan;
  return null;
}

export interface MethodAvailability { card: boolean; usdc: boolean; cardTest: boolean; usdcTest: boolean }

/** Which methods can pay for this thing right now. */
export function availableMethods(purpose: "plan" | "top_up", plan?: BillingPlan): MethodAvailability {
  let dodo: DodoConfig | null = null;
  let arc: ArcPayConfig | null = null;
  try { dodo = dodoConfig(); } catch { dodo = null; }
  try { arc = arcpayConfig(); } catch { arc = null; }
  const product = dodo ? (purpose === "plan" ? (plan ? dodo.products[plan] : null) : dodo.products.topUp) : null;
  return { card: Boolean(product), usdc: Boolean(arc), cardTest: Boolean(product && dodo?.testMode), usdcTest: Boolean(arc?.testMode) };
}
