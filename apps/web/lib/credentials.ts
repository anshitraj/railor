import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Provider connections cannot store credentials without it.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function credentialsConfigured(): boolean {
  return Boolean(process.env.CREDENTIALS_ENCRYPTION_KEY?.trim());
}

/**
 * AES-256-GCM: a fresh random IV per call (never reused with this key) and
 * the auth tag travel alongside the ciphertext, so a single opaque string is
 * both encrypted and tamper-evident. Format: base64(iv):base64(tag):base64(ciphertext).
 */
export function encryptCredentials(data: Record<string, string>): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptCredentials(blob: string): Record<string, string> {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = blob.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed credential ciphertext.");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}
