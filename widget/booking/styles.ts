// Scoped to the widget's shadow root; colours, roundness and font come from
// the --ca-* variables set by shared/theme.ts. The look follows the ChatAlot
// dashboard: layered soft shadows, top-lit gradient buttons that dip when
// pressed, shimmering placeholders and gentle staggered entrances.
export const BOOKING_CSS = `
:host { all: initial; display: block; container-type: inline-size; }
* { box-sizing: border-box; }
.card {
  font-family: var(--ca-font); font-size: 15px; line-height: 1.4;
  color: var(--ca-text); background: linear-gradient(180deg, var(--ca-surface), var(--ca-surface-2));
  border: 1px solid var(--ca-line); border-radius: var(--ca-radius);
  box-shadow: 0 1px 0 var(--ca-hi) inset, 0 1px 2px var(--ca-shade), 0 8px 24px -12px var(--ca-shadow), 0 24px 48px -32px var(--ca-glow);
  padding: 20px; display: flex; flex-direction: column; gap: 16px;
}
button, select, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; transition: transform .12s ease, box-shadow .2s ease, background-color .2s ease, color .2s ease; }
button:active:not(:disabled) { transform: scale(.97); }
button:disabled { cursor: default; }
:focus-visible { outline: 2px solid var(--ca-primary); outline-offset: 2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.muted { color: var(--ca-muted); }
.in { animation: up .45s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i, 0) * 40ms); }
/* "translate", not "transform", so the held end state doesn't cancel hover lifts. */
@keyframes up { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: none; } }

.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.head h2 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -.015em; }
.head p { margin: 2px 0 0; font-size: 13px; }
.ghost {
  background: var(--ca-raised); border: none; border-radius: 999px; color: var(--ca-text);
  box-shadow: 0 0 0 1px var(--ca-line), 0 1px 2px var(--ca-shade);
  padding: 8px 16px; min-height: 44px; white-space: nowrap; font-weight: 600;
}
.ghost:hover { background: var(--ca-soft); }

.pickers { display: flex; gap: 10px; flex-wrap: wrap; }
.pickers label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; flex: 1 1 180px; }
select, input, textarea {
  background: var(--ca-raised); border: 1px solid var(--ca-line);
  border-radius: calc(var(--ca-radius) / 1.6); padding: 10px 12px; min-height: 44px; width: 100%;
  transition: border-color .2s ease, box-shadow .2s ease;
}
select:focus, input:focus, textarea:focus { outline: none; border-color: var(--ca-primary); box-shadow: 0 0 0 4px var(--ca-soft); }
textarea { resize: vertical; }
[aria-invalid="true"] { border-color: #dc2626; }

/* Date and time: the month calendar, with the chosen day's times beside it
   (below it on narrow widgets). */
.picker { display: grid; gap: 18px; }
@container (min-width: 600px) { .picker { grid-template-columns: minmax(270px, 1.05fr) 1fr; align-items: start; } }
.cal {
  background: var(--ca-raised); border-radius: calc(var(--ca-radius) / 1.2); padding: 10px 10px 12px;
  box-shadow: 0 0 0 1px var(--ca-line), 0 1px 2px var(--ca-shade); touch-action: pan-y;
}
.cal-head { display: flex; align-items: center; justify-content: space-between; padding: 0 2px 6px; }
.cal-head span { font-weight: 700; letter-spacing: -.01em; }
.arrow {
  background: transparent; border: none; border-radius: 999px; min-width: 40px; min-height: 40px;
  font-size: 20px; color: var(--ca-text);
}
.arrow:hover:not(:disabled) { background: var(--ca-soft); }
.arrow:disabled { opacity: .3; }
.dows, .days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.dows span { text-align: center; font-size: 11px; font-weight: 600; color: var(--ca-muted); text-transform: uppercase; letter-spacing: .04em; padding: 4px 0; }
.days { row-gap: 2px; }
.day {
  background: transparent; border: none; padding: 0; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
}
.day .num {
  position: relative; overflow: hidden; width: 38px; height: 38px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; font-weight: 600; font-variant-numeric: tabular-nums;
  transition: background-color .2s ease, color .2s ease, transform .35s cubic-bezier(.34,1.4,.64,1), box-shadow .2s ease;
}
/* A dot under days with free times. */
.day.free .num::after { content: ""; position: absolute; bottom: 4px; width: 4px; height: 4px; border-radius: 999px; background: var(--ca-primary); }
.day:hover:not(:disabled) .num { background: var(--ca-soft); }
.day.today .num { box-shadow: inset 0 0 0 1.5px var(--ca-primary); }
.day[aria-checked="true"] .num {
  background: linear-gradient(180deg, var(--ca-primary-hi), var(--ca-primary-lo)); color: var(--ca-on-primary);
  box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 6px 14px -6px var(--ca-glow); transform: scale(1.06);
}
.day[aria-checked="true"] .num::after { background: var(--ca-on-primary); }
.day:disabled .num { color: var(--ca-muted); opacity: .45; font-weight: 400; }
.day.blank { visibility: hidden; }
.day:active:not(:disabled) { transform: none; }
.day:active:not(:disabled) .num { transform: scale(.92); }

/* Loading: shapes of the real thing, with a light sweeping across. */
.day.skeleton .num { background: var(--ca-line); color: transparent; }
.skeleton .num::before, .shimmer::before {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--ca-hi), transparent); animation: shimmer 1.4s ease-in-out infinite;
}
.shimmer { position: relative; overflow: hidden; background: var(--ca-line); border-radius: calc(var(--ca-radius) / 1.6); height: 44px; }
@keyframes shimmer { to { transform: translateX(100%); } }

.times { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.times-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.times-head strong { font-size: 15px; letter-spacing: -.01em; }
.chip {
  display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; white-space: nowrap;
  font-size: 12px; font-weight: 600; background: var(--ca-soft); color: var(--ca-text);
}
.slots { display: flex; flex-direction: column; gap: 12px; }
.slots h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--ca-muted); text-transform: uppercase; letter-spacing: .05em; }
.slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px; }
.slot-grid.wide { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); }
.slot {
  min-height: 44px; border-radius: calc(var(--ca-radius) / 1.6); border: none; font-weight: 600; font-variant-numeric: tabular-nums;
  background: var(--ca-raised); box-shadow: 0 0 0 1px var(--ca-line), 0 1px 2px var(--ca-shade);
}
.slot:hover:not(:disabled) { background: var(--ca-soft); box-shadow: 0 0 0 1.5px var(--ca-primary), 0 6px 14px -8px var(--ca-glow); transform: translateY(-1px); }
.slot:active:not(:disabled) { transform: scale(.97); }
.slot:disabled { color: var(--ca-muted); text-decoration: line-through; opacity: .5; box-shadow: 0 0 0 1px var(--ca-line); background: transparent; }

.summary {
  background: var(--ca-soft); border-radius: calc(var(--ca-radius) / 1.6); padding: 12px 14px;
  display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0;
}
.summary dt { color: var(--ca-muted); }
.summary dd { margin: 0; font-weight: 600; }
form { display: flex; flex-direction: column; gap: 16px; margin: 0; }
.fields { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; font-weight: 500; }
.req { color: #dc2626; }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; min-height: 44px; }
.check input { width: 20px; height: 20px; min-height: 0; margin: 2px 0 0; flex: none; accent-color: var(--ca-primary); box-shadow: none; }
fieldset.address { border: none; padding: 0; margin: 0; min-width: 0; }
fieldset.address legend { font-weight: 600; font-size: 14px; padding: 0; margin-bottom: 8px; }
.trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }

.primary {
  background: linear-gradient(180deg, var(--ca-primary-hi), var(--ca-primary-lo)); color: var(--ca-on-primary); border: none;
  box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 6px 16px -6px var(--ca-glow);
  border-radius: calc(var(--ca-radius) / 1.6); min-height: 48px; padding: 0 18px; font-weight: 600; width: 100%;
}
.primary:hover:not(:disabled) { box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 10px 22px -6px var(--ca-glow); }
.primary:disabled { opacity: .6; }
.link { background: none; border: none; padding: 8px 0; min-height: 44px; color: var(--ca-text); text-decoration: underline; text-align: left; }
.alert { border-radius: calc(var(--ca-radius) / 1.6); padding: 10px 12px; font-size: 14px; background: #fef3f2; color: #b42318; animation: up .3s ease both; }
.note { font-size: 14px; margin: 0; }
.done { text-align: center; align-items: center; }
.done .tick {
  width: 60px; height: 60px; border-radius: 999px; color: var(--ca-on-primary);
  background: linear-gradient(180deg, var(--ca-primary-hi), var(--ca-primary-lo));
  box-shadow: 0 1px 0 rgba(255,255,255,.3) inset, 0 10px 24px -8px var(--ca-glow);
  display: flex; align-items: center; justify-content: center; font-size: 28px;
  animation: pop .5s cubic-bezier(.34,1.56,.64,1) both;
}
@keyframes pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
.done h2 { margin: 0; font-size: 21px; letter-spacing: -.015em; }
.done .summary { text-align: left; width: 100%; }
.actions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.actions a.ghost { color: var(--ca-text); text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; }

/* Floating mode: a launcher bubble and a panel, like the chat. */
.launcher {
  position: fixed; bottom: 20px; right: 20px; z-index: 2147482990;
  background: linear-gradient(180deg, var(--ca-primary-hi), var(--ca-primary-lo)); color: var(--ca-on-primary); border: none; border-radius: 999px;
  min-height: 52px; padding: 0 22px; font-family: var(--ca-font); font-weight: 600; font-size: 15px;
  box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 10px 24px -8px var(--ca-glow), 0 4px 12px rgba(0,0,0,.12);
}
.launcher:hover { transform: translateY(-2px); }
.launcher:active { transform: scale(.96); }
.float-panel {
  position: fixed; bottom: 84px; right: 20px; width: 420px; max-height: calc(100vh - 110px); overflow-y: auto;
  z-index: 2147482991; border-radius: var(--ca-radius); transform-origin: bottom right;
  animation: open .28s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes open { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
.float-panel .card { box-shadow: 0 1px 0 var(--ca-hi) inset, 0 24px 60px -12px rgba(0,0,0,.35); }
.float-panel[hidden] { display: none; }
@media (max-width: 640px) {
  .float-panel { inset: 0; width: 100vw; max-height: 100vh; border-radius: 0; }
  .float-panel .card { border-radius: 0; min-height: 100%; }
}

@container (max-width: 480px) {
  .card { padding: 16px; }
  .head { flex-wrap: wrap; }
  .pickers label { flex-basis: 100%; }
}
/* Phones: circles shrink so the month fits; tap height stays 44px. */
@container (max-width: 360px) {
  .cal { padding: 8px 4px 10px; }
  .day .num { width: 34px; height: 34px; font-size: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;

// The appointment widget's extra pieces: a step indicator, service cards,
// and the staff list.
export const APPOINTMENT_CSS = `
.stepper { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ca-muted); }
.stepper ol { display: flex; gap: 6px; list-style: none; margin: 0; padding: 0; }
.stepper li { width: 8px; height: 8px; border-radius: 999px; background: var(--ca-line); transition: width .35s cubic-bezier(.34,1.4,.64,1), background-color .2s ease; }
.stepper li[aria-current="step"] { background: var(--ca-primary); width: 20px; }
.stepper li.done { background: color-mix(in srgb, var(--ca-primary) 45%, var(--ca-surface)); }
.back { background: transparent; border: none; min-width: 44px; min-height: 44px; border-radius: 999px; font-size: 20px; margin-left: -10px; }
.back:hover { background: var(--ca-soft); }
.title-row { display: flex; align-items: center; gap: 4px; }
.search { margin-bottom: 4px; }
.group h3 { margin: 4px 0 8px; font-size: 12px; font-weight: 600; color: var(--ca-muted); text-transform: uppercase; letter-spacing: .05em; }
.list { display: flex; flex-direction: column; gap: 10px; list-style: none; margin: 0; padding: 0; }
/* Service and staff cards lift toward you on hover, like the dashboard's. */
.item {
  display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--ca-line);
  border-radius: calc(var(--ca-radius) / 1.5); background: var(--ca-raised); box-shadow: 0 1px 2px var(--ca-shade);
  transition: transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s cubic-bezier(.2,.8,.2,1), border-color .2s ease;
}
.item:hover {
  border-color: color-mix(in srgb, var(--ca-primary) 45%, var(--ca-line)); transform: translateY(-2px);
  box-shadow: 0 14px 28px -14px var(--ca-shadow), 0 20px 40px -28px var(--ca-glow);
}
.item .body { flex: 1; min-width: 0; }
.item .name { font-weight: 600; }
.item .desc { font-size: 14px; color: var(--ca-muted); margin-top: 2px; }
.item .meta { font-size: 13px; color: var(--ca-muted); margin-top: 4px; }
.item .pick {
  background: linear-gradient(180deg, var(--ca-primary-hi), var(--ca-primary-lo)); color: var(--ca-on-primary); border: none; border-radius: 999px;
  box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 6px 14px -6px var(--ca-glow);
  min-height: 44px; padding: 0 18px; font-weight: 600; flex: none;
}
.avatar {
  width: 48px; height: 48px; border-radius: 999px; flex: none; object-fit: cover;
  background: var(--ca-soft); color: var(--ca-text); display: flex; align-items: center; justify-content: center; font-weight: 600;
}
.empty { color: var(--ca-muted); font-size: 14px; }
@container (max-width: 400px) {
  .item { padding: 12px; gap: 10px; }
  .item .pick { padding: 0 14px; }
  .avatar { width: 40px; height: 40px; }
}
`;
