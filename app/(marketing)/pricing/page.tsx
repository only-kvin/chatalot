import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, MinusIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CtaBand, FaqList, PageHero, Points, stagger } from "@/components/marketing/page-parts";
import { RevealObserver } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { BRAND_NAME } from "@/lib/brand";
import { FEATURE_PITCH } from "@/lib/marketing/site";
import { FEATURES, PLAN_LABEL, planIncludes } from "@/lib/plans";
import { MONTHLY_PRICE_ZAR, priceLabel } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${BRAND_NAME} plans: Starter, Growth and Pro. Website chat, WhatsApp, bookings and reviews, in the plan that fits how you work.`,
  alternates: { canonical: "/pricing" },
};

const PLANS = ["starter", "growth", "pro"] as const;

const PLAN_FOR: Record<(typeof PLANS)[number], string> = {
  starter: "For businesses that want every website enquiry answered.",
  growth: "For businesses that run on appointments, on the web and WhatsApp.",
  pro: "Everything, including reviews and customer registration.",
};

const EVERY_PLAN = [
  "Leads with email alerts and CSV export",
  "Your knowledge base",
  "Conversations, with human takeover",
  "Customer records with consent history",
  "Daily summary email",
];

const PRICING_FAQ = [
  {
    q: "Why does it say \"Contact us\"?",
    a: "Prices are shared on a short call, once we know a little about your business. Book a demo and we'll give you a clear monthly price.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. If you need a feature from a bigger plan, request an upgrade from your dashboard and we'll switch you over.",
  },
  {
    q: "Are WhatsApp messages included?",
    a: "Meta charges its own fees for some WhatsApp messages, such as templates sent outside the 24-hour reply window. We'll explain how that works for your business on the call.",
  },
  {
    q: "Do I need a website?",
    a: "No. Without a website you can still use WhatsApp and share your hosted booking page. With one, you add the chat and widgets with one line of code.",
  },
];

export default function PricingPage() {
  const anyPrice = PLANS.some((p) => MONTHLY_PRICE_ZAR[p] !== null);
  return (
    <>
      <RevealObserver />
      <PageHero
        eyebrow="Pricing"
        title="Pick the plan that fits how you work"
        intro="Every plan includes your AI receptionist's knowledge base, leads, conversations and customer records. Add WhatsApp, bookings and reviews as you need them."
        actions={false}
      />

      <section className="bg-surface-2 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3 md:px-6">
          {PLANS.map((plan, i) => (
            <Card
              key={plan}
              data-reveal
              style={stagger(i)}
              className={cn("px-6", plan === "growth" && "shadow-[0_0_0_2px_var(--primary),var(--shadow-card)]")}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{PLAN_LABEL[plan]}</h2>
                {plan === "growth" && (
                  <span className="rounded-full bg-tone-new px-2.5 py-0.5 text-[12px] font-semibold text-tone-new-foreground">
                    Best for bookings
                  </span>
                )}
              </div>
              <p className="text-[15px] text-muted-foreground">{PLAN_FOR[plan]}</p>
              <p className="text-3xl font-semibold tracking-[-0.02em]">{priceLabel(plan)}</p>
              <Link href="/demo" className={buttonVariants({ size: "lg", variant: plan === "growth" ? "default" : "outline" })}>
                {anyPrice ? "Get started" : "Get a quote"}
              </Link>
              <Points items={FEATURES.filter((f) => planIncludes(plan, f)).map((f) => FEATURE_PITCH[f])} />
            </Card>
          ))}
        </div>
        <div data-reveal className="mx-auto mt-10 max-w-6xl px-4 md:px-6">
          <Card className="px-6 md:px-8">
            <h2 className="font-semibold">Included in every plan</h2>
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {EVERY_PLAN.map((item) => (
                <li key={item} className="flex items-center gap-2 text-[15px]">
                  <CheckIcon className="size-4 shrink-0 text-tone-ok-foreground" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <Section id="compare" eyebrow="Compare" title="What's in each plan">
        <div data-reveal className="mx-auto max-w-4xl overflow-x-auto rounded-[20px] border border-border bg-white shadow-card">
          <table className="w-full min-w-[520px] text-left text-[15px]">
            <caption className="sr-only">Features included in each plan</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-4 font-semibold">
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th key={p} scope="col" className="px-5 py-4 text-center font-semibold">
                    {PLAN_LABEL[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {FEATURES.map((f) => (
                <tr key={f}>
                  <th scope="row" className="px-5 py-3.5 font-normal">
                    {FEATURE_PITCH[f]}
                  </th>
                  {PLANS.map((p) => (
                    <td key={p} className="px-5 py-3.5 text-center">
                      {planIncludes(p, f) ? (
                        <CheckIcon className="mx-auto size-5 text-tone-ok-foreground" aria-label="Included" />
                      ) : (
                        <MinusIcon className="mx-auto size-5 text-muted-foreground/50" aria-label="Not included" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="pricing-faq" eyebrow="Questions" title="Pricing questions" className="bg-surface-2">
        {/* The "Contact us" question only applies until prices are set. */}
        <FaqList items={anyPrice ? PRICING_FAQ.slice(1) : PRICING_FAQ} />
      </Section>
      <CtaBand title="Get a price for your business" />
    </>
  );
}
