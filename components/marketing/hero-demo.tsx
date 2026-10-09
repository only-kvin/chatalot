"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { buildStyles } from "@/widget/styles";
import type { DemoChat } from "@/lib/marketing/demo-chat";

// The hero animation: a website with the real chat widget (its actual
// stylesheet, in a shadow root like on a customer's site), and beside it
// (below on phones) the owner's phone, where the result snaps into their
// day. Plays while on screen, loops, and shows the finished state with
// reduced motion.

const PRIMARY = "#4f46e5";

// Layout for the static frame around the widget's own classes. The panel
// itself is position: fixed in the widget, so the demo lays it out here.
const FRAME_CSS = `
  /* The widget's ":host { all: initial }" makes the host inline, which
     would ignore the demo's fixed height and let the hero grow. */
  :host { display: block; height: 100%; }
  .frame { display: flex; flex-direction: column; height: 100%; background: linear-gradient(180deg, #fff, #fcfcfd); }
  /* min-height: 0 lets the list shrink inside the fixed frame, so new
     messages push old ones out of view instead of growing the hero. */
  .messages { overflow: hidden; justify-content: flex-end; min-height: 0; }
  .input-row textarea { pointer-events: none; }
`;

// Timeline: each message appears after the previous one, with the typing
// indicator shown before every AI reply.
const VISITOR_PAUSE = 1100;
const TYPING_MS = 1300;
const RESULT_DELAY = 700;
const HOLD_MS = 5200;

type Frame = { shown: number; typing: boolean; result: boolean };

function buildTimeline(chat: DemoChat): { at: number; frame: Frame }[] {
  const steps: { at: number; frame: Frame }[] = [{ at: 0, frame: { shown: 0, typing: false, result: false } }];
  let t = 600;
  chat.messages.forEach((m, i) => {
    if (m.from === "ai") {
      steps.push({ at: t, frame: { shown: i, typing: true, result: false } });
      t += TYPING_MS;
    }
    steps.push({ at: t, frame: { shown: i + 1, typing: false, result: false } });
    t += m.from === "visitor" ? 500 : VISITOR_PAUSE + 400;
  });
  t += RESULT_DELAY - 400;
  steps.push({ at: t, frame: { shown: chat.messages.length, typing: false, result: true } });
  steps.push({ at: t + HOLD_MS, frame: { shown: 0, typing: false, result: false } });
  return steps;
}

export function HeroDemo({ chat, className }: { chat: DemoChat; className?: string }) {
  const finalFrame: Frame = { shown: chat.messages.length, typing: false, result: true };
  const [frame, setFrame] = useState<Frame>(finalFrame);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const timeline = buildTimeline(chat);
    const loopMs = timeline[timeline.length - 1].at;
    let timers: number[] = [];
    let loopTimer: number | undefined;
    let running = false;

    const play = () => {
      timers = timeline.map((s) => window.setTimeout(() => setFrame(s.frame), s.at));
      loopTimer = window.setTimeout(play, loopMs);
    };
    const start = () => {
      if (running) return;
      running = true;
      play();
    };
    const stop = () => {
      running = false;
      timers.forEach(clearTimeout);
      clearTimeout(loopTimer);
    };

    // Only animate while visible: off-screen or in a background tab it
    // rests on the finished conversation.
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden) start();
      else {
        stop();
        setFrame(finalFrame);
      }
    });
    if (wrapRef.current) io.observe(wrapRef.current);
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // finalFrame is derived from chat, so chat is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat]);

  const story = [chat.greeting, ...chat.messages.map((m) => m.text)].join(" ");

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={`Example: a customer chats with ${chat.business}'s AI receptionist on its website. ${story} The result appears in the owner's day on their phone.`}
      className={cn("mx-auto flex w-full max-w-[600px] flex-col gap-5 sm:flex-row sm:items-end", className)}
    >
      <BrowserWindow chat={chat} frame={frame} />
      <OwnerPhone chat={chat} showResult={frame.result} />
    </div>
  );
}

