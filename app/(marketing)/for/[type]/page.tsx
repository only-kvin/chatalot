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
import { BUSINESS_PAGES, findBusinessPage, type BusinessGroupPage } from "@/lib/marketing/business-pages";

// /for/<group> ("All beauty") and /for/<type> (hair salon, plumbers…),
// generated from lib/marketing/business-pages.ts at deploy time.
export const dynamicParams = false;

export function generateStaticParams() {
  return BUSINESS_PAGES.flatMap((g) => [{ type: g.slug }, ...g.types.map((t) => ({ type: t.slug }))]);
}

export async function generateMetadata({ params }: PageProps<"/for/[type]">): Promise<Metadata> {
  const found = findBusinessPage((await params).type);
  if (!found) return {};
  const { group, type } = found;
  const name = type ? type.name : group.name;
  return {
    title: `${BRAND_NAME} for ${name.toLowerCase()}`,
    description: type ? `${type.headline}. ${group.intro}` : group.intro,
    alternates: { canonical: `/for/${type?.slug ?? group.slug}` },
  };
}

export default async function BusinessTypePage({ params }: PageProps<"/for/[type]">) {
  const found = findBusinessPage((await params).type);
  if (!found) notFound();
  const { group, type } = found;
  const chat = (type ?? group.types[0]).chat;

  return (
    <>
      <RevealObserver />
      <PageHero
        crumbs={type ? [{ label: group.name, href: `/for/${group.slug}` }] : undefined}
        eyebrow={type ? type.name : `For ${group.name.toLowerCase()}`}
        title={type ? type.headline : group.headline}
        intro={group.intro}
        aside={<HeroDemo chat={chat} />}
      />

      {!type && <TypeGrid group={group} />}

      <Section id="problems" eyebrow="Sound familiar?" title="The messages you can't get to">
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
        className="bg-surface-2"
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

      {type && <TypeGrid group={group} exclude={type.slug} title={`Also for ${group.name.toLowerCase()}`} />}

      <CtaBand />
    </>
  );
}

function TypeGrid({ group, exclude, title }: { group: BusinessGroupPage; exclude?: string; title?: string }) {
  const types = group.types.filter((t) => t.slug !== exclude);
  return (
    <section aria-labelledby="types-title" className="py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <h2 id="types-title" className="text-2xl font-semibold tracking-[-0.02em]">
          {title ?? `Made for every kind of ${group.name.toLowerCase()} business`}
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {types.map((t, i) => (
            <Link
              key={t.slug}
              href={`/for/${t.slug}`}
              data-reveal
              style={stagger(i)}
              className="group rounded-[20px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card lift size="sm" className="h-full px-4">
                <h3 className="font-semibold tracking-[-0.01em]">{t.name}</h3>
                <p className="text-[13px] text-muted-foreground">{t.headline}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-link">
                  See how it works
                  <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
