import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { technologyMark } from "../../../packages/ui/src/primitives/technology-logo";

describe("local technology marks", () => {
  it.each([
    ["TypeScript", "typescript.svg"], ["ts", "typescript.svg"],
    ["Python", "python.svg"], ["py", "python.svg"],
    ["Node.js", "nodejs.svg"], ["cURL", "curl.svg"],
    ["MCP", "mcp.png"], ["mcp.json", "mcp.png"],
    ["Google", "google.png"], ["GitHub", "github.png"],
    ["Cursor", "cursor.svg"], ["VS Code", "vscode.png"],
    ["Antigravity", "antigravity.png"], ["Claude Code", "claude.png"],
    ["Codex", "codex.png"],
  ])("resolves %s to a valid bundled image", (name, file) => {
    expect(technologyMark(name)?.file).toBe(file);
    const bytes = readFileSync(join(process.cwd(), "public", "brand", "technology", file));
    if (file.endsWith(".svg")) {
      const svg = bytes.toString("utf8");
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/<script|<foreignObject|<!DOCTYPE|\bon\w+\s*=|(?:xlink:)?href\s*=\s*["'](?:https?:|javascript:)/i);
    } else {
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
  });

  it.each(["REST", "JSON", "new-unknown-sdk", "__proto__", "constructor", "../python"])("does not fabricate artwork for %s", (name) => {
    expect(technologyMark(name)).toBeUndefined();
  });
});
