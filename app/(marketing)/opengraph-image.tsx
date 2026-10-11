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
            "radial-gradient(900px 500px at 85% -10%, rgba(95,199,169,0.28), transparent 60%), radial-gradient(700px 420px at 0% 110%, rgba(14,92,75,0.45), transparent 60%), #0c1412",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: "flex",
            }}
          >
            {/* The brand symbol (components/brand/symbol.tsx), mint for dark. */}
            <svg width="64" height="64" viewBox="0 0 32 32">
              <rect width="32" height="32" rx="8" fill="#5fc7a9" />
              <path d="M10 24V15a6 6 0 0 1 12 0v9z" fill="#0c1412" />
              <circle cx="21.5" cy="10.5" r="4.6" fill="#5fc7a9" />
              <rect x="6" y="24" width="20" height="3" rx="1.5" fill="#0c1412" />
            </svg>
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5, color: "#ecf1ef" }}>{BRAND_NAME.toLowerCase()}</div>
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 960 }}>
          {BRAND_TAGLINE}
        </div>
        <div style={{ fontSize: 28, color: "#9daaa5" }}>
          {`Website chat · WhatsApp · Bookings · ${BRAND_DOMAIN}`}
        </div>
      </div>
    ),
    size,
  );
}
