import { ImageResponse } from "next/og";
import { BRAND_DOMAIN, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

// The link preview when the site is shared (WhatsApp, LinkedIn, X…).
// Generated once at build time from the brand constants.
export const alt = `${BRAND_NAME}: ${BRAND_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "white",
          background:
            "radial-gradient(900px 500px at 85% -10%, rgba(99,102,241,0.55), transparent 60%), radial-gradient(700px 420px at 0% 110%, rgba(52,199,89,0.2), transparent 60%), #0b0b14",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(145deg, #6d67f5, #3f35c4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Lucide's message-circle, as in the site logo. */}
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>{BRAND_NAME}</div>
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 960 }}>
          {BRAND_TAGLINE}
        </div>
        <div style={{ fontSize: 28, color: "rgba(255,255,255,0.65)" }}>
          {`Website chat · WhatsApp · Bookings · ${BRAND_DOMAIN}`}
        </div>
      </div>
    ),
    size,
  );
}
