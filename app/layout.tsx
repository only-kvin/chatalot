import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { THEME_BOOT } from "@/components/theme/theme";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_URL } from "@/lib/brand";

// Brand type (docs/brand/README.md): Instrument Sans for UI and body,
// Bricolage Grotesque for headings. Both SIL Open Font License.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Only a few dashboard spots use it; not preloading keeps it off the
  // public pages' critical path (it loads when first used).
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND_URL),
  // No title template here: customer-facing pages like /book/<slug> belong to
  // the business, not us. The marketing layout adds "· Brand" to its pages.
  title: BRAND_NAME,
  description: BRAND_DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // On dashboard and admin pages THEME_BOOT swaps this for the user's
      // saved theme before paint, hence the hydration opt-out.
      data-theme="light"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${bricolage.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* A constant string, so it's safe and this layout stays static. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
