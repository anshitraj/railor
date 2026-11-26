import { ensureMigrated } from "@railor/database";
import { unsubscribeSubscription } from "../../../../lib/email-subscriptions";
import { unsubscribeRateAlert } from "../../../../lib/rate-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function page(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Railor</title>
<style>body{margin:0;background:#f5f3ee;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#1c1b19}main{max-width:440px;margin:12vh auto;padding:32px 28px;background:#fffdfa;border:1px solid #eae5db;border-radius:16px}h1{margin:0 0 10px;font-size:24px;letter-spacing:-.4px}p{margin:0 0 18px;font-size:15px;line-height:1.55;color:#45413c}button{width:100%;min-height:46px;border:0;border-radius:10px;background:#c84420;color:#fff;font:600 15px inherit;cursor:pointer}a{color:#45413c}@media(max-width:480px){main{margin:16px;padding:24px 20px}}</style></head>
<body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * GET shows a confirm button, so mail scanners that follow links can't switch
 * an alert off. POST does it — the button, or a mail client's one-click
 * unsubscribe (RFC 8058), which posts here without a Railor session.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return page("Stop these rate updates", `<h1>Stop these rate updates?</h1><p>You won’t get emails for this pair any more. A saved pair stays saved.</p>
<form method="post" action="/api/alerts/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`);
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  await ensureMigrated();
  // A signed-in person's alert, or a confirmed address's subscription: the token says which.
  const stopped = await unsubscribeRateAlert(token) ?? await unsubscribeSubscription(token);
  if (!stopped) return page("Alert not found", `<h1>Already stopped</h1><p>This link is out of date, or the updates were already stopped. Signed-in people can manage them in <a href="/app/saved">Saved</a>.</p>`, 404);
  return page("Updates stopped", `<h1>Updates stopped</h1><p>No more emails for <strong>${escapeHtml(stopped.label)}</strong>. You can ask for them again any time from the <a href="/prices">price comparison</a>.</p>`);
}
