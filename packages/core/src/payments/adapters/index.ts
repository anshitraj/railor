import type { PayoutAdapter } from "../types.js";
import { airwallexPayoutAdapter, airwallexProviderAdapter } from "./airwallex.js";
import { bridgePayoutAdapter } from "./bridge.js";
import { circlePayoutAdapter } from "./circle.js";
import { sandboxPayoutAdapter } from "./sandbox.js";
import { wisePayoutAdapter, wiseProviderAdapter, wisePublicQuote } from "./wise.js";

/** Providers Railor can execute payouts through, via the organization's own connected account. */
export const PAYOUT_ADAPTERS: Record<string, PayoutAdapter> = {
  bridge: bridgePayoutAdapter,
  circle: circlePayoutAdapter,
  wise: wisePayoutAdapter,
  airwallex: airwallexPayoutAdapter,
};

export function getPayoutAdapter(slug: string): PayoutAdapter | null {
  return PAYOUT_ADAPTERS[slug] ?? null;
}

export {
  airwallexPayoutAdapter,
  airwallexProviderAdapter,
  bridgePayoutAdapter,
  circlePayoutAdapter,
  sandboxPayoutAdapter,
  wisePayoutAdapter,
  wiseProviderAdapter,
  wisePublicQuote,
};
