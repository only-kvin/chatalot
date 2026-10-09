"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { BRAND_NAME } from "@/lib/brand";
import { CONSENT_TEXT, type BusinessConsentKind } from "@/lib/consent/business-consent";
import { formatLocalDateTime } from "@/lib/time";
import { requestNewWebsiteAction, requestSiteBriefAction, setWebsiteConsentAction } from "./website-actions";

export type ConsentView = { granted: boolean; textVersion: string; createdAt: string; source: string } | null;

export type BriefView = {
  version: number;
  status: string;
  createdAt: string;
  missing: string[];
  stale: boolean;
} | null;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft: some details still needed",
  ready: "Ready",
  in_build: "Being built",
  live: "Live",
  withdrawn: "Withdrawn",
};

// Settings → Your website: the two website consents (with their history
// behind them), the latest website brief, and "I'd like a new website".
export function YourWebsite({
  consents,
  brief,
  setupDone,
  websiteRequested,
}: {
  consents: Record<BusinessConsentKind, ConsentView>;
  brief: BriefView;
  setupDone: boolean;
  websiteRequested: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const act = (fn: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });

  const toggle = (kind: BusinessConsentKind, granted: boolean) => {
    // Withdrawing content consent removes imported pages: confirm first.
    if (kind === "website_content" && !granted) {
      setConfirmWithdraw(true);
      return;
    }
    act(() => setWebsiteConsentAction(kind, granted));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your website</CardTitle>
        <CardDescription>What we may use from your website, and the brief for a new site.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {(Object.keys(CONSENT_TEXT) as BusinessConsentKind[]).map((kind) => {
          const answer = consents[kind];
          return (
            <div key={kind} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{CONSENT_TEXT[kind].label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{CONSENT_TEXT[kind].detail}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {answer
                    ? `${answer.granted ? "Agreed" : "Not agreed"} ${formatLocalDateTime(answer.createdAt)} (wording ${answer.textVersion}${answer.source === "admin" ? `, recorded by ${BRAND_NAME}` : ""})`
                    : "Not answered yet"}
                </p>
              </div>
              <Switch
                checked={answer?.granted ?? false}
                disabled={pending}
                aria-label={CONSENT_TEXT[kind].label}
                onChange={(e) => toggle(kind, e.target.checked)}
              />
            </div>
          );
        })}

        {confirmWithdraw && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-tone-warn p-3 text-sm text-tone-warn-foreground">
            <p>
              This removes everything imported from your website from your AI receptionist&apos;s knowledge, and withdraws any
              website brief. Continue?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setConfirmWithdraw(false);
                  act(() => setWebsiteConsentAction("website_content", false));
                }}
              >
                Yes, withdraw
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-sm font-semibold">Website brief</h3>
          {brief ? (
            <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 text-sm">
              <p>
                Version {brief.version} · {STATUS_LABEL[brief.status] ?? brief.status} · made {formatLocalDateTime(brief.createdAt)}
              </p>
              {brief.stale && brief.status !== "withdrawn" && (
                <p className="text-tone-warn-foreground">Your services, prices, hours or staff have changed since this brief.</p>
              )}
              {brief.missing.length > 0 && (
                <div>
                  <p className="font-medium">What we still need from you:</p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {brief.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              A brief gathers your services, prices, hours and team into a plan for a new website, with your {BRAND_NAME}{" "}
              widgets already in it.
            </p>
          )}
          {setupDone ? (
            <div>
              <Button disabled={pending} onClick={() => act(requestSiteBriefAction)}>
                {pending ? "Preparing…" : brief ? "Regenerate brief" : "Get a website brief"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Finish the{" "}
              <Link href="/dashboard" className="text-link underline">
                set-up checklist
              </Link>{" "}
              first, so the brief uses your current details.
            </p>
          )}
          <div>
            {websiteRequested ? (
              <p className="text-sm text-muted-foreground">Thanks: we&apos;ll be in touch about a new website.</p>
            ) : (
              <Button variant="outline" disabled={pending} onClick={() => act(requestNewWebsiteAction)}>
                I&apos;d like a new website
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
