import { cn } from "../cn.js";

const MARKS = {
  typescript: { name: "TypeScript", file: "typescript.svg" },
  python: { name: "Python", file: "python.svg" },
  nodejs: { name: "Node.js", file: "nodejs.svg" },
  curl: { name: "cURL", file: "curl.svg" },
  mcp: { name: "Model Context Protocol", file: "mcp.png" },
  google: { name: "Google", file: "google.png" },
  github: { name: "GitHub", file: "github.png" },
  cursor: { name: "Cursor", file: "cursor.svg" },
  vscode: { name: "Visual Studio Code", file: "vscode.png" },
  antigravity: { name: "Antigravity", file: "antigravity.png" },
  claude: { name: "Claude", file: "claude.png" },
  codex: { name: "OpenAI Codex", file: "codex.png" },
} as const;

const ALIASES: Record<string, keyof typeof MARKS> = {
  ts: "typescript", typescript: "typescript", python: "python", py: "python",
  nodejs: "nodejs", node: "nodejs", curl: "curl", mcp: "mcp", mcpjson: "mcp",
  google: "google", github: "github", cursor: "cursor", vscode: "vscode",
  visualstudiocode: "vscode", antigravity: "antigravity", claude: "claude", claudecode: "claude",
  codex: "codex",
};

export function technologyMark(name: string) {
  if (/[/\\]/.test(name)) return undefined;
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = Object.hasOwn(ALIASES, normalized) ? ALIASES[normalized] : undefined;
  return key ? MARKS[key] : undefined;
}

export function TechnologyLogoStack({ names, size = 20 }: { names: string[]; size?: number }) {
  return <span aria-hidden className="inline-flex shrink-0 items-center gap-1">
    {names.map((name) => <TechnologyLogo key={name} name={name} size={size} />)}
  </span>;
}

/** Original local brand artwork, never a runtime third-party image request.
 * Labels remain visible; decorative marks don't repeat them to screen readers.
 */
export function TechnologyLogo({ name, fallbackName, size = 20, className, label }: {
  name: string;
  fallbackName?: string;
  size?: number;
  className?: string;
  /** Use only when the mark stands alone without an adjacent text label. */
  label?: string;
}) {
  const mark = technologyMark(name) ?? (fallbackName ? technologyMark(fallbackName) : undefined);
  if (!mark) return null;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[22%] bg-white p-[2px] ring-1 ring-black/10", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small static same-origin brand assets */}
      <img src={`/brand/technology/${mark.file}`} alt="" width={size} height={size} decoding="async" className="h-full w-full object-contain" />
    </span>
  );
}
