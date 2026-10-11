"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/marketing/business-types";
import { requestDemo, type DemoFormState } from "./actions";

const fieldClass = "h-11 rounded-xl bg-white px-3.5 md:text-[15px]";

export function DemoForm() {
  const [state, formAction, pending] = useActionState<DemoFormState, FormData>(requestDemo, { status: "idle" });
  // When the form appeared, for the "too fast to be a person" check.
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="feedback-enter flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised">
          <CheckIcon className="size-7" strokeWidth={2.6} />
        </span>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Thanks, we&apos;ll be in touch</h2>
        <p className="max-w-sm text-muted-foreground">
          We&apos;ll be in touch soon to find a time that suits you.
        </p>
      </div>
    );
  }

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (name: string) =>
    errors[name] ? (
      <p id={`${name}-error`} className="text-[13px] text-destructive">
        {errors[name]}
      </p>
    ) : null;
  const a11y = (name: string) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form
      action={(fd) => {
        fd.set("elapsedMs", String(shownAt.current ? Date.now() - shownAt.current : 0));
        return formAction(fd);
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required className={fieldClass} {...a11y("name")} />
          {err("name")}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="business">Business name</Label>
          <Input id="business" name="business" autoComplete="organization" required className={fieldClass} {...a11y("business")} />
          {err("business")}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="businessType">Type of business</Label>
        <select
          id="businessType"
          name="businessType"
          required
          defaultValue=""
          className={cn(
            fieldClass,
            "w-full border border-input text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
          )}
          {...a11y("businessType")}
        >
          <option value="" disabled>
            Choose one
          </option>
          {BUSINESS_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {err("businessType")}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone or WhatsApp</Label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" required className={fieldClass} {...a11y("phone")} />
          {err("phone")}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className={fieldClass} {...a11y("email")} />
          {err("email")}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">
          Anything we should know? <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="message"
          name="message"
          rows={4}
          maxLength={1000}
          placeholder="E.g. how customers reach you today, or what you'd like it to handle"
          className="rounded-xl bg-white px-3.5 py-2.5 md:text-[15px]"
        />
      </div>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-[14px] leading-snug">
          <input type="checkbox" name="consent" required className="mt-0.5 size-4.5 shrink-0" {...a11y("consent")} />
          <span>
            I agree that you may store these details and contact me about a demo, as described in the{" "}
            <Link href="/privacy" className="text-link underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {err("consent")}
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Request a demo"}
      </Button>
    </form>
  );
}
