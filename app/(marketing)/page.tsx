import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Placeholder } from "@/components/marketing/placeholder";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  // The home page uses the plain name plus tagline, not the "· Brand" template.
  title: { absolute: `${BRAND_NAME}: ${BRAND_TAGLINE.replace(/\.$/, "")}` },
  description: BRAND_DESCRIPTION,
  alternates: { canonical: "/" },
};

// Phase 1 shell: a minimal hero so "/" works for visitors. The full home page
// (hero animation, feature tour, film, chatbot) replaces this in phase 2.
// The headline is never faded in: it is the LCP element, and animating its
// opacity from 0 delays LCP.
export default function HomePage() {
  return (
    <section className="relative overflow-hidden bg-[#0b0b14] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_80%_-10%,rgb(99_102_241/0.45),transparent_60%),radial-gradient(700px_420px_at_0%_110%,rgb(52_199_89/0.16),transparent_60%)]"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-24 md:px-6 md:py-32">
        <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance md:text-6xl">
          {BRAND_TAGLINE}
          <Placeholder label="HERO HEADLINE: PICK 1 OF 3" />
        </h1>
        <p className="max-w-xl text-lg text-white/70">{BRAND_DESCRIPTION}</p>
        <div className="fade-up flex flex-wrap gap-3">
          <Link href="/demo" className={buttonVariants({ size: "lg" })}>
            Get a demo
          </Link>
          <Link
            href="/features"
            className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "text-white hover:bg-white/10 hover:text-white")}
          >
            See the features
          </Link>
        </div>
      </div>
    </section>
  );
}
