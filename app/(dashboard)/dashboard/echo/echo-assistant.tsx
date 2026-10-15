"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightIcon, ArrowUpIcon, MicIcon, SquareIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { LISTEN_ERRORS, canListen, canSpeak, createSpeaker, listen, type Listener, type Speaker } from "./voice";

// Echo, the dashboard's built-in guide: a floating orb that opens a chat
// panel. It knows which page the owner is on and answers from the dashboard
// guide (lib/echo), with buttons that take them to the right page. They can
// type or talk: a spoken question gets a spoken answer (unless "talk back" is
// off), and talking, typing or Stop cuts Echo off mid-sentence. The
// conversation is kept for this browser tab only.

type EchoLink = { href: string; label: string };
type Turn = { role: "user" | "assistant"; content: string; links?: EchoLink[]; error?: boolean };
// "speaking" is tracked apart from this: Echo can still be talking after the
// reply has fully arrived.
type Status = "idle" | "listening" | "thinking" | "replying";
type Face = Status | "speaking";

const STORAGE_KEY = "echo:conversation";
const TALK_BACK_KEY = "echo:talk-back";
const MAX_SENT_TURNS = 20;

const GENERAL_PROMPTS = ["What should I set up next?", "I'm lost. Where am I?"];
const PAGE_PROMPTS: [string, string][] = [
  ["/dashboard/availability", "How do I close for a public holiday?"],
  ["/dashboard/services", "How do call-out fees work?"],
  ["/dashboard/staff", "How do I give someone time off?"],
  ["/dashboard/bookings", "How do I reschedule a booking?"],
  ["/dashboard/knowledge", "What should I add here first?"],
  ["/dashboard/widget", "How do I put the chat on my website?"],
  ["/dashboard/settings", "What do Allowed domains do?"],
  ["/dashboard/conversations", "How do I take over a chat?"],
  ["/dashboard/leads", "What do I do with a new lead?"],
];

// Browser storage can be missing or blocked; Echo works without it.
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {}
}

