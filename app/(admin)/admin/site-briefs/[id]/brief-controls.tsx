"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSiteBriefAction } from "../actions";

export function CopyPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(prompt);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the prompt is on the page to select by hand.
        }
      }}
    >
      {copied ? "Copied!" : "Copy prompt"}
    </Button>
  );
}

export function BriefFields({
  id,
  initial,
}: {
  id: string;
  initial: { status: string; lovableProjectUrl: string; liveDomain: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brief-status">Status</Label>
        <select
          id="brief-status"
          value={values.status}
          onChange={(e) => setValues({ ...values, status: e.target.value })}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {["draft", "ready", "in_build", "live", "withdrawn"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brief-lovable">Lovable project URL</Label>
        <Input id="brief-lovable" value={values.lovableProjectUrl} onChange={(e) => setValues({ ...values, lovableProjectUrl: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brief-domain">Live domain</Label>
        <Input id="brief-domain" value={values.liveDomain} onChange={(e) => setValues({ ...values, liveDomain: e.target.value })} placeholder="newsite.co.za" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateSiteBriefAction({
                id,
                status: values.status as "draft",
                lovableProjectUrl: values.lovableProjectUrl.trim(),
                liveDomain: values.liveDomain.trim(),
              });
              setMessage(result.error ?? "Saved.");
              if (!result.error) router.refresh();
            })
          }
        >
          Save
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}
