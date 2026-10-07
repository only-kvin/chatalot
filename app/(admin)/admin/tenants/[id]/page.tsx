import { appUrl } from "@/lib/app-url";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { connectWhatsAppChannelAction, disconnectWhatsAppChannelAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, public_widget_key")
    .eq("id", id)
    .single();
  if (!tenant) notFound();

  const { data: channel } = await supabase
    .from("channels")
    .select("wa_phone_number_id, status")
    .eq("tenant_id", id)
    .eq("type", "whatsapp")
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">/{tenant.slug}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp channel</CardTitle>
          <CardDescription>
            Connect this tenant&apos;s WhatsApp Business number. The phone must already
            be set up with Meta&apos;s WhatsApp Cloud API — see docs/SETUP.md for the
            per-client onboarding steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {channel && (
            <p className="text-sm">
              Connected: <span className="font-mono">{channel.wa_phone_number_id}</span>{" "}
              <Badge variant={channel.status === "active" ? "default" : "secondary"}>
                {channel.status}
              </Badge>
            </p>
          )}

          <form action={connectWhatsAppChannelAction} className="flex flex-col gap-4">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input
                id="phoneNumberId"
                name="phoneNumberId"
                required
                placeholder="From Meta's WhatsApp API dashboard"
                defaultValue={channel?.wa_phone_number_id ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="accessToken">Access token</Label>
              <Input
                id="accessToken"
                name="accessToken"
                type="password"
                required
                placeholder="Permanent access token"
              />
              <p className="text-xs text-muted-foreground">
                Stored encrypted. Re-enter it to rotate — it can&apos;t be viewed once saved.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="submit">{channel ? "Update" : "Connect"}</Button>
              {channel?.status === "active" && (
                <Button
                  type="submit"
                  variant="outline"
                  formAction={disconnectWhatsAppChannelAction}
                >
                  Disconnect
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Website widget</CardTitle>
        </CardHeader>
        <CardContent>
          <code className="block rounded bg-muted p-3 text-xs">
            {`<script src="${appUrl("/widget.js")}" data-key="${tenant.public_widget_key}" async></script>`}
          </code>
        </CardContent>
      </Card>
    </div>
  );
}
