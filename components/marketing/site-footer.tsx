import Link from "next/link";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { FOOTER_COLUMNS } from "@/lib/marketing/nav";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{BRAND_TAGLINE}</p>
          <Link href="/login" className="text-sm font-medium text-link hover:underline">
            Staff sign in
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-4">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
              <p className="text-[13px] font-semibold">{col.title}</p>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground md:px-6">
          © {new Date().getFullYear()} {BRAND_NAME}. Made in South Africa.
        </p>
      </div>
    </footer>
  );
}
