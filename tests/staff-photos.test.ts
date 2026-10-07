// The staff-photos bucket's own rules, against the real dev Supabase
// Storage — needs .env.local populated. Run with: pnpm test

import { describe, it, expect, afterAll } from "vitest";
import { createAdminClient } from "../lib/db/supabase-admin";
import { PHOTO_BUCKET } from "../lib/staff/photo";

// A 1x1 transparent PNG.
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (c) => c.charCodeAt(0),
);

describe("staff photo storage", () => {
  const storage = createAdminClient().storage.from(PHOTO_BUCKET);
  const folder = `test-${Date.now()}`;

  afterAll(async () => {
    await storage.remove([`${folder}/photo.png`]);
  });

  it("serves uploaded photos publicly", async () => {
    const { error } = await storage.upload(`${folder}/photo.png`, PNG, { contentType: "image/png" });
    expect(error).toBeNull();
    const res = await fetch(storage.getPublicUrl(`${folder}/photo.png`).data.publicUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("refuses anything but images, and anything over 2 MB", async () => {
    const html = await storage.upload(`${folder}/page.html`, new TextEncoder().encode("<script>alert(1)</script>"), {
      contentType: "text/html",
    });
    expect(html.error).not.toBeNull();
    const big = await storage.upload(`${folder}/big.png`, new Uint8Array(2 * 1024 * 1024 + 1), { contentType: "image/png" });
    expect(big.error).not.toBeNull();
  });
});
