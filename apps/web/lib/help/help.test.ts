import { describe, expect, it } from "vitest";
import { guideBySlug } from "../guides/catalog";
import type { Block } from "../guides/content";
import { HELP_ARTICLES, HELP_TOPICS, articlesIn, helpHref, helpTopic, searchHelp } from "./catalog";
import { HELP_CONTENT, helpContent } from "./content";

const textOf = (key: string): string[] => {
  const content = HELP_CONTENT[key]!;
  const fromBlock = (block: Block): string[] =>
    block.type === "p" ? [block.text]
      : block.type === "list" ? block.items
        : block.type === "callout" ? [block.title, block.text]
          : [...(block.caption ? [block.caption] : []), ...block.head, ...block.rows.flat()];
  return [content.intro, ...content.sections.flatMap((section) => [section.heading, ...section.blocks.flatMap(fromBlock)])];
};

describe("help centre catalogue", () => {
  it("gives every article a topic and text, and every text an article", () => {
    for (const article of HELP_ARTICLES) {
      expect(helpTopic(article.topic), article.slug).toBeDefined();
      expect(helpContent(article.topic, article.slug), `${article.topic}/${article.slug}`).toBeDefined();
    }
    expect(Object.keys(HELP_CONTENT).sort()).toEqual(HELP_ARTICLES.map((article) => `${article.topic}/${article.slug}`).sort());
  });

  it("has no repeated address or title, and every topic has an article", () => {
    expect(new Set(HELP_ARTICLES.map(helpHref)).size).toBe(HELP_ARTICLES.length);
    expect(new Set(HELP_ARTICLES.map((article) => article.title)).size).toBe(HELP_ARTICLES.length);
    for (const topic of HELP_TOPICS) expect(articlesIn(topic.slug).length, topic.slug).toBeGreaterThan(0);
    expect(new Set(HELP_TOPICS.map((topic) => topic.slug)).size).toBe(HELP_TOPICS.length);
  });

  it("links only to pages and guides that exist", () => {
    const pages = /^\/(prices|pricing|guides|company\/trust|docs\/(api|sdks|mcp)|help(\/[a-z-]+\/[a-z-]+)?)(#contact)?$/;
    for (const key of Object.keys(HELP_CONTENT)) {
      for (const text of textOf(key)) {
        for (const [, href] of text.matchAll(/\]\((\/[^)\s]*)\)/g)) {
          if (href!.startsWith("/guides/")) expect(guideBySlug(href!.slice("/guides/".length)), `${key} → ${href}`).toBeDefined();
          else expect(href, `${key} → ${href}`).toMatch(pages);
        }
      }
    }
  });

  it("never quotes a provider's price or names a provider", () => {
    const providers = /\b(wise|remitly|western union|xoom|moneygram|ria|paysend|revolut|paypal|zelle|worldremit|instarem)\b/i;
    for (const key of Object.keys(HELP_CONTENT)) {
      for (const text of textOf(key)) {
        expect(text, `${key}: ${text.slice(0, 40)}`).not.toMatch(providers);
        expect(text, `${key}: ${text.slice(0, 40)}`).not.toMatch(/[$₹£€]\s?\d/);
      }
    }
  });

  it("keeps the popular list short enough to read without scrolling", () => {
    const popular = HELP_ARTICLES.filter((article) => article.popular);
    expect(popular.length).toBeGreaterThanOrEqual(5);
    expect(popular.length).toBeLessThanOrEqual(8);
  });
});

describe("searching the help centre", () => {
  it("finds an article by a word in its title, a keyword or its summary", () => {
    expect(searchHelp("alert")[0]!.slug).toBe("rate-alerts");
    expect(searchHelp("cancel").map((article) => article.slug)).toContain("change-plan");
    expect(searchHelp("mcp").map((article) => article.slug)).toContain("ai-assistants");
  });

  it("needs every word to match, and ranks a title match above a summary match", () => {
    expect(searchHelp("invoice upload").map((article) => article.slug)).toContain("upload-an-invoice");
    expect(searchHelp("zzzz qqqq")).toEqual([]);
    const ranked = searchHelp("invoice");
    expect(ranked[0]!.title.toLowerCase()).toContain("invoice");
  });

  it("returns nothing for an empty or one-letter query, and caps the list", () => {
    expect(searchHelp("")).toEqual([]);
    expect(searchHelp("   ")).toEqual([]);
    expect(searchHelp("a")).toEqual([]);
    expect(searchHelp("price", 3).length).toBeLessThanOrEqual(3);
  });
});