function loadTurns(): Turn[] {
  try {
    const saved = JSON.parse(read(() => sessionStorage, STORAGE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function EchoAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [talkBack, setTalkBack] = useState(true);
  const [voice, setVoice] = useState({ listen: false, speak: false });
  // A short note above the input (mic problems), not part of the conversation.
  const [notice, setNotice] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  // The listener finishes later, from a callback: these keep send() reading
  // the current conversation, not the one from when the mic was pressed.
  const turnsRef = useRef(turns);
  const statusRef = useRef(status);
  const talkBackRef = useRef(talkBack);
  useEffect(() => {
    turnsRef.current = turns;
    statusRef.current = status;
    talkBackRef.current = talkBack;
  });

  const loadedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () => () => {
      listenerRef.current?.abort();
      speakerRef.current?.stop();
      abortRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    // Not before the saved one is loaded, or the empty start would replace it.
    if (status === "idle" && loadedRef.current) write(() => sessionStorage, STORAGE_KEY, JSON.stringify(turns.slice(-40)));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, status]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const pagePrompt = PAGE_PROMPTS.find(([href]) => pathname === href || pathname.startsWith(href + "/"))?.[1];
  const suggestions = pagePrompt ? [pagePrompt, ...GENERAL_PROMPTS] : GENERAL_PROMPTS;
  const waiting = status === "thinking" || status === "replying";
  const face: Face = status === "idle" && speaking ? "speaking" : status;

  function updateLast(change: (turn: Turn) => Turn) {
    setTurns((all) => [...all.slice(0, -1), change(all[all.length - 1])]);
  }

  function stopSpeaking() {
    speakerRef.current?.stop();
    speakerRef.current = null;
  }

  async function send(text: string, spoken = false) {
    const message = text.trim();
    if (!message || statusRef.current === "thinking" || statusRef.current === "replying") return;
    stopSpeaking();
    setNotice(null);
    const current = turnsRef.current;
    const history = [...current.filter((t) => !t.error), { role: "user" as const, content: message }];
    setTurns([...current, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setInput("");
    setStatus("thinking");

    // Spoken questions get spoken answers, read out as they arrive.
    const speaker =
      spoken && talkBackRef.current && canSpeak()
        ? createSpeaker({ onStart: () => setSpeaking(true), onDone: () => setSpeaking(false) })
        : null;
    speakerRef.current = speaker;

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/echo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathname,
          messages: history.slice(-MAX_SENT_TURNS).map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "I couldn't reach my notes just now. Try again in a moment?");
      }
      await readStream(res.body, (event) => {
        if (event.type === "text") {
          setStatus("replying");
          updateLast((t) => ({ ...t, content: t.content + event.text }));
          speaker?.say(event.text);
        } else if (event.type === "link") {
          updateLast((t) => ({ ...t, links: [...(t.links ?? []), { href: event.href, label: event.label }] }));
        } else if (event.type === "error") {
          updateLast((t) => ({ ...t, content: event.error, error: true }));
          speaker?.say(event.error);
        }
      });
    } catch (err) {
      if (controller.signal.aborted) {
        updateLast((t) => (t.content ? t : { ...t, content: "Stopped.", error: true }));
      } else {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        updateLast((t) => ({ ...t, content: message, error: true }));
        speaker?.say(message);
      }
    } finally {
      abortRef.current = null;
      setStatus("idle");
    }
  }

  function startListening() {
    if (statusRef.current !== "idle") return;
    // Talking over Echo cuts it off, like it would a person.
    stopSpeaking();
    setNotice(null);
    setInput("");
    const listener = listen({
      onInterim: (text) => setInput(text),
      onEnd: (text) => {
        listenerRef.current = null;
        setStatus("idle");
        statusRef.current = "idle";
        if (text) send(text, true);
      },
      onError: (code) => setNotice(LISTEN_ERRORS[code]),
    });
    if (!listener) return;
    listenerRef.current = listener;
    setStatus("listening");
  }

  // Stop button: whatever Echo is doing, stop it.
  function stop() {
    listenerRef.current?.abort();
    abortRef.current?.abort();
    stopSpeaking();
  }

  // Browser-only things (saved conversation, voice support) are read on first
  // open: the panel isn't on screen before then, so nothing renders differently
  // on the server.
  function openPanel() {
    if (!loadedRef.current) {
      loadedRef.current = true;
      setTurns(loadTurns());
      setTalkBack(read(() => localStorage, TALK_BACK_KEY) !== "off");
      setVoice({ listen: canListen(), speak: canSpeak() });
    }
    setOpen(true);
  }

  function close() {
    listenerRef.current?.abort();
    stopSpeaking();
    setOpen(false);
  }

  function clear() {
    stop();
    setTurns([]);
    write(() => sessionStorage, STORAGE_KEY, "[]");
  }

  function toggleTalkBack() {
    const next = !talkBack;
    setTalkBack(next);
    write(() => localStorage, TALK_BACK_KEY, next ? "on" : "off");
    if (!next) stopSpeaking();
  }

  const headline =
    face === "listening"
      ? "Listening…"
      : face === "thinking"
        ? "Looking into it…"
        : face === "replying"
          ? "Replying…"
          : face === "speaking"
            ? "Speaking…"
            : "Your guide to the dashboard";

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <section
          role="dialog"
          aria-label="Echo, your guide"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // First Esc hushes Echo; the next one closes it.
            if (speaking || status === "listening") stop();
            else close();
          }}
          className="flex h-[min(600px,calc(100dvh-6rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] bg-raised shadow-[0_0_0_1px_var(--border),0_24px_48px_-12px_rgb(17_17_26/0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
        >
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <Orb face={face} size="sm" />
            <div className="ml-1 min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Echo</h2>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {headline}
              </p>
            </div>
            {turns.length > 0 && (
              <button type="button" onClick={clear} className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                New chat
              </button>
            )}
            {voice.listen && voice.speak && (
              <button
                type="button"
                onClick={toggleTalkBack}
                aria-pressed={talkBack}
                aria-label={talkBack ? "Talk back is on: Echo answers out loud when you speak" : "Talk back is off: Echo answers in text only"}
                title={talkBack ? "Talk back: on" : "Talk back: off"}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {talkBack ? <Volume2Icon className="size-4" /> : <VolumeXIcon className="size-4" />}
              </button>
            )}
            <button type="button" onClick={close} aria-label="Close Echo" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 && (
              <p className="text-sm">
                Hi, I’m Echo. Ask me how anything here works, where to find something, or what to set up next. I’ll point you straight to it.
                {voice.listen && " Type, or tap the mic and just ask."}
              </p>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={cn("flex flex-col gap-2", turn.role === "user" ? "items-end" : "items-start")}>
                {(turn.content || turn.role === "user") && (
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                      turn.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                      turn.error && "text-muted-foreground italic",
                    )}
                  >
                    {turn.content}
                  </p>
                )}
                {turn.role === "assistant" && !turn.content && status === "thinking" && i === turns.length - 1 && <TypingDots />}
                {turn.links?.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--accent),var(--foreground)_6%)]"
                  >
                    {link.label}
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                ))}
              </div>
            ))}
          </div>

          {status === "idle" && !notice && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {notice && (
            <p role="alert" className="mx-4 mb-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              {notice}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t px-3 py-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                // Typing over Echo hushes it too.
                if (speaking) stopSpeaking();
                setInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              readOnly={status === "listening"}
              placeholder={status === "listening" ? "Listening…" : "Ask Echo anything about the dashboard…"}
              aria-label="Message Echo"
              className="max-h-32 min-h-9 flex-1 resize-none rounded-xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            {voice.listen && (status === "idle" || status === "listening") && (
              <button
                type="button"
                onClick={() => (status === "listening" ? listenerRef.current?.stop() : startListening())}
                aria-label={status === "listening" ? "Done talking" : "Talk to Echo"}
                aria-pressed={status === "listening"}
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                  status === "listening" ? "bg-red-600 text-white" : "bg-muted text-foreground hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_8%)]",
                )}
              >
                {status === "listening" && <span aria-hidden className="absolute inset-0 rounded-full bg-red-600/40 motion-safe:animate-ping" />}
                <MicIcon className="relative size-4" />
              </button>
            )}
            {waiting || speaking ? (
              <button type="button" onClick={stop} aria-label="Stop" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <SquareIcon className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || status === "listening"}
                aria-label="Send"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                <ArrowUpIcon className="size-4" />
              </button>
            )}
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-label={open ? "Close Echo" : "Ask Echo for help"}
        aria-expanded={open}
        className="group flex items-center gap-2 rounded-full bg-raised py-1.5 pr-4 pl-1.5 text-sm font-semibold shadow-[0_0_0_1px_var(--border),0_8px_24px_-8px_rgb(17_17_26/0.3)] transition-transform hover:-translate-y-0.5 active:scale-[.97]"
      >
        <Orb face={face} />
        {open ? "Close" : "Ask Echo"}
      </button>
    </div>
  );
}

