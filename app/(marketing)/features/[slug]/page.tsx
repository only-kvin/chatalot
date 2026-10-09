import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { Card } from "@/components/ui/card";
import { FeatureVisual } from "@/components/marketing/moments";
import { CtaBand, PageHero, Points, stagger } from "@/components/marketing/page-parts";
import { RevealObserver } from "@/components/marketing/reveal";
import { FEATURE_PAGES, featurePage } from "@/lib/marketing/features";

// One page per feature group, built at deploy time. Unknown slugs 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/features/[slug]">): Promise<Metadata> {
  const page = featurePage((await params).slug);
  if (!page) return {};
  return { title: page.title, description: page.intro, alternates: { canonical: `/features/${page.slug}` } };
}

export default async function FeaturePageView({ params }: PageProps<"/features/[slug]">) {
  const page = featurePage((await params).slug);
  if (!page) notFound();
  const others = FEATURE_PAGES.filter((p) => p.slug !== page.slug);

  return (
    <>
      <RevealObserver />
      <PageHero
        crumbs={[{ label: "Features", href: "/features" }]}
        eyebrow={page.title}
        title={page.headline}
        intro={page.intro}
        aside={
          <div className="mx-auto w-full max-w-md">
            <FeatureVisual visual={page.visual} />
          </div>
        }
      />

      {/* In-page contents: the menu links straight to these anchors. */}
      <nav aria-label="On this page" className="sticky top-16 z-30 border-b border-border bg-white/90 backdrop-blur">
        <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 md:px-6">
          {page.sections.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-16 md:px-6 md:py-24">
        {page.sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} data-reveal className="scroll-mt-32">
            <Card className="px-6 md:px-10 md:py-8">
              <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:gap-12">
                <div>
                  <span className="text-[13px] font-semibold text-link tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <h2 id={`${s.id}-title`} className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-balance">
                    {s.title}
                  </h2>
                  <p className="mt-3 text-muted-foreground">{s.text}</p>
                </div>
                <Points items={s.points} className="md:pt-7" />
              </div>
            </Card>
          </section>
        ))}
      </div>

      <section aria-labelledby="more-title" className="bg-surface-2 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <h2 id="more-title" className="text-2xl font-semibold tracking-[-0.02em]">
            More features
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {others.map((p, i) => (
              <Link
                key={p.slug}
                href={`/features/${p.slug}`}
                data-reveal
                style={stagger(i)}
                className="group rounded-[20px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card lift className={cn("h-full px-5")}>
                  <h3 className="font-semibold tracking-[-0.01em]">{p.title}</h3>
                  <p className="text-[14px] text-muted-foreground">{p.blurb}</p>
                  <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-link">
                    Explore
                    <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
