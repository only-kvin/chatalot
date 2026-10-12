"use client";

import { useEffect, useRef } from "react";

// The message list, scrolled to the newest message on open and whenever a
// new one arrives (like a messaging app). On phones the page itself scrolls,
// so the end of the list is brought into view instead.
export function ScrollToEnd({ count, className, children }: { count: number; className?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    else end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  return (
    <div ref={box} className={className}>
      {children}
      <div ref={end} />
    </div>
  );
}
