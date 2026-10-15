"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Echo's own cursor: walks the owner through a task on their real screen. It
// glides to each step's element, rings it, and says what to do in a bubble
// beside it. A click step waits for them to click that element; a field step
// waits for "Next" (or for a dropdown or tick box to change). Pages change
// as they go, so each step looks for its element afresh, waiting while the
// next page loads.

export type CursorStep = { target: string; selector: string; action: "click" | "fill"; say: string };
export type Tour = { steps: CursorStep[]; done: string };

type Point = { x: number; y: number };
type Box = { top: number; left: number; width: number; height: number };
type Phase = "seeking" | "pointing" | "missing" | "done";

const SEEK_TIMEOUT_MS = 8000;

// The first visible match: the menu exists twice (mobile strip and desktop
// sidebar), and only one is on screen.
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const box = el.getBoundingClientRect();
    const visible = typeof el.checkVisibility === "function" ? el.checkVisibility() : el.offsetParent !== null;
    if (visible && box.width > 0 && box.height > 0) return el;
  }
  return null;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BUBBLE_WIDTH = 288;
// Roughly its tallest (a two-line step with buttons); only used to keep it on screen.
const BUBBLE_HEIGHT = 130;
const GAP = 22;

// Where the bubble goes: right of the element if there's room, else below,
// else above, else left; always on screen. Before the first element is found
// it waits by the Ask Echo button.
export function placeBubble(anchor: Box | null, viewport: { width: number; height: number }): Point {
  const { width: vw, height: vh } = viewport;
  const clampX = (x: number) => Math.max(8, Math.min(x, vw - BUBBLE_WIDTH - 8));
  const clampY = (y: number) => Math.max(8, Math.min(y, vh - BUBBLE_HEIGHT - 8));
  if (!anchor) return { x: clampX(vw - BUBBLE_WIDTH - 16), y: clampY(vh - BUBBLE_HEIGHT - 72) };

  const right = anchor.left + anchor.width + GAP;
  if (right + BUBBLE_WIDTH <= vw - 8) return { x: right, y: clampY(anchor.top - 4) };
  const below = anchor.top + anchor.height + GAP;
  if (below + BUBBLE_HEIGHT <= vh - 8) return { x: clampX(anchor.left), y: below };
  const above = anchor.top - BUBBLE_HEIGHT - GAP;
  if (above >= 8) return { x: clampX(anchor.left), y: above };
  return { x: clampX(anchor.left - BUBBLE_WIDTH - GAP), y: clampY(anchor.top - 4) };
}

const subscribeNothing = () => () => {};

