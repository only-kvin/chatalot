import type { Metadata } from "next";
import { CalendarCheckIcon, MessageCircleIcon, SparklesIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BRAND_NAME } from "@/lib/brand";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "Get a demo",
  description: `See ${BRAND_NAME} answer, book and follow up for your business in a 30-minute call.`,
  alternates: { canonical: "/demo" },
};

const WHAT_YOU_GET = [
  { icon: MessageCircleIcon, text: "See the AI answer questions about your own services" },
  { icon: CalendarCheckIcon, text: "Walk through bookings, reminders and leads in the dashboard" },
  { icon: SparklesIcon, text: "Get honest advice on whether it fits your business" },
];

export default function DemoPage() {
  return (
    <section className="relative overflow-hidden bg-surface-2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(800px_380px_at_20%_-20%,rgb(99_102_241/0.16),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] font-semibold tracking-wide text-link uppercase">Get a demo</p>
          <h1 className="text-4xl leading-tight font-semibold tracking-[-0.03em] text-balance md:text-5xl">
            See it working for your business
          </h1>
          <p className="text-lg text-muted-foreground">
            A 30-minute call. Tell us a little about your business, and we&apos;ll show you {BRAND_NAME}{" "}
            answering your kind of customers.
          </p>
          <ul className="flex flex-col gap-4">
            {WHAT_YOU_GET.map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <item.icon className="size-4.5" aria-hidden />
                </span>
                <span className="pt-1.5">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <Card className="fade-up px-6 md:px-8 md:py-8">
          <DemoForm />
        </Card>
      </div>
    </section>
  );
}
