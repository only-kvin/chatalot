import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/db/supabase-server";
import { briefIsStale } from "@/lib/site-brief/generate";
import { formatLocalDateTime } from "@/lib/time";
import { BriefFields, CopyPromptButton } from "./brief-controls";

export default async function SiteBriefPage({ params }: PageProps<"/admin/site-briefs/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: brief } = await supabase
    .from("site_briefs")
    .select("*, tenants(name)")
    .eq("id", id)
    .maybeSingle();
  if (!brief) notFound();
  const stale = await briefIsStale(supabase, brief.tenant_id, brief.data_fingerprint);
  const missing = brief.missing as string[];
  const conflicts = brief.conflicts as { field: string; ownerValue: string; websiteValue: string }[];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/site-briefs" className="text-sm text-muted-foreground hover:underline">
            ← Site briefs
          </Link>
          <h1 className="text-2xl font-semibold">
            {(brief.tenants as { name: string } | null)?.name} · v{brief.version}
          </h1>
          <p className="text-sm text-muted-foreground">
            Data from {formatLocalDateTime(brief.data_snapshot_at)} · images: {brief.image_policy === "own" ? "their own" : "AI-generated"} · schema v
            {brief.profile_schema_version}
          </p>
          {stale && <p className="text-sm text-tone-warn-foreground">Business data changed since this brief: generate a new one from the tenant page.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyPromptButton prompt={brief.prompt_markdown} />
          <a href={`/api/admin/site-briefs/${brief.id}?format=md`} className={buttonVariants({ variant: "outline" })}>
            Download .md
          </a>
          <a href={`/api/admin/site-briefs/${brief.id}?format=json`} className={buttonVariants({ variant: "outline" })}>
            Download .json
          </a>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Build status</CardTitle>
        </CardHeader>
        <CardContent>
          <BriefFields
            id={brief.id}
            initial={{ status: brief.status, lovableProjectUrl: brief.lovable_project_url ?? "", liveDomain: brief.live_domain ?? "" }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gaps ({missing.length})</CardTitle>
            <CardDescription>Ask the client for these.</CardDescription>
          </CardHeader>
          <CardContent>
            {missing.length ? (
              <ul className="list-disc pl-5 text-sm">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conflicts ({conflicts.length})</CardTitle>
            <CardDescription>The website disagrees; the owner&apos;s value is used.</CardDescription>
          </CardHeader>
          <CardContent>
            {conflicts.length ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                {conflicts.map((c) => (
                  <li key={c.field}>
                    <strong>{c.field}:</strong> owner &ldquo;{c.ownerValue}&rdquo;, website &ldquo;{c.websiteValue}&rdquo;
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lovable prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[600px] overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap">{brief.prompt_markdown}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[600px] overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(brief.profile, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
