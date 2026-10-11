import { cn } from "cn";

// A marketing page section with the shared heading block. `dark` sections
// use the hero's deep background.
export function Section({
  id,
  eyebrow,
  title,
  intro,
  dark = false,
  className,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  dark?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("scroll-mt-20 py-20 md:py-28", dark && "bg-[#0c1412] text-white", className)}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div data-reveal className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <p className={cn("text-[13px] font-semibold tracking-wide uppercase", dark ? "text-[#5fc7a9]" : "text-link")}>
              {eyebrow}
            </p>
          )}
          <h2
            id={id ? `${id}-title` : undefined}
            className="mt-2 text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance md:text-[42px]"
          >
            {title}
          </h2>
          {intro && (
            <p className={cn("mt-4 text-lg text-pretty", dark ? "text-white/65" : "text-muted-foreground")}>{intro}</p>
          )}
        </div>
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}
