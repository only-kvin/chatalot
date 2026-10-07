"use client";

import { useOptimistic, useState, useTransition } from "react";
import { BellIcon, GlobeIcon, MessageCircleIcon, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

export function AiSwitches({ initial, whatsappConnected }: { initial: Values; whatsappConnected: boolean }) {
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

  const channelsOn = [optimistic.web_ai_enabled, whatsappConnected && optimistic.whatsapp_ai_enabled].filter(Boolean).length;
  const channels = whatsappConnected ? 2 : 1;
  const summary =
    channelsOn === channels ? (channels === 1 ? "On for website chat" : "On for every channel") : channelsOn === 0 ? "Paused everywhere" : "On for one channel";

  return (
    <>
      <p className="-mt-3 text-[13px] text-muted-foreground">{summary}</p>
      <div className="flex flex-col gap-1">
        {ROWS.map((row) => {
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
                  {connected ? (on ? row.on : row.off) : "No WhatsApp number connected yet"}
                </span>
              </label>
              {connected && <Switch id={id} checked={on} onChange={(e) => toggle(row.key, e.target.checked)} />}
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
