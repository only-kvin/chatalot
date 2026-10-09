"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importWebsiteAdminAction } from "./actions";

export function ImportWebsiteForm({ tenantId, domains }: { tenantId: string; domains: string[] }) {
  const [url, setUrl] = useState(domains[0] ? `https://${domains[0]}` : "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.co.za" aria-label="Website address" />
        <Button
          disabled={pending || !url}
          onClick={() =>
            startTransition(async () => {
              const result = await importWebsiteAdminAction(tenantId, url);
              setMessage(result.error ?? "Import started. Progress shows on their Knowledge page.");
            })
          }
        >
          Import website
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
