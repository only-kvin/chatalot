import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { CtaBand, PageHero, stagger } from "@/components/marketing/page-parts";
import { RevealObserver } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { BRAND_NAME } from "@/lib/brand";
import { BUSINESS_PAGES, findBusinessGroup, typeNames, type BusinessGroupPage } from "@/lib/marketing/business-pages";

// One page per business group (/for/beauty, /for/trades…), generated from
// lib/marketing/business-pages.ts at deploy time. Each kind of business in
// the group gets its own example on the page (anchor #<type-slug>); the old
// /for/<type> pages redirect there (next.config.ts).
export const dynamicParams = false;

export function generateStaticParams() {
  return BUSINESS_PAGES.map((g) => ({ group: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/for/[group]">): Promise<Metadata> {
  const group = findBusinessGroup((await params).group);
  if (!group) return {};
  return {
    title: `${BRAND_NAME} for ${group.name.toLowerCase()}`,
    description: `${group.intro} For ${typeNames(group)}.`,
    alternates: { canonical: `/for/${group.slug}` },
  };
}

export default async function BusinessGroupRoute({ params }: PageProps<"/for/[group]">) {
  const group = findBusinessGroup((await params).group);
  if (!group) notFound();

  return (
    <>
      <RevealObserver />
      <PageHero
        eyebrow={`For ${group.name.toLowerCase()}`}
        title={group.headline}
        intro={group.intro}
        aside={<HeroDemo chat={group.types[0].chat} />}
      />

      <Examples group={group} />

      <Section id="problems" eyebrow="Sound familiar?" title="The messages you can't get to" className="bg-surface-2">
        <div className="grid gap-6 md:grid-cols-3">
          {group.problems.map((p, i) => (
            <Card key={p.title} data-reveal style={stagger(i)} className="px-6">
              <span className="flex size-8 items-center justify-center rounded-full bg-tone-bad text-sm font-semibold text-tone-bad-foreground">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold tracking-[-0.01em]">{p.title}</h3>
              <p className="text-[15px] text-muted-foreground">{p.text}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="how-it-helps"
        eyebrow="How it helps"
        title={group.kind === "appointments" ? "From first question to booked appointment" : "From first message to a booked call-out"}
      >
        <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {group.highlights.map((h, i) => (
            <div key={h.title} data-reveal style={stagger(i)} className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-[-0.01em]">{h.title}</h3>
              <p className="text-muted-foreground">{h.text}</p>
              <Link href={h.href} className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-link hover:underline">
                Learn more<span className="sr-only">: {h.title}</span>
                <ArrowRightIcon className="size-3.5" aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}

// Each kind of business in the group, with the start of its sample chat:
// what its customers actually ask, and how the AI answers.
function Examples({ group }: { group: BusinessGroupPage }) {
  return (
    <Section
      id="examples"
      eyebrow="Who it's for"
      title={`How it sounds for ${group.name.toLowerCase()}`}
      intro={`Real questions your customers send, answered from your own information. For ${typeNames(group)}.`}
    >
      <div className="grid gap-5 md:grid-cols-2">
        {group.types.map((t, i) => {
          const ask = t.chat.messages.find((m) => m.from === "visitor")?.text;
          const answer = t.chat.messages.find((m) => m.from === "ai")?.text;
          return (
            <Card key={t.slug} id={t.slug} data-reveal style={stagger(i)} className="scroll-mt-24 px-6">
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.01em]">{t.name}</h3>
                <p className="text-[15px] text-muted-foreground">{t.headline}</p>
              </div>
              <div className="flex flex-col gap-2 text-[14px]" aria-label={`Example chat for ${t.name.toLowerCase()}`}>
                {ask && (
                  <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-accent-foreground">
                    <span className="sr-only">Customer: </span>
                    {ask}
                  </p>
                )}
                {answer && (
                  <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2">
                    <span className="sr-only">{BRAND_NAME} AI: </span>
                    {answer}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
