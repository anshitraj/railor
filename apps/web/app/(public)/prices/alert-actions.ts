"use server";

import { headers } from "next/headers";
import { ensureMigrated } from "@railor/database";
import { subscribeByEmail, type SubscribeResult } from "../../../lib/email-subscriptions";
import { requestIdentityFromHeaders } from "../../../lib/rate-limit";

/** "Send me updates" for someone who isn't signed in: it only asks for a confirmation, never starts sending. */
export async function subscribeToRateUpdates(input: { email: string; from: string; to: string; amount: number }): Promise<SubscribeResult> {
  await ensureMigrated();
  return subscribeByEmail({ ...input, identity: requestIdentityFromHeaders(await headers()) });
}
