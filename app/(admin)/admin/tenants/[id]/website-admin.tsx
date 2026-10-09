"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONSENT_TEXT, type BusinessConsentKind } from "@/lib/consent/business-consent";
import { generateSiteBriefAdminAction } from "../../site-briefs/actions";
import { recordConsentAdminAction, replaceWebsiteAdminAction } from "./actions";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// Record consent given offline; a note saying how is required.
export function RecordConsentForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<BusinessConsentKind>("website_content");
  const [granted, setGranted] = useState("yes");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Consent" value={kind} onChange={(e) => setKind(e.target.value as BusinessConsentKind)} className={selectClass}>
          {(Object.keys(CONSENT_TEXT) as BusinessConsentKind[]).map((k) => (
            <option key={k} value={k}>
              {k === "website_content" ? "Website content" : "Website images"}
            </option>
          ))}
        </select>
        <select aria-label="Answer" value={granted} onChange={(e) => setGranted(e.target.value)} className={selectClass}>
          <option value="yes">Agreed</option>
          <option value="no">Not agreed / withdrawn</option>
        </select>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="How they agreed, e.g. email from owner, 9 Oct" aria-label="Note" />
      <div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await recordConsentAdminAction({ tenantId, kind, granted: granted === "yes", note });
              setMessage(result.error ?? "Recorded.");
              if (!result.error) {
                setNote("");
                router.refresh();
              }
            })
          }
        >
          Record
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

export function GenerateBriefButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [briefId, setBriefId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await generateSiteBriefAdminAction(tenantId);
              setMessage(result.error);
              setBriefId(result.id ?? null);
              router.refresh();
            })
          }
        >
          {pending ? "Preparing… (up to a minute)" : "Generate brief"}
        </Button>
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
      {briefId && (
        <Link href={`/admin/site-briefs/${briefId}`} className="text-xs text-link underline">
          Open the new brief
        </Link>
      )}
    </div>
  );
}

export function ReplaceWebsiteForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="new-domain">New website&apos;s domain</Label>
      <Input id="new-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="newsite.co.za" />
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-lg bg-tone-warn p-2.5 text-xs text-tone-warn-foreground">
          <p>
            This removes everything imported from their current website, imports {domain || "the new site"}, and marks their latest brief
            as live. Continue?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await replaceWebsiteAdminAction({ tenantId, domain });
                  setConfirming(false);
                  setMessage(result.error ?? "Done. The new site is importing; progress shows on their Knowledge page.");
                  if (!result.error) router.refresh();
                })
              }
            >
              Replace website
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="outline" disabled={!domain.trim()} onClick={() => setConfirming(true)}>
            Replace website…
          </Button>
        </div>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
