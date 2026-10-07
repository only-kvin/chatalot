// Staff photo uploads: what's accepted and where it's stored. The file's
// first bytes decide its type, not the name or the browser's claim.

export const PHOTO_BUCKET = "staff-photos";
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type ImageKind = { ext: "jpg" | "png" | "webp"; contentType: string };

export function imageKind(bytes: Uint8Array): ImageKind | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return { ext: "jpg", contentType: "image/jpeg" };
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", contentType: "image/png" };
  // "RIFF" .... "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", contentType: "image/webp" };
  return null;
}

// The storage path of a photo we host, from its public URL; null for a
// link to somewhere else (owners can still paste their own https link).
export function storedPhotoPath(url: string | null, publicBase: string): string | null {
  if (!url) return null;
  const prefix = `${publicBase.replace(/\/$/, "")}/storage/v1/object/public/${PHOTO_BUCKET}/`;
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}
