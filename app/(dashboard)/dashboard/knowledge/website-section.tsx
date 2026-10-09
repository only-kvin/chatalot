"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GlobeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatLocalDateTime } from "@/lib/time";
import { removeWebsiteKnowledgeAction, setWebsitePageExcludedAction, startWebsiteImportAction } from "./website-actions";

export type WebsiteImport = {
  status: "queued" | "running" | "done" | "failed";
  startUrl: string;
  pagesFound: number;
  pagesRead: number;
  pagesDone: number;
  pagesFailed: number;
  pagesEmpty: number;
  capped: boolean;
  error: string | null;
  finishedAt: string | null;
};

export type WebsitePage = {
  id: string;
  title: string;
  url: string;
  updatedAt: string;
  excluded: boolean;
  preview: string;
};

// "From your website" on the Knowledge page: import the business's own site,
// watch progress, and switch individual pages off.
export function WebsiteSection({
  domains,
  latest,
  pages,
}: {
  domains: string[];
  latest: WebsiteImport | null;
  pages: WebsitePage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [startPath, setStartPath] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const running = latest?.status === "queued" || latest?.status === "running";

  // Refresh while an import runs, so progress moves on its own.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [running, router]);

  const act = (fn: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });

  const startUrl = () => {
    const path = startPath.trim();
    if (/^https?:\/\//i.test(path)) return path;
    return `https://${domain}${path ? (path.startsWith("/") ? path : `/${path}`) : ""}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GlobeIcon className="size-4" aria-hidden /> From your website
        </CardTitle>
        <CardDescription>
          Import your website so the AI can answer from it too. Your own answers above always take priority over your
          website.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add your website under{" "}
            <Link href="/dashboard/settings" className="font-medium text-link underline">
              Settings → Allowed domains
            </Link>{" "}
            first. That&apos;s where you confirm the site is yours.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-domain">Website</Label>
                <select
                  id="import-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={running || pending}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-start">
                  Start page <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="import-start"
                  value={startPath}
                  onChange={(e) => setStartPath(e.target.value)}
                  placeholder="/ (your home page)"
                  disabled={running || pending}
                />
              </div>
            </div>
            <div>
              <Button disabled={running || pending} onClick={() => act(() => startWebsiteImportAction(startUrl()))}>
                {pages.length || latest ? "Re-import now" : "Import website"}
              </Button>
            </div>
          </div>
        )}

        {latest && <ImportStatus run={latest} />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {pages.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {pages.length} page{pages.length === 1 ? "" : "s"} from your website
            </h3>
            <ul className="flex flex-col divide-y rounded-xl border border-border">
              {pages.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={p.excluded ? "truncate text-sm font-medium text-muted-foreground line-through" : "truncate text-sm font-medium"}>
                        {p.title}
                      </p>
                      <a href={p.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-link hover:underline">
                        {p.url}
                      </a>
                      <p className="text-xs text-muted-foreground">Updated {formatLocalDateTime(p.updatedAt)}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {p.excluded ? "Off" : "In use"}
                      <Switch
                        checked={!p.excluded}
                        disabled={pending}
                        aria-label={`Use "${p.title}"`}
                        onChange={(e) => act(() => setWebsitePageExcludedAction(p.id, !e.target.checked))}
                      />
                    </label>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">What the AI sees</summary>
                    <p className="mt-1.5 max-h-48 overflow-y-auto rounded-lg bg-muted p-2.5 whitespace-pre-wrap">{p.preview}</p>
                  </details>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {confirmRemove ? (
                <>
                  <span className="text-sm">Remove all {pages.length} website pages from your knowledge?</span>
                  <Button size="sm" variant="destructive" disabled={pending} onClick={() => act(removeWebsiteKnowledgeAction)}>
                    Yes, remove them
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive" disabled={running} onClick={() => setConfirmRemove(true)}>
                  Remove all website knowledge
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportStatus({ run }: { run: WebsiteImport }) {
  if (run.status === "queued" || run.status === "running") {
    const pct = run.pagesFound ? Math.round((run.pagesRead / run.pagesFound) * 100) : 0;
    return (
      <div role="status" className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
        <p className="text-sm">
          Reading your website… {run.pagesFound ? `${run.pagesRead} of ${run.pagesFound} pages` : "finding pages"}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (run.status === "failed") {
    return (
      <p role="status" className="rounded-xl bg-tone-bad p-3 text-sm text-tone-bad-foreground">
        The last import didn&apos;t finish: {run.error ?? "something went wrong"}.
      </p>
    );
  }
  const notes = [
    run.pagesEmpty > 0 &&
      `${run.pagesEmpty} page${run.pagesEmpty === 1 ? " was" : "s were"} almost empty, which usually means the site is built with JavaScript, so the AI couldn't read ${run.pagesEmpty === 1 ? "it" : "them"}`,
    run.pagesFailed > 0 && `${run.pagesFailed} couldn't be loaded`,
    run.capped && "your website is larger than the limit, so some pages weren't added",
  ].filter(Boolean);
  return (
    <div role="status" className="rounded-xl bg-tone-ok p-3 text-sm text-tone-ok-foreground">
      <p>
        Read {run.pagesDone} page{run.pagesDone === 1 ? "" : "s"} from {new URL(run.startUrl).hostname}
        {run.finishedAt ? ` on ${formatLocalDateTime(run.finishedAt)}` : ""}.
      </p>
      {notes.length > 0 && <p className="mt-1">Note: {notes.join("; ")}.</p>}
    </div>
  );
}
