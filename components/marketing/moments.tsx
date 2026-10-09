import { CheckIcon, MessageCircleIcon, StarIcon } from "lucide-react";
import { cn } from "cn";
import { BRAND_DOMAIN } from "@/lib/brand";

// Small looping product moments (HTML and CSS, no media files) for the
// problem and feature sections. Loops are defined in globals.css; --d
// delays an element within the 8s cycle. All decorative: the text beside
// each one says what it shows.

const d = (ms: number) => ({ "--d": ms }) as React.CSSProperties;

function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex h-48 flex-col justify-center gap-2 overflow-hidden rounded-2xl bg-linear-to-b from-[#f4f4fb] to-[#ececf6] p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Notification({ title, body, className, style }: { title: string; body: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-2xl bg-white/90 p-3 shadow-raised backdrop-blur", className)} style={style}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-linear-145 from-[#6d67f5] to-[#3f35c4]">
        <MessageCircleIcon className="size-3.5 text-white" strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-zinc-900">{title}</span>
        <span className="block truncate text-[12px] text-zinc-600">{body}</span>
      </span>
    </div>
  );
}

// Problem 1: a message at night that nobody answers.
export function MissedAfterHours() {
  return (
    <Stage className="bg-linear-to-b from-[#1b1b2e] to-[#0f0f1a]">
      <p className="text-center text-3xl font-semibold tracking-tight text-white tabular-nums">21:47</p>
      <Notification title="New message" body="Hi, are you open on Saturday?" className="loop-in" style={d(0)} />
      <span className="loop-pop mx-auto rounded-full bg-tone-bad px-2.5 py-0.5 text-[11px] font-semibold text-tone-bad-foreground" style={d(1600)}>
        Still unanswered at 09:00
      </span>
    </Stage>
  );
}

// Problem 2: a booked slot that stays empty.
export function NoShow() {
  return (
    <Stage>
      {[
        { t: "09:00", who: "Lerato · Pedicure", chip: null },
        { t: "10:00", who: "Nomsa · Gel manicure", chip: "No-show" },
        { t: "11:00", who: "Aisha · Lash lift", chip: null },
      ].map((r) => (
        <div
          key={r.t}
          className={cn(
            "flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-[0_0_0_1px_rgb(17_17_26/0.06)]",
            r.chip && "loop-in",
          )}
          style={r.chip ? d(0) : undefined}
        >
          <span className="text-[12px] text-zinc-700">
            <span className="mr-2 font-semibold text-zinc-900 tabular-nums">{r.t}</span>
            {r.who}
          </span>
          {r.chip && (
            <span className="loop-pop rounded-full bg-tone-bad px-2 py-0.5 text-[10px] font-semibold text-tone-bad-foreground" style={d(1200)}>
              {r.chip}
            </span>
          )}
        </div>
      ))}
    </Stage>
  );
}

// Problem 3: an enquiry sinking under newer chats.
export function LostInChats() {
  const newer = [
    { who: "Family group", text: "Photos from Sunday 📸" },
    { who: "Supplier", text: "Invoice attached" },
    { who: "Ma", text: "Call me when you can" },
  ];
  return (
    <Stage className="justify-start">
      {newer.map((c, i) => (
        <div key={c.who} className="loop-in flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 shadow-[0_0_0_1px_rgb(17_17_26/0.06)]" style={d(i * 500)}>
          <span className="size-6 shrink-0 rounded-full bg-zinc-200" />
          <span className="min-w-0 text-[12px]">
            <span className="block font-semibold text-zinc-900">{c.who}</span>
            <span className="block truncate text-zinc-500">{c.text}</span>
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2.5 rounded-xl bg-white/60 px-3 py-2 opacity-60">
        <span className="size-6 shrink-0 rounded-full bg-zinc-200" />
        <span className="min-w-0 text-[12px]">
          <span className="block font-semibold text-zinc-900">+27 82 …</span>
          <span className="block truncate text-zinc-500">Hi, can you quote for a geyser?</span>
        </span>
      </div>
    </Stage>
  );
}

// Feature: tapping "Take over" on a conversation.
export function TakeOverMoment() {
  return (
    <Stage>
      <div className="rounded-2xl bg-white p-3 shadow-raised">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-zinc-900">Sipho M.</span>
          <span className="relative">
            <span className="loop-swap-a absolute inset-0 rounded-full bg-tone-new px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-tone-new-foreground">
              AI replying
            </span>
            <span className="loop-swap-b rounded-full bg-tone-ok px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-tone-ok-foreground">
              You&apos;re replying
            </span>
          </span>
        </div>
        <p className="mt-1.5 text-[12px] text-zinc-600">Can I bring my own colour for the nails?</p>
        <div className="relative mt-3 inline-flex">
          <span className="rounded-lg bg-linear-to-b from-[#5b53f0] to-[#4338ca] px-3 py-1.5 text-[12px] font-semibold text-white">
            Take over
          </span>
          <span className="loop-tap absolute inset-[-6px] rounded-xl border-2 border-[#6366f1]" />
        </div>
      </div>
    </Stage>
  );
}

// Feature: a reminder going out, and the customer confirming.
export function ReminderMoment() {
  return (
    <Stage>
      <Notification title="Glow Studio" body="Reminder: gel manicure tomorrow at 10:00" className="loop-in" style={d(0)} />
      <span
        className="loop-pop ml-auto inline-flex items-center gap-1 rounded-full bg-tone-ok px-2.5 py-0.5 text-[11px] font-semibold text-tone-ok-foreground"
        style={d(1400)}
      >
        <CheckIcon className="size-3" strokeWidth={3} /> Confirmed
      </span>
    </Stage>
  );
}

// Feature: a lead card arriving and review stars landing.
export function GrowMoment() {
  return (
    <Stage>
      <div className="loop-in rounded-2xl bg-white p-3 shadow-raised" style={d(0)}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-zinc-900">New lead: Sipho</span>
          <span className="rounded-full bg-tone-new px-2 py-0.5 text-[10px] font-semibold text-tone-new-foreground">New</span>
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-600">Wants a quote for a geyser · 082 …</p>
      </div>
      <div className="flex items-center justify-center gap-1 pt-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} className="loop-pop size-6 fill-amber-400 text-amber-400" style={d(1400 + i * 150)} />
        ))}
      </div>
    </Stage>
  );
}

// Feature: the one-line install.
export function InstallMoment() {
  return (
    <Stage>
      <pre className="overflow-hidden rounded-xl bg-[#0f0f1a] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-indigo-100">
        {`<script src="https://${BRAND_DOMAIN}/widget.js"\n  data-key="pk_…" async></script>`}
      </pre>
      <span
        className="loop-pop ml-auto inline-flex items-center gap-1 rounded-full bg-tone-ok px-2.5 py-0.5 text-[11px] font-semibold text-tone-ok-foreground"
        style={d(1000)}
      >
        <CheckIcon className="size-3" strokeWidth={3} /> Live on your site
      </span>
    </Stage>
  );
}
