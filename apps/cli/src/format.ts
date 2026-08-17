/**
 * Minimal, dependency-free output formatting. No color library: a handful of
 * raw ANSI codes covers what a terminal table needs, and it's the same
 * restraint the rest of this codebase applies to dependencies.
 */
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const COLORS = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  purple: "\x1b[35m",
} as const;

const isTTY = process.stdout.isTTY ?? false;
const paint = (code: string, text: string) => (isTTY ? `${code}${text}${RESET}` : text);

export const dim = (text: string) => paint(DIM, text);
export const bold = (text: string) => paint(BOLD, text);

const VERDICT_COLOR: Record<string, string> = {
  supported: COLORS.green,
  additional_requirements: COLORS.yellow,
  unavailable: COLORS.red,
  unknown: COLORS.gray,
};

export function verdict(value: string): string {
  return paint(VERDICT_COLOR[value] ?? "", value);
}

export function table(rows: Array<Record<string, string>>, columns: string[]): string {
  if (!rows.length) return dim("(no results)");

  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => (r[col] ?? "").length)),
  );

  const line = (cells: string[], color = (s: string) => s) =>
    cells.map((cell, i) => color(cell.padEnd(widths[i]!))).join("  ");

  const header = line(
    columns.map((c) => c.toUpperCase()),
    (s) => paint(COLORS.gray, s),
  );
  const body = rows.map((row) => line(columns.map((c) => row[c] ?? "")));

  return [header, ...body].join("\n");
}

export function errorLine(message: string): string {
  return paint(COLORS.red, `✗ ${message}`);
}

export function successLine(message: string): string {
  return paint(COLORS.green, `✓ ${message}`);
}

export const purple = (text: string) => paint(COLORS.purple, text);

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
