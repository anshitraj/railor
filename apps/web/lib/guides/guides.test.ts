import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_TOPICS, guideBySlug, guidesInTopic } from "./catalog";
import { GUIDE_CONTENT, type Block } from "./content";
import { POPULAR_DESTINATIONS, convertHref, currencyForCountry, linkForViewer, resolveDestinations } from "./destinations";
import { guideJsonLd, jsonLdScript } from "./schema";

const flags = join(__dirname, "..", "..", "public", "flags");

/** Every string a guide shows, so a rule can be checked against all of them. */
function textOf(slug: string): string[] {
  const content = GUIDE_CONTENT[slug]!;
  const fromBlock = (block: Block): string[] =>
    block.type === "p" ? [block.text]
      : block.type === "list" ? block.items
        : block.type === "callout" ? [block.title, block.text]
          : [...(block.caption ? [block.caption] : []), ...block.head, ...block.rows.flat()];
  return [content.intro, ...content.sections.flatMap((section) => [section.heading, ...section.blocks.flatMap(fromBlock)]), ...content.faq.flatMap((item) => [item.q, item.a])];
}

describe("guide catalogue", () => {
  it("has at least five guides, each with text and a unique address", () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(GUIDES.map((guide) => guide.slug)).size).toBe(GUIDES.length);
    for (const guide of GUIDES) expect(GUIDE_CONTENT[guide.slug], guide.slug).toBeDefined();
    expect(Object.keys(GUIDE_CONTENT).sort()).toEqual(GUIDES.map((guide) => guide.slug).sort());
  });

  it("puts every guide under a topic, and every topic has a guide", () => {
    for (const guide of GUIDES) expect(GUIDE_TOPICS.some((topic) => topic.id === guide.topic)).toBe(true);
    for (const topic of GUIDE_TOPICS) expect(guidesInTopic(topic.id).length, topic.id).toBeGreaterThan(0);
  });

  it("draws every guide with flags the site actually serves", () => {
    for (const guide of GUIDES) {
      for (const code of [...guide.art.flags, guide.route.country]) if (code) expect(existsSync(join(flags, `${code}.svg`)), `${guide.slug}: ${code}`).toBe(true);
    }
  });

  it("keeps section ids unique and tables rectangular", () => {
    for (const guide of GUIDES) {
      const { sections } = GUIDE_CONTENT[guide.slug]!;
      expect(new Set(sections.map((section) => section.id)).size, guide.slug).toBe(sections.length);
      for (const block of sections.flatMap((section) => section.blocks)) {
        if (block.type === "table") for (const row of block.rows) expect(row.length, `${guide.slug}: ${row[0]}`).toBe(block.head.length);
      }
    }
  });

  it("links only to guides and pages that exist", () => {
    for (const guide of GUIDES) {
      for (const text of textOf(guide.slug)) {
        for (const [, href] of text.matchAll(/\]\((\/[^)\s]*)\)/g)) {
          if (href!.startsWith("/guides/")) expect(guideBySlug(href!.slice("/guides/".length)), `${guide.slug} → ${href}`).toBeDefined();
          else expect(href, `${guide.slug} → ${href}`).toMatch(/^\/(prices|guides)(\?|$)/);
        }
      }
    }
  });

  it("never quotes a provider's price: no provider names and no money figures", () => {
    const providers = /\b(wise|remitly|western union|xoom|moneygram|ria|paysend|revolut|paypal|zelle|worldremit|instarem|xe\.com)\b/i;
    for (const guide of GUIDES) {
      for (const text of textOf(guide.slug)) {
        expect(text, `${guide.slug}: ${text.slice(0, 40)}`).not.toMatch(providers);
        expect(text, `${guide.slug}: ${text.slice(0, 40)}`).not.toMatch(/[$₹£€]\s?\d/);
      }
    }
  });

  it("labels the one worked example as an example", () => {
    const cost = GUIDE_CONTENT["real-cost-of-sending-money"]!;
    const example = cost.sections.flatMap((section) => section.blocks).find((block) => block.type === "callout" && block.tone === "example");
    expect(example).toMatchObject({ title: expect.stringMatching(/example/i) });
    // The arithmetic in the example table is the arithmetic.
    expect(1000 * 88).toBe(88_000);
    expect(995 * 89.6).toBeCloseTo(89_152, 6);
    expect(90_000 - 88_000).toBe(2_000);
    expect(90_000 - 89_152).toBe(848);
    expect(((90_000 - 88_000) / 90_000) * 100).toBeCloseTo(2.2, 1);
    expect(((90_000 - 89_152) / 90_000) * 100).toBeCloseTo(0.9, 1);
  });
});

