"use client";

import { usePathname } from "next/navigation";

// Remounts on every route change (keyed on pathname) so the page-enter
// animation actually replays per navigation — a Server Component layout
// has no reliable access to the current pathname to key on itself.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter min-w-0 flex-1">
      {children}
    </div>
  );
}
