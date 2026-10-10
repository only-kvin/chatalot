import Link from "next/link";
import { cn } from "cn";

// "All / Urgent" chips above Conversations and Leads.
export function UrgentFilter({ base, urgentOnly }: { base: string; urgentOnly: boolean }) {
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1",
      active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground",
    );
  return (
    <nav className="mb-4 flex gap-2 text-sm" aria-label="Filter">
      <Link href={base} aria-current={!urgentOnly ? "page" : undefined} className={chip(!urgentOnly)}>
        All
      </Link>
      <Link href={`${base}?filter=urgent`} aria-current={urgentOnly ? "page" : undefined} className={chip(urgentOnly)}>
        Urgent
      </Link>
    </nav>
  );
}