describe("search-engine markup", () => {
  it("describes each guide and its questions in plain text, and can never close its own script tag", () => {
    for (const guide of GUIDES) {
      const [article, faq] = guideJsonLd(guide, GUIDE_CONTENT[guide.slug]!, "https://railor.test/") as Array<Record<string, unknown>>;
      expect(article).toMatchObject({ "@type": "Article", headline: guide.title, url: `https://railor.test/guides/${guide.slug}` });
      const answers = (faq!.mainEntity as Array<{ acceptedAnswer: { text: string } }>).map((item) => item.acceptedAnswer.text);
      expect(answers.length).toBe(GUIDE_CONTENT[guide.slug]!.faq.length);
      // Links and bold markers are stripped: an answer is text, not markup.
      for (const answer of answers) expect(answer).not.toMatch(/\*\*|\]\(/);
    }
    expect(jsonLdScript({ text: "</script><b>" })).not.toContain("<");
    expect(JSON.parse(jsonLdScript({ text: "</script>" }))).toEqual({ text: "</script>" });
  });
});

describe("destinations", () => {
  it("lists each popular country once, with a flag on file and an ISO currency", () => {
    expect(new Set(POPULAR_DESTINATIONS.map((destination) => destination.code)).size).toBe(POPULAR_DESTINATIONS.length);
    for (const destination of POPULAR_DESTINATIONS) {
      expect(destination.currency).toMatch(/^[A-Z]{3}$/);
      expect(existsSync(join(flags, `${destination.code}.svg`)), destination.code).toBe(true);
    }
    expect(POPULAR_DESTINATIONS[0]!.code).toBe("IN");
  });

  const countries = [{ value: "IN", label: "India" }, { value: "FR", label: "France" }, { value: "PH", label: "Philippines" }, { value: "DE", label: "Germany" }, { value: "US", label: "United States" }];
  const currencies = [{ value: "USD" }, { value: "INR" }, { value: "EUR" }];
  const byCountry = { IN: "INR", DE: "EUR", US: "USD" };

  it("lists only countries whose currency Railor can price, and finds the euro for France", () => {
    expect(currencyForCountry("FR", byCountry)).toBe("EUR");
    const { popular, all } = resolveDestinations(countries, currencies, byCountry);
    // The Philippines is dropped: its peso isn't in the reference data, so a link would price the wrong currency.
    expect(popular.map((destination) => destination.code)).toEqual(["IN", "FR"]);
    expect(all.map((destination) => destination.name)).toEqual(["France", "Germany", "India"]);
  });

  it("sends a visitor to the public calculator as a personal sender in the US", () => {
    const url = new URL(convertHref({ code: "IN", currency: "INR" }, { signedIn: false }), "https://railor.test");
    expect(url.pathname).toBe("/prices");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: "USD", to: "INR", amount: "1000", destinationCountry: "IN", direction: "send", profile: "personal", country: "US", purpose: "personal", market: "1" });
  });

  it("sends a signed-in person to their workspace and leaves their own profile alone", () => {
    const url = new URL(convertHref({ code: "FR", currency: "EUR" }, { signedIn: true }), "https://railor.test");
    expect(url.pathname).toBe("/app/prices");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: "USD", to: "EUR", amount: "1000", destinationCountry: "FR", direction: "send" });
  });

  it("rewrites a written public link for a signed-in viewer, and leaves other links alone", () => {
    const written = "/prices?from=USD&to=INR&amount=1000&destinationCountry=IN&direction=send&profile=personal&country=US&purpose=personal&market=1";
    expect(linkForViewer(written, false)).toBe(written);
    expect(linkForViewer(written, true)).toBe("/app/prices?from=USD&to=INR&amount=1000&destinationCountry=IN&direction=send");
    expect(linkForViewer("/guides/usd-to-inr", true)).toBe("/guides/usd-to-inr");
    expect(linkForViewer("/prices", true)).toBe("/app/prices");
  });
});
