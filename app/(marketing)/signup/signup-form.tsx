"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { MailCheckIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/marketing/business-types";
import { CONSENT_TEXT } from "@/lib/consent/business-consent";
import { startSignup, type SignupFormState } from "./actions";

const fieldClass = "h-11 rounded-xl bg-white px-3.5 md:text-[15px]";

// Shown when the confirmation link comes back without a usable sign-up.
const RETURN_ERRORS: Record<string, string> = {
  "no-signup": "We couldn't find a sign-up for that email. Please fill in the form again.",
  error: "Something went wrong creating your business. Please try again.",
};

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupFormState, FormData>(startSignup, { status: "idle" });
  const returnError = RETURN_ERRORS[useSearchParams().get("error") ?? ""];
  // When the form appeared, for the "too fast to be a person" check.
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="feedback-enter flex size-14 items-center justify-center rounded-full bg-linear-to-b from-[#5b53f0] to-[#4338ca] text-white shadow-[0_10px_24px_-8px_rgb(67_56_202/0.6)]">
          <MailCheckIcon className="size-7" strokeWidth={2.2} />
        </span>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Check your email</h2>
        <p className="max-w-sm text-muted-foreground">
          We sent a link to <strong className="text-foreground">{state.email}</strong>. Click it to confirm your email
          and open your dashboard.
        </p>
        <p className="text-[13px] text-muted-foreground">Nothing there? Check your spam folder.</p>
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
      {returnError && state.status === "idle" && (
        <p role="alert" className="rounded-xl bg-tone-bad px-3.5 py-2.5 text-sm text-tone-bad-foreground">
          {returnError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className={fieldClass} {...a11y("email")} />
        {err("email")}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          name="businessName"
          autoComplete="organization"
          required
          className={fieldClass}
          {...a11y("businessName")}
        />
        {err("businessName")}
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

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-2 p-3.5">
        <legend className="px-1 text-[13px] font-semibold">Your website (optional)</legend>
        <label className="flex items-start gap-3 text-[14px] leading-snug">
          <input type="checkbox" name="consentWebsiteContent" className="mt-0.5 size-4.5 shrink-0" />
          <span>{CONSENT_TEXT.website_content.label}</span>
        </label>
        <label className="flex items-start gap-3 text-[14px] leading-snug">
          <input type="checkbox" name="consentWebsiteImages" className="mt-0.5 size-4.5 shrink-0" />
          <span>{CONSENT_TEXT.website_images.label}</span>
        </label>
        <p className="text-[12px] text-muted-foreground">You can change these any time in Settings → Your website.</p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-[14px] leading-snug">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4.5 shrink-0" {...a11y("terms")} />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="text-link underline">
              terms of service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-link underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {err("terms")}
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}{" "}
          {state.signIn && (
            <Link href="/login" className="font-semibold underline">
              Sign in
            </Link>
          )}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Start free trial"}
      </Button>
    </form>
  );
}
