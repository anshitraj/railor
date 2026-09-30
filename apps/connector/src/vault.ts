import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const Credentials = z.record(z.string().regex(/^[a-z0-9-]+$/), z.record(z.string().max(20000)));
function keyFrom(value: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("Vault key must be 32 random bytes encoded as hex");
  return Buffer.from(value, "hex");
}
export function sealVault(raw: unknown, keyHex: string): string {
  const key = keyFrom(keyHex); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("railor-connector-vault-v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(Credentials.parse(raw)), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("base64") });
}
export function openVault(serialized: string, keyHex: string) {
  const payload = z.object({ version: z.literal(1), iv: z.string().regex(/^[a-f0-9]{24}$/), tag: z.string().regex(/^[a-f0-9]{32}$/), ciphertext: z.string().max(1000000) }).strict().parse(JSON.parse(serialized));
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyHex), Buffer.from(payload.iv, "hex"));
  decipher.setAAD(Buffer.from("railor-connector-vault-v1")); decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  return Credentials.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8")));
}
export async function loadProviderCredentials(path: string, keyHex: string, provider: string) {
  const credentials = openVault(await readFile(path, "utf8"), keyHex)[provider];
  if (!credentials) throw new Error("provider_credentials_not_found");
  return Object.freeze(credentials);
}
