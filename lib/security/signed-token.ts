import { createHmac, timingSafeEqual } from "node:crypto";

// Links in customer emails ("manage your booking") carry a signed token
// instead of the booking id, so a guessed or altered link opens nothing.
// Token = base64url(uuid bytes + expiry) "." base64url(HMAC-SHA256, 16 bytes).
// The signing key is derived from ENCRYPTION_KEY, so there's no new secret
// to set up; the purpose string keeps it separate from other uses.

const PURPOSE = "chatalot:booking-link:v1";

function signingKey(): Buffer {
  const secret = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (secret.length !== 32) throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return createHmac("sha256", secret).update(PURPOSE).digest();
}

function sign(payload: Buffer): Buffer {
  return createHmac("sha256", signingKey()).update(payload).digest().subarray(0, 16);
}

export function createBookingToken(bookingId: string, expiresAt: Date): string {
  const id = Buffer.from(bookingId.replace(/-/g, ""), "hex");
  if (id.length !== 16) throw new Error("Not a booking id");
  const expiry = Buffer.alloc(4);
  expiry.writeUInt32BE(Math.floor(expiresAt.getTime() / 1000));
  const payload = Buffer.concat([id, expiry]);
  return `${payload.toString("base64url")}.${sign(payload).toString("base64url")}`;
}

// The booking id, or null for a token that's malformed, altered or expired.
export function readBookingToken(token: string, now = new Date()): string | null {
  const [payloadPart, sigPart] = token.split(".");
  if (!payloadPart || !sigPart) return null;
  const payload = Buffer.from(payloadPart, "base64url");
  const sig = Buffer.from(sigPart, "base64url");
  if (payload.length !== 20 || sig.length !== 16) return null;
  if (!timingSafeEqual(sig, sign(payload))) return null;
  if (payload.readUInt32BE(16) * 1000 < now.getTime()) return null;
  const hex = payload.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
