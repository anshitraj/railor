"use client";

import { AccessRequestButton } from "./access-request";

export function ExecutionAccess({ provider }: { provider: string }) {
  return <div className="mt-4"><AccessRequestButton provider={provider} /></div>;
}