// Echo's face, so the owner can tell at a glance what it's doing: it breathes
// at rest, glows red-ringed while the mic is on, spins while thinking, pulses
// while replying and bobs while speaking.
function Orb({ face, size = "md" }: { face: Face; size?: "sm" | "md" }) {
  return (
    <span className={cn("relative block shrink-0", size === "md" ? "size-8" : "size-7")} aria-hidden>
      {face === "listening" && <span className="absolute -inset-1 rounded-full ring-2 ring-red-500/70 motion-safe:animate-pulse" />}
      <span
        className={cn(
          "absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#7fe0c2,var(--primary)_60%,#073b30)]",
          face === "idle" && "motion-safe:animate-[echo-breathe_4s_ease-in-out_infinite]",
          face === "listening" && "motion-safe:animate-[echo-breathe_1.2s_ease-in-out_infinite]",
          face === "thinking" && "motion-safe:animate-[spin_1.6s_linear_infinite]",
          face === "replying" && "motion-safe:animate-pulse",
          face === "speaking" && "motion-safe:animate-[echo-speak_0.5s_ease-in-out_infinite]",
        )}
      >
        <span className="absolute top-[22%] left-[24%] size-[26%] rounded-full bg-white/60 blur-[1px]" />
      </span>
    </span>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1 rounded-2xl bg-muted px-3.5 py-3" aria-label="Echo is thinking">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-bounce" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

type StreamEvent = { type: "text"; text: string } | { type: "link"; href: string; label: string } | { type: "error"; error: string };

async function readStream(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, "");
      if (data === "[DONE]") return;
      try {
        onEvent(JSON.parse(data));
      } catch {}
    }
  }
}
