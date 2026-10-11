import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  DatabaseIcon,
  DumbbellIcon,
  HandIcon,
  LeafIcon,
  ScissorsIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Film } from "@/components/marketing/film";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { FeatureVisual, LostInChats, MissedAfterHours, NoShow } from "@/components/marketing/moments";
import { CtaBand, FaqList, stagger } from "@/components/marketing/page-parts";
import { RevealObserver } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";
import { BUSINESS_GROUPS, type BusinessGroupSlug } from "@/lib/marketing/business-types";
import { DEFAULT_DEMO_CHAT } from "@/lib/marketing/demo-chat";
import { FAQ } from "@/lib/marketing/faq";
import { FEATURE_PAGES } from "@/lib/marketing/features";
import { FEATURE_PITCH, SIGNUP_OPEN } from "@/lib/marketing/site";
import { FEATURES, PLAN_LABEL, planIncludes } from "@/lib/plans";
import { priceLabel } from "@/lib/pricing";

const HEADLINE = "Turn every enquiry into a booking.";

export const metadata: Metadata = {
  title: { absolute: `${BRAND_NAME}: ${HEADLINE.replace(/\.$/, "")}` },
  description: BRAND_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <RevealObserver />
      <Hero />
      <Problem />
      <FeatureTour />
      <FilmSection />
      <BusinessTypes />
      <HowItWorks />
      <PricingTeaser />
      <Trust />
      <Faq />
      <CtaBand />
    </>
  );
}

const onDark = "text-white hover:bg-white/10 hover:text-white";

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0c1412] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_80%_-10%,rgb(95_199_169/0.2),transparent_60%),radial-gradient(700px_420px_at_0%_110%,rgb(14_92_75/0.40),transparent_60%)]"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pt-16 pb-20 md:px-6 md:pt-24 md:pb-28 lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col items-start gap-6">
          {/* Not faded in: the headline is the LCP element. */}
          <h1 className="max-w-xl text-[42px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance md:text-6xl lg:text-[68px]">
            {HEADLINE}
          </h1>
          <p className="max-w-lg text-lg text-pretty text-white/70">
            An AI receptionist that answers your customers on your website and WhatsApp, day and night, then books
            them in or takes their details for you.
          </p>
          <div className="fade-up flex flex-wrap gap-3">
            <Link href="/demo" className={buttonVariants({ size: "lg" })}>
              Get a demo
            </Link>
            {SIGNUP_OPEN ? (
              <Link href="/signup" className={cn(buttonVariants({ size: "lg", variant: "ghost" }), onDark)}>
                Start free trial
              </Link>
            ) : (
              <a href="#film" className={cn(buttonVariants({ size: "lg", variant: "ghost" }), onDark)}>
                Watch the 45s film
              </a>
            )}
          </div>
          <p className="text-sm text-white/50">Made for small service businesses in South Africa.</p>
        </div>
        <HeroDemo chat={DEFAULT_DEMO_CHAT} />
      </div>
    </section>
  );
}

