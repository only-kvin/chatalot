import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BRAND_NAME } from "@/lib/brand";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Start a free trial",
  description: `Set up ${BRAND_NAME}'s AI receptionist for your business. Every feature is included while you try it.`,
  alternates: { canonical: "/signup" },
};

const STEPS = [
  "Confirm your email and set up straight away: your knowledge, hours, widget and colours",
  "We review each new business, then switch your receptionist on for your customers",
  "Every feature is included during your trial",
];

export default function SignupPage() {
  return (
    <section className="relative overflow-hidden bg-surface-2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(800px_380px_at_20%_-20%,rgb(14_92_75/0.1),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] font-semibold tracking-wide text-link uppercase">Free trial</p>
          <h1 className="text-4xl leading-tight font-semibold tracking-[-0.03em] text-balance md:text-5xl">
            Start your free trial
          </h1>
          <p className="text-lg text-muted-foreground">
            Give your business an AI receptionist on your website and WhatsApp. No card needed.
          </p>
          <ul className="flex flex-col gap-3">
            {STEPS.map((s) => (
              <li key={s} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-tone-ok text-tone-ok-foreground">
                  <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Prefer a walkthrough first?{" "}
            <Link href="/demo" className="font-medium text-link hover:underline">
              Get a demo
            </Link>
          </p>
        </div>
        <Card className="fade-up px-6 md:px-8 md:py-8">
          {/* Suspense: the form reads ?error= from the URL. */}
          <Suspense>
            <SignupForm />
          </Suspense>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-link hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </section>
  );
}
