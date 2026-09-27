import Link from "next/link";
import { LEGAL } from "@/lib/legal";

// Plain reading layout for the public policy pages; no sign-in needed.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-12 dark:bg-black">
      <article className="mx-auto flex max-w-2xl flex-col gap-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-zinc-900 dark:[&_h1]:text-zinc-50 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-50 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:underline">
        {children}
        <footer className="mt-8 border-t pt-4 text-xs text-zinc-500">
          {LEGAL.operator} · Last updated {LEGAL.lastUpdated} ·{" "}
          <Link href="/privacy">Privacy policy</Link> ·{" "}
          <Link href="/data-deletion">Delete your data</Link>
        </footer>
      </article>
    </div>
  );
}