function Problem() {
  const moments = [
    {
      visual: <MissedAfterHours />,
      title: "Messages that arrive after hours",
      text: "Customers ask at night and on Sundays. By the time you reply in the morning, many have booked somewhere that answered.",
    },
    {
      visual: <NoShow />,
      title: "Bookings that don't show up",
      text: "A forgotten appointment is an hour you can't sell again. Without a reminder, people simply forget.",
    },
    {
      visual: <LostInChats />,
      title: "Leads buried in WhatsApp",
      text: "A quote request slides down your chat list under family groups and suppliers, and never gets an answer.",
    },
  ];
  return (
    <Section id="problem" eyebrow="The problem" title="You can't answer every message. Your customers won't wait.">
      <div className="grid gap-8 md:grid-cols-3 md:gap-6">
        {moments.map((m, i) => (
          <div key={m.title} data-reveal style={stagger(i)} className="flex flex-col gap-4">
            {m.visual}
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.01em]">{m.title}</h3>
              <p className="mt-1 text-muted-foreground">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FeatureTour() {
  return (
    <Section id="features" eyebrow="What it does" title="A receptionist that never clocks off" className="bg-surface-2">
      <div className="flex flex-col gap-16 md:gap-24">
        {FEATURE_PAGES.map((p, i) => (
          <div key={p.slug} data-reveal className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
            <div className={cn(i % 2 === 1 && "md:order-2")}>
              <FeatureVisual visual={p.visual} />
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">{p.title}</h3>
              <p className="mt-3 text-muted-foreground">{p.blurb}</p>
              <ul className="mt-5 flex flex-col gap-2">
                {p.sections.map((sec) => (
                  <li key={sec.id} className="flex gap-2.5 text-[15px]">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    {sec.label}
                  </li>
                ))}
              </ul>
              <Link href={`/features/${p.slug}`} className="mt-6 inline-flex items-center gap-1 font-semibold text-link hover:underline">
                More about {p.title.toLowerCase()}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FilmSection() {
  return (
    <Section
      id="film"
      dark
      eyebrow="See it in 45 seconds"
      title="From a missed message to a booked appointment"
      intro={`Watch ${BRAND_NAME} answer a customer, book them in and send the reminder.`}
    >
      <div data-reveal className="mx-auto max-w-5xl">
        <Film title={`${BRAND_NAME} in 45 seconds`} />
      </div>
    </Section>
  );
}

const GROUP_ICON: Record<BusinessGroupSlug, React.ComponentType<{ className?: string }>> = {
  beauty: ScissorsIcon,
  wellness: LeafIcon,
  fitness: DumbbellIcon,
  trades: WrenchIcon,
  clinics: StethoscopeIcon,
};

function BusinessTypes() {
  return (
    <Section
      id="business-types"
      eyebrow="Who it's for"
      title="Made for businesses that run on appointments and callouts"
      intro="Salons, studios, practices and tradespeople: anyone whose phone buzzes while their hands are busy."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BUSINESS_GROUPS.map((g, i) => {
          const Icon = GROUP_ICON[g.slug];
          return (
            <Link
              key={g.slug}
              href={`/for/${g.slug}`}
              data-reveal
              style={stagger(i)}
              className="group rounded-[20px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card lift className="h-full px-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold tracking-[-0.01em]">{g.name}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {g.types
                      .slice(0, 4)
                      .map((t) => t.name)
                      .join(", ")}
                    {g.types.length > 4 ? " and more" : ""}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-link">
                  See how it works
                  <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Tell it about your business",
      text: "Your services, prices, hours and policies, in plain language. We set this up with you.",
    },
    { title: "Add one line to your website", text: "Paste the snippet into your site and the chat appears, in your colours." },
    {
      title: "Connect WhatsApp",
      text: "Link your WhatsApp Business number, and the same receptionist answers there too.",
    },
  ];
  return (
    <Section id="how-it-works" eyebrow="How it works" title="Up and running in an afternoon" className="bg-surface-2">
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} data-reveal style={stagger(i)}>
            <Card className="h-full px-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-raised">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold tracking-[-0.01em]">{s.title}</h3>
              <p className="text-[15px] text-muted-foreground">{s.text}</p>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function PricingTeaser() {
  const plans = ["starter", "growth", "pro"] as const;
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Pick the plan that fits how you work"
      intro="Every plan includes leads, your knowledge base, conversations and customer records."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan, i) => (
          <Card
            key={plan}
            data-reveal
            style={stagger(i)}
            className={cn("px-6", plan === "growth" && "shadow-[0_0_0_2px_var(--primary),var(--shadow-card)]")}
          >
            <div>
              <h3 className="text-lg font-semibold">{PLAN_LABEL[plan]}</h3>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{priceLabel(plan)}</p>
            </div>
            <ul className="flex flex-col gap-2">
              {FEATURES.filter((f) => planIncludes(plan, f)).map((f) => (
                <li key={f} className="flex gap-2 text-[15px]">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {FEATURE_PITCH[f]}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div data-reveal className="mt-10 text-center">
        <Link href="/pricing" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Compare plans
        </Link>
      </div>
    </Section>
  );
}

function Trust() {
  const points = [
    {
      icon: ShieldCheckIcon,
      title: "Consent, on record",
      text: "The AI asks before saving anyone's details. Each customer record keeps a history of what they agreed to and when, for POPIA.",
    },
    {
      icon: DatabaseIcon,
      title: "Your data stays yours",
      text: "Your customers and leads belong to your business. Export your leads at any time, and delete a customer's data when they ask.",
    },
    {
      icon: HandIcon,
      title: "A person is one tap away",
      text: "Take over any conversation yourself. When a customer asks for a person, you're alerted straight away.",
    },
  ];
  return (
    <Section id="trust" eyebrow="Trust" title="Careful with your customers" className="bg-surface-2">
      <div className="grid gap-8 md:grid-cols-3 md:gap-6">
        {points.map((p, i) => (
          <div key={p.title} data-reveal style={stagger(i)} className="flex flex-col gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <p.icon className="size-5" aria-hidden />
            </span>
            <h3 className="text-lg font-semibold tracking-[-0.01em]">{p.title}</h3>
            <p className="text-muted-foreground">{p.text}</p>
          </div>
        ))}
      </div>
      <p data-reveal className="mt-10 text-center text-sm text-muted-foreground">
        Read our{" "}
        <Link href="/privacy" className="font-medium text-link hover:underline">
          privacy policy
        </Link>
        .
      </p>
    </Section>
  );
}

function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions, answered">
      <FaqList items={FAQ} />
    </Section>
  );
}
