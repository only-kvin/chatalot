import { ClockIcon } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

// Self-serve trials wait for the platform admin's approval. Meanwhile the
// owner can set everything up; the public just can't see the business yet
// (every public endpoint serves only active businesses).
export function PendingBanner() {
  return (
    <div role="status" className="mx-4 mt-4 flex items-start gap-3 rounded-2xl border border-tone-warn-foreground/15 bg-tone-warn px-4 py-3 text-tone-warn-foreground sm:mx-[clamp(16px,3vw,40px)]">
      <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-sm">
        <strong className="font-semibold">Waiting for approval.</strong> Set things up in the meantime: add your
        knowledge, hours and widget. Your receptionist starts answering customers once we&apos;ve approved your
        business, and we&apos;ll email you when it&apos;s live.
      </p>
    </div>
  );
}

export function DeclinedNotice() {
  return (
    <div className="app-backdrop flex min-h-screen items-center justify-center p-4">
      <div className="flex max-w-md flex-col gap-3 rounded-[20px] border border-border bg-card p-8 text-center shadow-card">
        <h1 className="text-xl font-semibold">This trial wasn&apos;t approved</h1>
        <p className="text-sm text-muted-foreground">
          {BRAND_NAME} isn&apos;t available for this business right now. If you think that&apos;s a mistake, email us at{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} className="text-link underline">
            {LEGAL.contactEmail}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
