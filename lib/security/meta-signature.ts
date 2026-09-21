import { createHmac, timingSafeEqual } from "node:crypto";

// Verifies Meta's X-Hub-Signature-256 header against the raw request body.
// Must run against the raw, unparsed body — HMAC is computed over the exact bytes Meta sent.
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const [algo, providedHex] = signatureHeader.split("=");
  if (algo !== "sha256" || !providedHex) return false;

  const expectedHex = createHmac("sha256", process.env.META_APP_SECRET ?? "")
    .update(rawBody, "utf8")
    .digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }

  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
