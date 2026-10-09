import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeatureVisual } from "@/components/marketing/moments";
import { CtaBand, PageHero, Points, stagger } from "@/components/marketing/page-parts";
import { RevealObserver } from "@/components/marketing/reveal";
import { BRAND_NAME } from "@/lib/brand";
import { FEATURE_PAGES } from "@/lib/marketing/features";

export const metadata: Metadata = {
  title: "Features",
  description: `Everything ${BRAND_NAME} does: an AI receptionist on your website and WhatsApp, online booking and reminders, leads, reviews and website widgets.`,
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <RevealObserver />
      <PageHero
        eyebrow="Features"
        title="Everything your front desk does, without the front desk"
        intro={`${BRAND_NAME} answers your customers, fills your calendar and follows up, on your website and WhatsApp.`}
      />
      <section className="bg-surface-2 py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 md:grid-cols-2 md:px-6">
          {FEATURE_PAGES.map((p, i) => (
            <Link
              key={p.slug}
              href={`/features/${p.slug}`}
              data-reveal
              style={stagger(i)}
              className="group rounded-[20px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card lift className="h-full px-6">
                <FeatureVisual visual={p.visual} />
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.02em]">{p.title}</h2>
                  <p className="mt-2 text-[15px] text-muted-foreground">{p.blurb}</p>
                </div>
                <Points items={p.sections.map((s) => s.label)} />
                <span className="mt-auto inline-flex items-center gap-1 font-semibold text-link">
                  Explore
                  <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
