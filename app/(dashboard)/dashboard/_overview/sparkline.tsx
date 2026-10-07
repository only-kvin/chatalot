// A tiny trend line for the key-number cards. Values are plotted left to
// right, scaled to the card's 96×32 box; a flat series sits mid-height.
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const points = values
    .map((v, i) => {
      const x = 2 + (i * 92) / (values.length - 1);
      const y = span === 0 ? 16 : 28 - ((v - min) / span) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width="96" height="32" viewBox="0 0 96 32" fill="none" aria-hidden className={className}>
      <polyline points={points} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
