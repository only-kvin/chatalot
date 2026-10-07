import { createHmac, timingSafeEqual } from "node:crypto";

// Links in customer emails ("manage your booking") carry a signed token
// instead of the booking id, so a guessed or altered link opens nothing.
// Token = base64url(uuid bytes + expiry) "." base64url(HMAC-SHA256, 16 bytes).
// The signing key is derived from ENCRYPTION_KEY, so there's no new secret
// to set up; the purpose string keeps it separate from other uses.

const BOOKING_PURPOSE = "chatalot:booking-link:v1";
const CUSTOMER_PURPOSE = "chatalot:customer-link:v1";

function signingKey(purpose: string): Buffer {
  const secret = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (secret.length !== 32) throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return createHmac("sha256", secret).update(purpose).digest();
}

function sign(payload: Buffer, purpose = BOOKING_PURPOSE): Buffer {
  return createHmac("sha256", signingKey(purpose)).update(payload).digest().subarray(0, 16);
}

const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex");
function uuidFrom(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createBookingToken(bookingId: string, expiresAt: Date): string {
  const id = uuidBytes(bookingId);
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
  return uuidFrom(payload.subarray(0, 16));
}

// The customer's own page (/c/<token>): which business, and the email
// address it was sent to. That page only shows what was booked with that
// address, so the token can't reach anyone else's bookings.
// Payload = business id (16 bytes) + expiry (4) + email.
export function createCustomerToken(tenantId: string, email: string, expiresAt: Date): string {
  const tenant = uuidBytes(tenantId);
  if (tenant.length !== 16) throw new Error("Not a business id");
  const expiry = Buffer.alloc(4);
  expiry.writeUInt32BE(Math.floor(expiresAt.getTime() / 1000));
  const payload = Buffer.concat([tenant, expiry, Buffer.from(email.trim().toLowerCase(), "utf8")]);
  return `${payload.toString("base64url")}.${sign(payload, CUSTOMER_PURPOSE).toString("base64url")}`;
}

export function readCustomerToken(token: string, now = new Date()): { tenantId: string; email: string } | null {
  const [payloadPart, sigPart] = token.split(".");
  if (!payloadPart || !sigPart) return null;
  const payload = Buffer.from(payloadPart, "base64url");
  const sig = Buffer.from(sigPart, "base64url");
  if (payload.length < 21 || payload.length > 300 || sig.length !== 16) return null;
  if (!timingSafeEqual(sig, sign(payload, CUSTOMER_PURPOSE))) return null;
  if (payload.readUInt32BE(16) * 1000 < now.getTime()) return null;
  return { tenantId: uuidFrom(payload.subarray(0, 16)), email: payload.subarray(20).toString("utf8") };
}
