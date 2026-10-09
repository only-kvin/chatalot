// A clearly marked gap for content we don't have yet ("[CUSTOMER QUOTE]",
// "[LEGAL REVIEW]"). Visible in development so nobody forgets it; renders
// nothing in production builds, so a placeholder never reaches customers.
export function Placeholder({ label }: { label: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <span className="mx-1 inline-block rounded-md border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-800">
      [{label}]
    </span>
  );
}
