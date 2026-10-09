import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `${BRAND_NAME}Bot`,
  description: `What ${BRAND_NAME}Bot is, why it visits your website, and how to block it.`,
  alternates: { canonical: "/bot" },
};

// Linked from the crawler's user agent: ChatAlotBot/1.0 (+<site>/bot).
export default function BotPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 leading-relaxed text-muted-foreground md:py-24 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-[-0.02em] [&_h1]:text-foreground [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-foreground">
      <h1>{BRAND_NAME}Bot</h1>
      <p>
        {BRAND_NAME}Bot reads a business&apos;s website so its {BRAND_NAME} AI receptionist can answer customers&apos;
        questions from it. It only visits a website when that business has listed the site as its own in {BRAND_NAME}
        and asked for it to be imported, and then about once a week to keep the information current.
      </p>

      <h2>What it does</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Identifies itself as <code>ChatAlotBot/1.0</code> with a link to this page.</li>
        <li>Follows your robots.txt.</li>
        <li>Reads at most 50 pages per site, two at a time, and only ordinary web pages.</li>
        <li>Skips login, account, cart, checkout and admin areas.</li>
      </ul>

      <h2>How to block it</h2>
      <p>Add this to your website&apos;s robots.txt:</p>
      <pre className="overflow-x-auto rounded-xl bg-[#0f0f1a] p-4 font-mono text-[13px] text-indigo-100">
        {"User-agent: ChatAlotBot\nDisallow: /"}
      </pre>

      <h2>Questions</h2>
      <p>
        Email us at{" "}
        <a href={`mailto:${LEGAL.contactEmail}`} className="text-link underline">
          {LEGAL.contactEmail}
        </a>
        .
      </p>
    </article>
  );
}
