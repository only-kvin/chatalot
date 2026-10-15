"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightIcon, ArrowUpIcon, SquareIcon, XIcon } from "lucide-react";
import { cn } from "cn";

// Echo, the dashboard's built-in guide: a floating orb that opens a chat
// panel. It knows which page the owner is on and answers from the dashboard
// guide (lib/echo), with buttons that take them to the right page. The
// conversation is kept for this browser tab only.

type EchoLink = { href: string; label: string };
type Turn = { role: "user" | "assistant"; content: string; links?: EchoLink[]; error?: boolean };
type Status = "idle" | "thinking" | "replying";

const STORAGE_KEY = "echo:conversation";
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

function loadTurns(): Turn[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveTurns(turns: Turn[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-40)));
  } catch {}
}

export function EchoAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restored after mount: sessionStorage doesn't exist on the server.
  useEffect(() => setTurns(loadTurns()), []);
  useEffect(() => {
    if (status === "idle") saveTurns(turns);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, status]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const pagePrompt = PAGE_PROMPTS.find(([href]) => pathname === href || pathname.startsWith(href + "/"))?.[1];
  const suggestions = pagePrompt ? [pagePrompt, ...GENERAL_PROMPTS] : GENERAL_PROMPTS;
  const busy = status !== "idle";

  function updateLast(change: (turn: Turn) => Turn) {
    setTurns((all) => [...all.slice(0, -1), change(all[all.length - 1])]);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = [...turns.filter((t) => !t.error), { role: "user" as const, content: message }];
    setTurns([...turns, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setInput("");
    setStatus("thinking");

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
        } else if (event.type === "link") {
          updateLast((t) => ({ ...t, links: [...(t.links ?? []), { href: event.href, label: event.label }] }));
        } else if (event.type === "error") {
          updateLast((t) => ({ ...t, content: event.error, error: true }));
        }
      });
    } catch (err) {
      if (controller.signal.aborted) {
        updateLast((t) => (t.content ? t : { ...t, content: "Stopped.", error: true }));
      } else {
        updateLast((t) => ({ ...t, content: err instanceof Error ? err.message : "Something went wrong.", error: true }));
      }
    } finally {
      abortRef.current = null;
      setStatus("idle");
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clear() {
    stop();
    setTurns([]);
    saveTurns([]);
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <section
          role="dialog"
          aria-label="Echo, your guide"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="flex h-[min(600px,calc(100dvh-6rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] bg-raised shadow-[0_0_0_1px_var(--border),0_24px_48px_-12px_rgb(17_17_26/0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
        >
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <Orb status={status} size="sm" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Echo</h2>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {status === "thinking" ? "Looking into itâ€¦" : status === "replying" ? "Replyingâ€¦" : "Your guide to the dashboard"}
              </p>
            </div>
            {turns.length > 0 && (
              <button type="button" onClick={clear} className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                New chat
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Echo" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm">
                  Hi, I’m Echo. Ask me how anything here works, where to find something, or what to set up next. I’ll point you straight to it.
                </p>
              </div>
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

          {!busy && (
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Ask Echo anything about the dashboardâ€¦"
              aria-label="Message Echo"
              className="max-h-32 min-h-9 flex-1 resize-none rounded-xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            {busy ? (
              <button type="button" onClick={stop} aria-label="Stop" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <SquareIcon className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
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
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Echo" : "Ask Echo for help"}
        aria-expanded={open}
        className="group flex items-center gap-2 rounded-full bg-raised py-1.5 pr-4 pl-1.5 text-sm font-semibold shadow-[0_0_0_1px_var(--border),0_8px_24px_-8px_rgb(17_17_26/0.3)] transition-transform hover:-translate-y-0.5 active:scale-[.97]"
      >
        <Orb status={status} />
        {open ? "Close" : "Ask Echo"}
      </button>
    </div>
  );
}

// Echo's face: it breathes while idle, spins up while thinking and pulses
// while replying, so the owner can tell at a glance what it's doing.
function Orb({ status, size = "md" }: { status: Status; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#7fe0c2,var(--primary)_60%,#073b30)]",
        size === "md" ? "size-8" : "size-7",
        status === "idle" && "motion-safe:animate-[echo-breathe_4s_ease-in-out_infinite]",
        status === "thinking" && "motion-safe:animate-[spin_1.6s_linear_infinite]",
        status === "replying" && "motion-safe:animate-pulse",
      )}
    >
      <span className="absolute top-[22%] left-[24%] size-[26%] rounded-full bg-white/60 blur-[1px]" />
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
