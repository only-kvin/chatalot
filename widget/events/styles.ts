// The events widget's own pieces, on top of the shared booking styles:
// poster cards in a grid, the event page, and the ticket row.
export const EVENTS_CSS = `
.title-row { display: flex; align-items: center; gap: 4px; }
.back { background: transparent; border: none; min-width: 44px; min-height: 44px; border-radius: 999px; font-size: 20px; margin-left: -10px; }
.back:hover { background: var(--ca-soft); }
.event-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.event-card {
  width: 100%; height: 100%; text-align: left; padding: 0; overflow: hidden; display: flex; flex-direction: column;
  border: 1px solid var(--ca-line); border-radius: calc(var(--ca-radius) / 1.4); background: var(--ca-raised);
  box-shadow: 0 1px 2px var(--ca-shade);
  transition: transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s cubic-bezier(.2,.8,.2,1), border-color .2s ease;
}
.event-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--ca-primary) 45%, var(--ca-line)); box-shadow: 0 14px 28px -14px var(--ca-shadow); }
.event-card.is-closed { opacity: .7; }
.card-poster { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: var(--ca-soft); }
.placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  background: linear-gradient(160deg, var(--ca-primary-hi), var(--ca-primary-lo)); color: var(--ca-on-primary);
}
.ph-day { font-size: 40px; font-weight: 700; line-height: 1; }
.ph-month { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; }
.card-body { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px 14px; flex: 1; }
.card-date { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--ca-muted); }
.card-title { font-weight: 700; font-size: 16px; }
.card-summary { font-size: 14px; color: var(--ca-muted); }
.card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 6px; font-weight: 600; font-size: 14px; }
.tag { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--ca-line); color: var(--ca-text); }
.tag.soft { background: var(--ca-soft); }
.detail-poster { width: 100%; max-height: 420px; object-fit: contain; border-radius: calc(var(--ca-radius) / 1.6); background: var(--ca-soft); }
.detail-poster.placeholder { aspect-ratio: 16 / 7; max-height: 200px; }
.description p { margin: 0 0 10px; font-size: 15px; line-height: 1.55; white-space: pre-line; }
.description p:last-child { margin-bottom: 0; }
.signup-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.signup-row .primary { width: auto; flex: 1 1 180px; }
.qty { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; width: 110px; }
.total { font-weight: 700; padding-bottom: 12px; }
@container (max-width: 420px) {
  .event-grid { grid-template-columns: 1fr; }
}
`;
