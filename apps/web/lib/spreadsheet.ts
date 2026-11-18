/**
 * Reads a CSV or Excel (.xlsx) file into rows of trimmed strings, in the
 * browser — the file never leaves the device.
 *
 * An .xlsx file is a zip of XML. Only the first worksheet and the shared
 * strings are read; formulas aren't evaluated (the value Excel saved is used),
 * which is all a payroll sheet or a bank export needs.
 */
export type Table = string[][];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_XML_BYTES = 25 * 1024 * 1024;

function delimiterOf(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ",";
}

/** RFC 4180-style CSV: quoted fields, doubled quotes, CRLF or LF; comma, semicolon or tab separated. */
export function parseCsv(input: string): Table {
  const text = input.replace(/^﻿/, "");
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === "\"" && field.trim() === "") { quoted = true; field = ""; }
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.map((cells) => cells.map((cell) => cell.trim())).filter((cells) => cells.some((cell) => cell !== ""));
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The named entries of a zip archive, decoded as UTF-8 text. */
export async function unzipText(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("This doesn’t look like an .xlsx file. Save it as .xlsx or CSV and try again.");
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (let n = 0; n < count; n += 1) {
    if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) throw new Error("This .xlsx file is damaged. Re-save it and try again.");
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const size = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const local = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    pointer += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    if (size > MAX_XML_BYTES) throw new Error("This sheet is too large to read here. Split it into smaller files.");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressedSize);
    const raw = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
    if (!raw) throw new Error("This .xlsx file uses a compression Railor can’t read. Save it as CSV instead.");
    if (raw.length > MAX_XML_BYTES) throw new Error("This sheet is too large to read here. Split it into smaller files.");
    files.set(name, decoder.decode(raw));
  }
  return files;
}

function xmlText(value: string) {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

function runs(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => xmlText(match[1]!)).join("");
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** First worksheet of an .xlsx workbook. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<Table> {
  const files = await unzipText(buffer, (name) => name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const sheets = [...files.keys()].filter((name) => name.startsWith("xl/worksheets/")).sort((a, b) => Number(/\d+/.exec(a.slice(14))?.[0]) - Number(/\d+/.exec(b.slice(14))?.[0]));
  const sheet = sheets[0] ? files.get(sheets[0])! : null;
  if (!sheet) throw new Error("This workbook has no worksheet Railor can read.");
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => runs(match[1]!));
  const table: Table = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? runs(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "") : v !== undefined ? xmlText(v) : "";
      const index = ref ? columnIndex(ref) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = value.trim();
    }
    if (cells.some((cell) => cell !== "")) table.push(cells);
  }
  return table;
}

/** CSV or .xlsx, chosen by the file's name. */
export async function readTable(file: File): Promise<Table> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Files up to 5 MB. Split larger exports into months.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return parseXlsx(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new Error("Old .xls files aren’t supported. Save as .xlsx or CSV.");
  return parseCsv(await file.text());
}

/** Plain number from a money cell: "1,23,456.78", "(1,234.00)", "INR 1,234", "1.234,56". */
export function parseAmount(cell: string | undefined): number | null {
  if (!cell) return null;
  let value = cell.trim();
  const negative = /^\(.*\)$/.test(value) || /^-/.test(value) || /\bDR\b/i.test(value);
  value = value.replace(/[^0-9.,]/g, "");
  if (!value) return null;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) value = lastComma > lastDot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  else if (lastComma > -1) value = /,\d{2}$/.test(value) && value.split(",").length === 2 ? value.replace(",", ".") : value.replace(/,/g, "");
  const number = Number(value);
  return Number.isFinite(number) ? (negative ? -number : number) : null;
}

/** Index of the first header matching a synonym (exact first, then contains), skipping columns already claimed. */
export function findColumn(header: string[], synonyms: string[], skip: ReadonlyArray<number | null> = []): number | null {
  const normal = header.map((cell) => cell.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  const free = (index: number) => !skip.includes(index);
  for (const synonym of synonyms) {
    const exact = normal.findIndex((cell, index) => cell === synonym && free(index));
    if (exact > -1) return exact;
  }
  for (const synonym of synonyms) {
    const partial = normal.findIndex((cell, index) => cell.includes(synonym) && free(index));
    if (partial > -1) return partial;
  }
  return null;
}
