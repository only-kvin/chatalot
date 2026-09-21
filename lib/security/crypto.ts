import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// AES-256-GCM. Used for WhatsApp access tokens at rest (channels.wa_access_token_encrypted).
// ENCRYPTION_KEY is a base64-encoded 32-byte key — generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

function getKey(): Buffer {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

// Output format: base64(iv [12 bytes] + authTag [16 bytes] + ciphertext)
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
