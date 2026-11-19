import { describe, expect, it } from "vitest";
import { createOnboardedEmail } from "./onboarded";

describe("onboarding-complete email", () => {
  it("greets by first name and links into the dashboard", () => {
    const mail = createOnboardedEmail({ to: "ana@example.com", name: "Ana Lopez", dashboardName: "Acme", savedRoutes: 2, appUrl: "https://www.railor.xyz/" });
    expect(mail.subject).toBe("You’re all set on Railor");
    expect(mail.text).toContain("Hi Ana,");
    expect(mail.text).toContain("2 routes are saved");
    expect(mail.html).toContain('href="https://www.railor.xyz/app"');
    expect(mail.attachments?.[0]?.cid).toBe("railor-logo@mail.railor.xyz");
  });

  it("escapes a dashboard name before it reaches the HTML", () => {
    const mail = createOnboardedEmail({ to: "x@example.com", dashboardName: "<script>x</script>", savedRoutes: 0 });
    expect(mail.html).not.toContain("<script>x");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("Hi,");
  });
});