export function EchoCursor({ tour, onSay, onEnd }: { tour: Tour; onSay(text: string): void; onEnd(): void }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("seeking");
  const [box, setBox] = useState<Box | null>(null);
  // The last element pointed at: the bubble stays by it between steps.
  const [anchor, setAnchor] = useState<Box | null>(null);
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  // Starts by the Ask Echo button, so it visibly comes out of it.
  const [point, setPoint] = useState<Point>(() =>
    typeof window === "undefined" ? { x: 0, y: 0 } : { x: window.innerWidth - 60, y: window.innerHeight - 40 },
  );
  const [attempt, setAttempt] = useState(0);
  const elementRef = useRef<HTMLElement | null>(null);
  const onSayRef = useRef(onSay);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onSayRef.current = onSay;
    onEndRef.current = onEnd;
  });

  const step = tour.steps[index] as CursorStep | undefined;
  const advance = () => {
    elementRef.current = null;
    setBox(null);
    if (index + 1 < tour.steps.length) {
      setIndex(index + 1);
      setPhase("seeking");
    } else {
      setPhase("done");
    }
  };
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });

  // Find this step's element, waiting for it to appear (a page loading after
  // the last click), then bring it into view and follow it while pointing.
  useEffect(() => {
    if (!step || phase === "done") return;
    let cancelled = false;
    let frame = 0;
    let last = "";
    const started = Date.now();

    const follow = () => {
      const el = elementRef.current;
      if (cancelled || !el) return;
      if (!el.isConnected) {
        // Re-rendered or gone (e.g. the form re-mounted): look for it again.
        elementRef.current = null;
        seek();
        return;
      }
      const r = el.getBoundingClientRect();
      // Only re-render when it moved (scrolling, resizing, layout shifts).
      const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (key === last) {
        frame = requestAnimationFrame(follow);
        return;
      }
      last = key;
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      setBox(next);
      setAnchor(next);
      // The tip rests near the bottom-right corner, so the pointer never
      // covers the button's label or the text being typed.
      setPoint({ x: r.right - Math.min(14, r.width / 4), y: r.bottom - Math.min(8, r.height / 4) });
      frame = requestAnimationFrame(follow);
    };

    const seek = () => {
      if (cancelled) return;
      const el = findVisible(step.selector);
      if (el) {
        elementRef.current = el;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
        setPhase("pointing");
        frame = requestAnimationFrame(follow);
        return;
      }
      if (Date.now() - started > SEEK_TIMEOUT_MS) {
        setPhase("missing");
        return;
      }
      window.setTimeout(seek, 150);
    };
    seek();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [step, attempt, phase === "done"]); // eslint-disable-line react-hooks/exhaustive-deps

  // Say each step once it's pointing, and the closing line when done.
  useEffect(() => {
    if (phase === "pointing" && step) onSayRef.current(step.say);
    if (phase === "done") onSayRef.current(tour.done);
  }, [phase, step, tour.done]);

  // Moving on: a click on the target (any match, e.g. any service's Edit), or
  // a change to a dropdown or tick box. Text fields wait for Next.
  useEffect(() => {
    if (phase !== "pointing" || !step) return;
    const onClick = (e: MouseEvent) => {
      if (step.action === "click" && (e.target as Element | null)?.closest?.(step.selector)) {
        // Let the click do its work (open the page, load the form) first.
        window.setTimeout(() => advanceRef.current(), 60);
      }
    };
    const onChange = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (step.action !== "fill" || !el?.closest?.(step.selector)) return;
      if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && ["checkbox", "radio", "color", "date", "time"].includes(el.type))) {
        window.setTimeout(() => advanceRef.current(), 250);
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
    };
  }, [phase, step]);

  // Esc stops the walkthrough; the finished message clears itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEndRef.current();
    document.addEventListener("keydown", onKey);
    const timer = phase === "done" ? window.setTimeout(() => onEndRef.current(), 7000) : 0;
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [phase]);

  const text =
    phase === "done"
      ? tour.done
      : phase === "missing"
        ? "I can't see the next spot on this page. It may be on a different tab, or need something done first."
        : step?.say ?? "";

  // Only in the browser: it measures the page, so there's nothing to render
  // on the server (and nothing to mismatch when hydrating).
  if (!mounted) return null;
  const bubble = placeBubble(anchor, { width: window.innerWidth, height: window.innerHeight });
  const motion = reducedMotion() ? "" : "transition-[transform] duration-700 ease-[cubic-bezier(.22,.9,.24,1)]";

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] print:hidden" aria-live="polite">
      {box && phase === "pointing" && (
        <div
          aria-hidden
          className="absolute rounded-xl ring-2 ring-primary/80 shadow-[0_0_0_6px_rgb(14_92_75/0.15)] motion-safe:animate-pulse"
          style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }}
        />
      )}

      {/* The pointer's tip is at `point`. */}
      <div className={`absolute top-0 left-0 ${motion}`} style={{ transform: `translate(${point.x}px, ${point.y}px)` }}>
        <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden className="-translate-x-[3px] -translate-y-[2px] drop-shadow-[0_3px_6px_rgb(0_0_0/0.3)]">
          <path d="M3 2 L3 24 L9 18.5 L13.5 28 L17.5 26.2 L13 16.8 L21 16.8 Z" fill="var(--primary)" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Beside the ringed element, never over it or what's next to it. */}
      <div className={`absolute top-0 left-0 ${motion}`} style={{ transform: `translate(${bubble.x}px, ${bubble.y}px)` }}>
        <div
          className="pointer-events-auto w-72 rounded-2xl bg-raised p-3.5 text-sm shadow-[0_0_0_1px_var(--border),0_18px_40px_-12px_rgb(17_17_26/0.35)]"
          role="status"
        >
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden className="size-3.5 rounded-full bg-[radial-gradient(circle_at_30%_30%,#7fe0c2,var(--primary)_60%,#073b30)]" />
            <span className="font-semibold text-foreground">Echo</span>
            {phase !== "done" && (
              <span className="ml-auto">
                {Math.min(index + 1, tour.steps.length)} of {tour.steps.length}
              </span>
            )}
          </div>
          <p className="leading-snug">{phase === "seeking" ? "One moment…" : text}</p>
          <div className="mt-2.5 flex items-center gap-2">
            {phase === "pointing" && step?.action === "click" && <span className="text-xs text-muted-foreground">Click it to carry on</span>}
            {phase === "pointing" && step?.action === "fill" && (
              <button type="button" onClick={() => advance()} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Next
              </button>
            )}
            {phase === "missing" && (
              <>
                <button type="button" onClick={() => { setPhase("seeking"); setAttempt((a) => a + 1); }} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Try again
                </button>
                <button type="button" onClick={() => advance()} className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">
                  Skip
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onEnd()}
              className="ml-auto rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {phase === "done" ? "Got it" : "Stop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
