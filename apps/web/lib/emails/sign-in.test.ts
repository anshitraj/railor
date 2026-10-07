import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";
import { createSignInEmail } from "./sign-in";
import { MAGIC_LINK_MINUTES } from "../auth-constants";

const verificationUrl = "https://www.railor.xyz/auth/verify?token=not-a-real-token&source=email";

describe("Railor verification email", () => {
  it("keeps the real verification URL and expiry in the HTML and plain-text alternatives", () => {
    const email = createSignInEmail("member@example.com", verificationUrl);
    expect(email.text).toContain(verificationUrl);
    expect(email.text).toContain(`expires in ${MAGIC_LINK_MINUTES} minutes`);
    expect(email.text).toContain("can only be used once");
    expect(email.html).toContain('href="https://www.railor.xyz/auth/verify?token=not-a-real-token&amp;source=email"');
    expect(email.html).toContain(`Expires in <strong style="font-weight:600;">${MAGIC_LINK_MINUTES} minutes`);
    expect(email.text).toContain("Didn't request this email?");
    expect(email.html).toContain("Never share this link.");
  });

  it("escapes recipient text instead of allowing markup into the email", () => {
    const email = createSignInEmail('<img src=x onerror="alert(1)">@example.com', verificationUrl);
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;@example.com");
  });

  it.each(["javascript:alert(1)", "data:text/html,hello", "https://user:password@railor.xyz/auth/verify"])(
    "rejects a non-web or credential-bearing action URL: %s", (url) => {
      expect(() => createSignInEmail("member@example.com", url)).toThrow("Invalid sign-in email URL");
    },
  );

  it("builds a real MIME email containing both original PNG logos as inline images", async () => {
    const email = createSignInEmail("member@example.com", verificationUrl);
    const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const result = await transporter.sendMail({ from: "Railor <hello@mail.railor.xyz>", ...email });
    const mime = result.message.toString();
    expect(mime).toContain("multipart/alternative");
    expect(mime).toContain("multipart/related");
    expect(mime).toContain("Content-Type: text/plain");
    expect(mime).toContain("Content-Type: text/html");
    for (const attachment of email.attachments!) {
      expect(mime).toContain(`Content-ID: <${attachment.cid}>`);
      expect(mime).toContain(`Content-Disposition: inline; filename=${attachment.filename}`);
      expect(attachment.content.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(email.html).toContain(`src="cid:${attachment.cid}"`);
    }
    // Both logos are self-contained; there is no remote image or tracking pixel.
    expect(email.html).not.toMatch(/<img[^>]+src="https?:/);
  });
});
