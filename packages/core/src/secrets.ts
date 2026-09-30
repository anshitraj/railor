import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for everything Railor must be able to read back but must never
 * store in clear: provider credentials, beneficiary account details and
 * outbound webhook signing secrets. One key (CREDENTIALS_ENCRYPTION_KEY),
 * a fresh random IV per value, auth tag carried alongside, so each stored
 * string is both encrypted and tamper-evident.
 * Format: base64(iv):base64(tag):base64(ciphertext).
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set. Railor cannot store secrets without it.");
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return buffer;
}

export function secretsConfigured(): boolean {
  return Boolean(process.env.CREDENTIALS_ENCRYPTION_KEY?.trim());
}

export function encryptJson(data: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptJson(blob: string): Record<string, string> {
  const [ivB64, tagB64, dataB64] = blob.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext.");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
}

export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");
