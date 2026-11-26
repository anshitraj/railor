import { ensureMigrated } from "@railor/database";
import { confirmSubscription } from "../../../../lib/email-subscriptions";
import { FREQUENCY_LABEL } from "../../../../lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function page(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Railor</title>
<style>body{margin:0;background:#f5f3ee;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#1c1b19}main{max-width:440px;margin:12vh auto;padding:32px 28px;background:#fffdfa;border:1px solid #eae5db;border-radius:16px}h1{margin:0 0 10px;font-size:24px;letter-spacing:-.4px}p{margin:0 0 18px;font-size:15px;line-height:1.55;color:#45413c}button,.btn{display:block;width:100%;box-sizing:border-box;min-height:46px;padding:13px 0;border:0;border-radius:10px;background:#c84420;color:#fff;font:600 15px inherit;text-align:center;text-decoration:none;cursor:pointer}a{color:#45413c}@media(max-width:480px){main{margin:16px;padding:24px 20px}}</style></head>
<body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * GET shows a button, so a mail scanner that follows every link can't confirm
 * an address for its owner. POST confirms: the button on this page.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return page("Confirm your rate updates", `<h1>Confirm your rate updates</h1><p>One tap and Railor starts sending them to this address.</p>
<form method="post" action="/api/alerts/confirm?token=${encodeURIComponent(token)}"><button type="submit">Yes, send me updates</button></form>`);
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  await ensureMigrated();
  const confirmed = await confirmSubscription(token);
  if (!confirmed) return page("Link out of date", `<h1>This link is out of date</h1><p>It may have been used, or the updates were stopped. You can ask for them again from the <a href="/prices">price comparison</a>.</p>`, 404);
  return page("You’re subscribed", `<h1>You’re all set.</h1><p>Railor will email <strong>${escapeHtml(confirmed.email)}</strong> ${escapeHtml(FREQUENCY_LABEL[confirmed.frequency].toLowerCase())} updates for <strong>${escapeHtml(confirmed.label)}</strong>. The first one arrives in your next daily check, usually within a day.</p><p>Every email has an unsubscribe link, and you can stop at any time.</p><a class="btn" href="/prices">Back to Railor</a>`);
}
