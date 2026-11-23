// Find a Class: filters, the week strip (shared .strip/.day styles from the
// booking widgets), and the day's classes as rows.
export const CLASSES_CSS = `
.head { flex-wrap: wrap; }
.title-row { display: flex; align-items: center; gap: 4px; }
.back { background: transparent; border: none; min-width: 44px; min-height: 44px; border-radius: 999px; font-size: 20px; margin-left: -10px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; }
.filters select { width: auto; min-width: 150px; min-height: 40px; padding: 6px 10px; }
.day-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; padding-bottom: 6px; border-bottom: 1px solid var(--ca-line); }
.day-head strong { font-size: 16px; }
.day-head .muted { font-size: 13px; }
.class-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.class-row {
  display: grid; grid-template-columns: 84px 1fr minmax(0, 160px) 150px; gap: 14px; align-items: start;
  padding: 16px 0; border-bottom: 1px solid var(--ca-line);
}
.class-row.is-closed { opacity: .6; }
.when { display: flex; flex-direction: column; gap: 2px; }
.when strong { font-size: 16px; font-variant-numeric: tabular-nums; }
.when span, .where { font-size: 14px; color: var(--ca-muted); }
.class-title { font-weight: 700; font-size: 16px; }
.who { display: flex; align-items: center; gap: 8px; margin-top: 4px; color: var(--ca-primary); font-weight: 600; font-size: 14px; }
.avatar {
  width: 32px; height: 32px; border-radius: 999px; object-fit: cover; flex: none;
  background: var(--ca-soft); color: var(--ca-text); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
}
.details { background: none; border: none; padding: 4px 0 0; min-height: 32px; font-weight: 600; font-size: 14px; color: var(--ca-primary); text-align: left; }
.desc { margin: 6px 0 0; font-size: 14px; color: var(--ca-muted); white-space: pre-line; }
.act { display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
.book {
  min-height: 44px; border: none; border-radius: calc(var(--ca-radius) / 1.6); font-weight: 600;
  background: var(--ca-text); color: var(--ca-surface);
}
.book:hover { opacity: .9; }
.price { font-size: 13px; color: var(--ca-muted); text-align: center; }
.tag { align-self: center; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--ca-line); }
@container (max-width: 640px) {
  .class-row { grid-template-columns: 70px 1fr; }
  .where { grid-column: 2; margin-top: -8px; }
  .act { grid-column: 1 / -1; flex-direction: row; align-items: center; }
  .act .book { flex: 1; }
}
`;
