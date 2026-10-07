"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { BellIcon, GlobeIcon, LockIcon, MessageCircleIcon, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PLAN_LABEL, planFor, type FeatureState } from "@/lib/plans";
import { setAiSwitchAction, type AiSwitchKey } from "./actions";

type Values = Record<AiSwitchKey, boolean>;

type Row = {
  key: AiSwitchKey;
  title: string;
  on: string;
  off: string;
  icon: LucideIcon;
  tile: string;
};

const ROWS: Row[] = [
  {
    key: "web_ai_enabled",
    title: "Website chat",
    on: "Answering visitors",
    off: "Paused — visitors see your contact details",
    icon: GlobeIcon,
    tile: "from-[#6d67f5] to-[#4338ca]",
  },
  {
    key: "whatsapp_ai_enabled",
    title: "WhatsApp",
    on: "Answering messages",
    off: "Paused — you reply from Conversations",
    icon: MessageCircleIcon,
    tile: "from-[#4ade80] to-[#15803d]",
  },
  {
    key: "lead_email_enabled",
    title: "Email me new leads",
    on: "Sent to your inbox instantly",
    off: "Off — new leads still show in the bell",
    icon: BellIcon,
    tile: "from-[#fdba74] to-[#c2410c]",
  },
];

// A channel's switch: hidden when the platform admin switched the feature
// off, locked (with an upgrade link) when it isn't on their plan.
export function AiSwitches({
  initial,
  webChat,
  whatsapp,
  whatsappConnected,
}: {
  initial: Values;
  webChat: FeatureState;
  whatsapp: FeatureState;
  whatsappConnected: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [optimistic, setOptimistic] = useOptimistic(values);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: AiSwitchKey, on: boolean) {
    setError(null);
    startTransition(async () => {
      setOptimistic({ ...values, [key]: on });
      const result = await setAiSwitchAction(key, on);
      if (result.error) setError(result.error);
      else setValues((v) => ({ ...v, [key]: on }));
    });
  }

  const webUsable = webChat === "on";
  const waUsable = whatsapp === "on" && whatsappConnected;
  const channels = [webUsable, waUsable].filter(Boolean).length;
  const channelsOn = [webUsable && optimistic.web_ai_enabled, waUsable && optimistic.whatsapp_ai_enabled].filter(Boolean).length;
  const summary =
    channels === 0
      ? "Leads and messages still reach you"
      : channelsOn === channels
        ? channels === 1
          ? webUsable
            ? "On for website chat"
            : "On for WhatsApp"
          : "On for every channel"
        : channelsOn === 0
          ? "Paused everywhere"
          : "On for one channel";
  const rows = ROWS.filter(
    (row) =>
      !(row.key === "web_ai_enabled" && webChat !== "on") && !(row.key === "whatsapp_ai_enabled" && whatsapp === "hidden"),
  );

  return (
    <>
      <p className="-mt-3 text-[13px] text-muted-foreground">{summary}</p>
      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const locked = row.key === "whatsapp_ai_enabled" && whatsapp === "locked";
          const connected = row.key !== "whatsapp_ai_enabled" || whatsappConnected;
          const on = optimistic[row.key];
          const id = `ai-switch-${row.key}`;
          return (
            <div key={row.key} className="flex items-center gap-3 rounded-[14px] p-2.5 transition-colors hover:bg-hover">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-linear-145 ${row.tile}`}>
                <row.icon className="size-[18px] text-white" />
              </span>
              <label htmlFor={connected ? id : undefined} className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{row.title}</span>
                <span className="text-xs text-muted-foreground">
                  {locked
                    ? `Available on ${PLAN_LABEL[planFor("whatsapp")]}`
                    : connected
                      ? on
                        ? row.on
                        : row.off
                      : "No WhatsApp number connected yet"}
                </span>
              </label>
              {locked ? (
                <Link
                  href="/dashboard/upgrade/whatsapp"
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-link hover:underline"
                >
                  <LockIcon className="size-3.5" />
                  Upgrade
                </Link>
              ) : (
                connected && <Switch id={id} checked={on} onChange={(e) => toggle(row.key, e.target.checked)} />
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="feedback-enter text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
