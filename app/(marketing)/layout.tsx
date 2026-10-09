import type { Metadata } from "next";
import Script from "next/script";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { StructuredData } from "@/components/marketing/structured-data";
import { BRAND_NAME } from "@/lib/brand";
import { MARKETING_WIDGET_KEY } from "@/lib/marketing/site";

export const metadata: Metadata = {
  title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
  openGraph: { type: "website", siteName: BRAND_NAME, locale: "en_ZA" },
  twitter: { card: "summary_large_image" },
};

// Public marketing site. Reads no cookies or session, so every page under it
// can be rendered statically; signed-in staff are sent to their dashboard by
// proxy.ts before they reach "/".
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <StructuredData />
      {/* Our own AI receptionist, installed exactly as a customer would.
          lazyOnload: it waits until the page is idle, so it never slows the
          first view. */}
      {MARKETING_WIDGET_KEY && <Script src="/widget.js" data-key={MARKETING_WIDGET_KEY} strategy="lazyOnload" />}
    </div>
  );
}
