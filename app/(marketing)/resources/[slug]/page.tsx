import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, ClockIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CtaBand, PageHero, Points } from "@/components/marketing/page-parts";
import { GUIDES, findGuide } from "@/lib/marketing/guides";

// Setup guides, built at deploy time from lib/marketing/guides.ts.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/resources/[slug]">): Promise<Metadata> {
  const guide = findGuide((await params).slug);
  if (!guide) return {};
  return { title: guide.title, description: guide.summary, alternates: { canonical: `/resources/${guide.slug}` } };
}

export default async function GuidePage({ params }: PageProps<"/resources/[slug]">) {
  const guide = findGuide((await params).slug);
  if (!guide) notFound();
  const others = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <>
      <PageHero
        crumbs={[{ label: "Resources", href: "/resources" }]}
        eyebrow="Guide"
        title={guide.title}
        intro={
          <>
            <p>{guide.intro}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-white/50">
              <ClockIcon className="size-3.5" aria-hidden /> {guide.readMinutes} min read
            </p>
          </>
        }
        actions={false}
      />

      <article className="mx-auto max-w-3xl px-4 py-14 md:px-6 md:py-20">
        <ol className="flex flex-col gap-10">
          {guide.steps.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[auto_1fr] gap-x-5">
              <span className="flex size-9 items-center justify-center rounded-full bg-linear-to-b from-[#5b53f0] to-[#4338ca] text-sm font-semibold text-white shadow-[0_6px_14px_-6px_rgb(67_56_202/0.6)]">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-3 pt-1">
                <h2 className="text-xl font-semibold tracking-[-0.015em]">{step.title}</h2>
                <p className="leading-relaxed text-muted-foreground">{step.text}</p>
                {step.code && (
                  <pre className="overflow-x-auto rounded-xl bg-[#0f0f1a] p-4 font-mono text-[13px] leading-relaxed text-indigo-100">
                    <code>{step.code}</code>
                  </pre>
                )}
                {step.points && <Points items={step.points} />}
              </div>
            </li>
          ))}
        </ol>

        {guide.tips && (
          <Card className="mt-14 bg-accent/40 px-6">
            <h2 className="font-semibold">{guide.tips.title}</h2>
            <Points items={guide.tips.points} />
          </Card>
        )}

        <nav aria-label="More guides" className="mt-14 border-t border-border pt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">More guides</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {others.map((g) => (
              <li key={g.slug}>
                <Link href={`/resources/${g.slug}`} className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                  {g.title}
                  <ArrowRightIcon className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
      <CtaBand title="Want us to set it up with you?" />
    </>
  );
}
