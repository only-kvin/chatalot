import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { formatShortLocal } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageActions } from "./message-actions";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getCurrentTenantId();
  if (!tenantId) redirect("/");

  const supabase = await createClient();
  const [{ data: m }, { data: config }, { data: widget }] = await Promise.all([
    supabase
      .from("contact_messages")
      .select("id, name, email, phone, subject, message, details, status, contact_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("agent_configs").select("business_name").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("widget_instances").select("fields").eq("tenant_id", tenantId).eq("type", "contact").maybeSingle(),
  ]);
  if (!m) notFound();

  // Custom answers, labelled with the business's current questions.
  const labels = new Map(((widget?.fields as { key: string; label: string }[] | null) ?? []).map((f) => [f.key, f.label]));
  const details = Object.entries((m.details as Record<string, string | boolean>) ?? {});

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/dashboard/messages" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Messages
        </Link>
        <h1 className="text-2xl font-semibold">{m.subject ?? `Message from ${m.name}`}</h1>
        <p className="mt-1 text-sm text-zinc-500">Received {formatShortLocal(m.created_at)}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="whitespace-pre-wrap">{m.message}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {m.email && (
              <>
                <dt className="text-zinc-500">Email</dt>
                <dd>{m.email}</dd>
              </>
            )}
            {m.phone && (
              <>
                <dt className="text-zinc-500">Phone</dt>
                <dd>{m.phone}</dd>
              </>
            )}
            {details.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-zinc-500">{labels.get(key) ?? key.replace(/^custom_/, "").replace(/_/g, " ")}</dt>
                <dd>{value === true ? "Yes" : value === false ? "No" : value}</dd>
              </div>
            ))}
          </dl>
          {m.contact_id && (
            <Link href={`/dashboard/customers/${m.contact_id}`} className="text-sm underline">
              View customer
            </Link>
          )}
          <MessageActions
            id={m.id}
            status={m.status}
            email={m.email}
            phone={m.phone}
            subject={m.subject}
            businessName={config?.business_name ?? "us"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
