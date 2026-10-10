import { notFound, redirect } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { currentTenantFeatures } from "@/lib/dashboard-features";
import { FEATURE_INFO, FEATURES, PLAN_LABEL, planFor, type Feature } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FeaturePreview } from "../feature-preview";
import { RequestUpgradeButton } from "../request-upgrade-button";
import { pageFrame } from "@/components/dashboard/page-frame";

// Where each feature lives once it's unlocked.
const FEATURE_HOME: Record<Feature, string> = {
  web_chat: "/dashboard/widget",
  contact_form: "/dashboard/messages",
  whatsapp: "/dashboard/conversations",
  bookings: "/dashboard/bookings",
  reviews: "/dashboard/settings",
  registration: "/dashboard/widget?tab=registration",
};

export default async function UpgradePage({ params }: { params: Promise<{ feature: string }> }) {
  const { feature: raw } = await params;
  if (!FEATURES.includes(raw as Feature)) notFound();
  const feature = raw as Feature;

  const current = await currentTenantFeatures();
  if (!current) redirect("/");
  const state = current.features[feature];
  if (state === "on") redirect(FEATURE_HOME[feature]);
  if (state === "hidden") notFound();

  const supabase = await createClient();
  const { data: open } = await supabase
    .from("upgrade_requests")
    .select("id")
    .eq("tenant_id", current.tenantId)
    .eq("feature", feature)
    .is("handled_at", null)
    .maybeSingle();

  const info = FEATURE_INFO[feature];
  return (
    <div className={pageFrame("detail")}>
      <Card className="gap-0 overflow-hidden p-0 md:flex-row">
        <div className="flex flex-1 flex-col gap-5 p-7">
          <Badge variant="new" className="self-start">
            Available on {PLAN_LABEL[planFor(feature)]}
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em]">{info.title}</h1>
            <p className="text-[15px] text-muted-foreground">{info.pitch}</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {info.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-tone-ok text-tone-ok-foreground">
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-2">
            <RequestUpgradeButton feature={feature} alreadyRequested={!!open} />
          </div>
        </div>
        <div className="flex flex-1 items-center bg-surface-2 p-7">
          <div className="w-full">
            <FeaturePreview feature={feature} />
          </div>
        </div>
      </Card>
    </div>
  );
}
