import { cn } from "cn";
import { BRAND_NAME, BRAND_URL } from "@/lib/brand";
import { BrandSymbol } from "@/components/brand/symbol";

// The frame for pages customers open from a link: the booking page, their
// booking, their own page. The business is the subject, so ours is only the
// quiet "Powered by" line at the foot, as on the widgets.
// `powered={false}` where a widget on the page already shows the line.
export function PublicShell({
  children,
  width = "md",
  powered = true,
}: {
  children: React.ReactNode;
  width?: "md" | "lg";
  powered?: boolean;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-background px-4 pt-10 pb-8 text-foreground sm:pt-14">
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-4",
          width === "lg" ? "max-w-xl" : "max-w-lg",
        )}
      >
        {children}
      </div>
      {powered && (
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <a
            href={`${BRAND_URL}/?ref=page`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 align-bottom font-semibold hover:text-foreground"
          >
            <BrandSymbol className="size-3.5 opacity-70 grayscale" />
            {BRAND_NAME.toLowerCase()}
          </a>
        </p>
      )}
    </main>
  );
}

export function PublicCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-5 text-sm shadow-raised sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
