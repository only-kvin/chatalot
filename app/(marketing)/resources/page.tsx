import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, ClockIcon, ShieldCheckIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Film } from "@/components/marketing/film";
import { CtaBand, FaqList, PageHero, Points, stagger } from "@/components/marketing/page-parts";
import { RevealObserver } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { BRAND_NAME } from "@/lib/brand";
import { FAQ } from "@/lib/marketing/faq";
import { GUIDES } from "@/lib/marketing/guides";

export const metadata: Metadata = {
  title: "Resources",
  description: `Setup guides, answers to common questions, the ${BRAND_NAME} demo film, and how we handle privacy and POPIA.`,
  alternates: { canonical: "/resources" },
};

export default function ResourcesPage() {
  return (
    <>
      <RevealObserver />
      <PageHero
        eyebrow="Resources"
        title="Everything you need to get set up"
        intro="Step-by-step guides, straight answers, and a 45-second look at the product."
        actions={false}
      />

      <Section id="guides" eyebrow="Guides" title="Setup guides">
        <div className="grid gap-6 md:grid-cols-3">
          {GUIDES.map((g, i) => (
            <Link
              key={g.slug}
              href={`/resources/${g.slug}`}
              data-reveal
              style={stagger(i)}
              className="group rounded-[20px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card lift className="h-full px-6">
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <ClockIcon className="size-3.5" aria-hidden /> {g.readMinutes} min read
                </span>
                <h3 className="text-lg font-semibold tracking-[-0.01em]">{g.title}</h3>
                <p className="text-[15px] text-muted-foreground">{g.summary}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-[14px] font-semibold text-link">
                  Read the guide
                  <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section id="demo" dark eyebrow="Watch the demo" title={`${BRAND_NAME} in 45 seconds`}>
        <div data-reveal className="mx-auto max-w-5xl">
          <Film title={`${BRAND_NAME} in 45 seconds`} />
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Frequently asked questions">
        <FaqList items={FAQ} />
      </Section>

      <Section id="privacy" eyebrow="Privacy and POPIA" title="Careful with your customers' information" className="bg-surface-2">
        <Card data-reveal className="mx-auto max-w-3xl px-6 md:px-10 md:py-8">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ShieldCheckIcon className="size-5" aria-hidden />
          </span>
          <p className="text-muted-foreground">
            Under South Africa&apos;s Protection of Personal Information Act (POPIA), your business is the responsible
            party for your customers&apos; information, and {BRAND_NAME} processes it on your behalf as your operator.
          </p>
          <Points
            items={[
              "The AI asks before saving anyone's contact details.",
              "Each customer record keeps a dated history of what they agreed to.",
              "Customers can manage their choices from a private link, and ask for their data to be deleted.",
              "We don't sell personal information or use it for advertising.",
            ]}
          />
          <p className="text-[15px]">
            Read the full{" "}
            <Link href="/privacy" className="font-medium text-link underline">
              privacy policy
            </Link>{" "}
            and how to{" "}
            <Link href="/data-deletion" className="font-medium text-link underline">
              delete your data
            </Link>
            .
          </p>
        </Card>
      </Section>
      <CtaBand />
    </>
  );
}