function BrowserWindow({ chat, frame }: { chat: DemoChat; frame: Frame }) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);

  return (
    <div className="w-full overflow-hidden rounded-2xl sm:w-[63%] sm:shrink-0 bg-white shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_40px_80px_-30px_rgb(0_0_0/0.6)] sm:w-[78%]">
      {/* Browser chrome. */}
      <div className="flex items-center gap-2 border-b border-black/5 bg-[#f4f4f7] px-3 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="ml-2 flex-1 truncate rounded-md bg-white px-2.5 py-1 text-[11px] text-zinc-500">
          {chat.business.toLowerCase().replace(/[^a-z]+/g, "")}.co.za
        </span>
      </div>
      <div
        className="h-[360px] sm:h-[400px]"
        ref={(el) => {
          if (el && !shadow) setShadow(el.shadowRoot ?? el.attachShadow({ mode: "open" }));
        }}
      >
        {shadow &&
          createPortal(
            <>
              <style>{buildStyles(PRIMARY) + FRAME_CSS}</style>
              <div className="frame">
                <div className="header">
                  <div className="avatar">{chat.business[0]}</div>
                  <div className="who">
                    <strong>{chat.business}</strong>
                    <span>
                      <span className="live" />
                      Online
                    </span>
                  </div>
                </div>
                <div className="messages">
                  <div className="msg assistant">{chat.greeting}</div>
                  {chat.messages.slice(0, frame.shown).map((m, i) => (
                    <div key={i} className={`msg ${m.from === "ai" ? "assistant" : "user"}`}>
                      {m.text}
                    </div>
                  ))}
                  {frame.typing && <div className="msg assistant" />}
                </div>
                <div className="input-row">
                  <textarea rows={1} placeholder="Type a message…" tabIndex={-1} readOnly />
                  <button className="send-btn" tabIndex={-1} type="button">
                    Send
                  </button>
                </div>
              </div>
            </>,
            shadow,
          )}
      </div>
    </div>
  );
}

function OwnerPhone({ chat, showResult }: { chat: DemoChat; showResult: boolean }) {
  // The new entry slots into the day in time order.
  const rows = [...chat.day.filter((d) => d.time !== chat.result.time), { ...chat.result, isNew: true }].sort((a, b) =>
    a.time.localeCompare(b.time),
  );

  return (
    <div className="mx-auto w-[64%] max-w-[230px] rounded-[34px] sm:mx-0 sm:mb-[-24px] sm:w-auto sm:flex-1 bg-[#111117] p-[7px] shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_40px_70px_-20px_rgb(0_0_0/0.7)] sm:bottom-[-36px]">
      <div className="relative overflow-hidden rounded-[28px] bg-[#f5f5f8] px-3 pt-7 pb-4">
        <span className="absolute top-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-[#111117]" aria-hidden />
        <p className="text-[10px] font-semibold tracking-wide text-zinc-600 uppercase">{chat.dayTitle}</p>
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-900">Your day</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {rows.map((r) =>
            "isNew" in r ? (
              <li key={r.time} className="relative h-[50px]">
                {/* The empty slot, which the new card lands on. */}
                <div className="absolute inset-0 rounded-xl border border-dashed border-zinc-300" />
                {showResult && (
                  <div className="snap-in absolute inset-0 rounded-xl bg-white p-2 shadow-[0_0_0_1.5px_#6366f1,0_10px_20px_-10px_rgb(79_70_229/0.6)]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold text-zinc-900 tabular-nums">{r.time}</span>
                      <span className="rounded-full bg-tone-new px-1.5 py-px text-[9px] font-semibold text-tone-new-foreground">
                        {r.label}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-zinc-600">
                      {r.customer} · {r.what}
                    </p>
                  </div>
                )}
              </li>
            ) : (
              <li key={r.time} className="rounded-xl bg-white p-2 shadow-[0_0_0_1px_rgb(17_17_26/0.06)]">
                <span className="text-[11px] font-semibold text-zinc-900 tabular-nums">{r.time}</span>
                <p className="truncate text-[11px] text-zinc-500">{r.customer ? `${r.customer} · ${r.what}` : "Free"}</p>
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  );
}
