import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { createSignInEmail } from "../lib/emails/sign-in";

// Run from the repository root:
// pnpm --filter @railor/core exec tsx ../../apps/web/scripts/preview-sign-in-email.ts
// Uses a synthetic URL and stream transport; no email is sent.
async function main() {
  const directory = new URL("../../../.railor/email-preview/", import.meta.url);
  const message = createSignInEmail("you@example.com", "https://www.railor.xyz/auth/verify?token=preview-only-not-a-real-token");
  let html = message.html!;
  for (const image of message.attachments!) {
    html = html.replaceAll(`cid:${image.cid}`, `data:${image.contentType};base64,${image.content.toString("base64")}`);
  }
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const mime = await transporter.sendMail({ from: "Railor <hello@mail.railor.xyz>", ...message });
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("sign-in.html", directory), html);
  await writeFile(new URL("sign-in.txt", directory), message.text);
  await writeFile(new URL("sign-in.eml", directory), mime.message);
  console.log(`Email preview: ${fileURLToPath(new URL("sign-in.html", directory))}`);
}

main().catch(() => { console.error("Could not generate the email preview."); process.exitCode = 1; });
