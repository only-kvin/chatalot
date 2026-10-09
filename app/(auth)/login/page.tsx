"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/db/supabase-browser";
import { safeNextPath } from "@/lib/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/marketing/logo";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // window.location.origin, not NEXT_PUBLIC_APP_URL — that's only ever
        // correct for one environment (it's set to localhost for dev), and
        // Preview deployments each get a unique hostname anyway.
        // Carries ?next= through the magic link, so someone who arrived from
        // an email notification lands back on that page after signing in.
        emailRedirectTo: `${window.location.origin}/callback?next=${encodeURIComponent(
          safeNextPath(new URLSearchParams(window.location.search).get("next")),
        )}`,
      },
    });

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel: the site's dark hero look. Desktop only. */}
      <aside className="relative hidden overflow-hidden bg-[#0b0b14] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_90%_-10%,rgb(99_102_241/0.45),transparent_60%),radial-gradient(600px_380px_at_-10%_110%,rgb(52_199_89/0.16),transparent_60%)]"
        />
        <Logo inverted className="relative" />
        <div className="relative flex flex-col gap-4">
          <p className="text-3xl leading-tight font-semibold tracking-[-0.02em] text-balance">
            Every chat, lead and booking, waiting for you.
          </p>
          <ul className="flex flex-col gap-2 text-sm text-white/70">
            <li>Pick up conversations the AI handed over</li>
            <li>Follow up new leads while they&apos;re warm</li>
            <li>See today&apos;s bookings at a glance</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/50">{BRAND_TAGLINE}</p>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Back to site
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="fade-up w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Staff sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              We&apos;ll email you a magic link — no password needed.
            </p>

            <Card className="mt-6">
              <CardContent>
                {status === "sent" ? (
                  <div className="flex flex-col gap-1.5" role="status">
                    <p className="font-semibold">Check your inbox</p>
                    <p className="text-sm text-muted-foreground">
                      We sent a sign-in link to <strong className="text-foreground">{email}</strong>.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email">Work email</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoFocus
                      />
                    </div>
                    {error && (
                      <p className="text-sm text-destructive" role="alert">
                        {error}
                      </p>
                    )}
                    <Button type="submit" size="lg" disabled={status === "sending"}>
                      {status === "sending" ? "Sending…" : "Send magic link"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            <p className="mt-6 text-sm text-muted-foreground">
              New to {BRAND_NAME}?{" "}
              <Link href="/demo" className="font-medium text-link hover:underline">
                Get a demo
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
