// Scoped to the widget's shadow root; colours, roundness and font come from
// the --ca-* variables set by shared/theme.ts.
export const SCHEDULE_CSS = `
:host { all: initial; display: block; container-type: inline-size; }
* { box-sizing: border-box; }
.card {
  font-family: var(--ca-font); font-size: 15px; line-height: 1.4;
  color: var(--ca-text); background: var(--ca-surface);
  border: 1px solid var(--ca-line); border-radius: var(--ca-radius);
  padding: 18px; display: flex; flex-direction: column; gap: 16px;
}
button, select, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; }
:focus-visible { outline: 2px solid var(--ca-primary); outline-offset: 2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.muted { color: var(--ca-muted); }

.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.head h2 { margin: 0; font-size: 18px; font-weight: 600; }
.head p { margin: 2px 0 0; font-size: 13px; }
.ghost {
  background: transparent; border: 1px solid var(--ca-line); border-radius: 999px;
  padding: 8px 14px; min-height: 44px; white-space: nowrap;
}
.ghost:hover { background: var(--ca-soft); }

.pickers { display: flex; gap: 10px; flex-wrap: wrap; }
.pickers label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; flex: 1 1 180px; }
select, input, textarea {
  background: var(--ca-surface); border: 1px solid var(--ca-line);
  border-radius: calc(var(--ca-radius) / 2); padding: 10px 12px; min-height: 44px; width: 100%;
}
textarea { resize: vertical; }
[aria-invalid="true"] { border-color: #dc2626; }

.week { display: flex; align-items: center; gap: 4px; touch-action: pan-y; }
.arrow {
  background: transparent; border: none; border-radius: 999px; min-width: 44px; min-height: 44px;
  font-size: 20px; color: var(--ca-text);
}
.arrow:hover:not(:disabled) { background: var(--ca-soft); }
.arrow:disabled { opacity: .3; }
.days { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.day {
  background: transparent; border: none; padding: 2px 0; display: flex; flex-direction: column;
  align-items: center; gap: 4px; min-height: 44px;
}
.day .dow { font-size: 12px; color: var(--ca-muted); text-transform: uppercase; letter-spacing: .03em; }
.day .num {
  width: 40px; height: 40px; border-radius: 999px; display: flex; align-items: center; justify-content: center;
  font-weight: 600; border: 2px solid transparent; transition: background .15s, color .15s;
}
.day:hover:not(:disabled) .num { background: var(--ca-soft); }
.day.today .num { border-color: var(--ca-primary); }
.day[aria-checked="true"] .num { background: var(--ca-primary); color: var(--ca-on-primary); }
.day:disabled .num { color: var(--ca-muted); opacity: .45; font-weight: 400; }
.day.blank { visibility: hidden; }

.month-head { display: flex; align-items: center; justify-content: space-between; }
.month-head span { font-weight: 600; }
.month .days { row-gap: 4px; }
.month .day .num { width: 38px; height: 38px; }
.month .day.other .num { opacity: .35; }

.skeleton .num { background: var(--ca-line); color: transparent; animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .45; } }

.slots { display: flex; flex-direction: column; gap: 12px; }
.slots h3 { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--ca-muted); }
.slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
.slot {
  min-height: 44px; border-radius: calc(var(--ca-radius) / 2); border: 1px solid var(--ca-line);
  background: var(--ca-surface); font-weight: 500;
}
.slot:hover:not(:disabled) { border-color: var(--ca-primary); background: var(--ca-soft); }
.slot:disabled { color: var(--ca-muted); text-decoration: line-through; opacity: .55; }

.summary {
  background: var(--ca-soft); border-radius: calc(var(--ca-radius) / 2); padding: 12px 14px;
  display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0;
}
.summary dt { color: var(--ca-muted); }
.summary dd { margin: 0; font-weight: 500; }
.fields { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 13px; font-weight: 500; }
.req { color: #dc2626; }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; min-height: 44px; }
.check input { width: 20px; height: 20px; min-height: 0; margin: 2px 0 0; flex: none; accent-color: var(--ca-primary); }
.trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }

.primary {
  background: var(--ca-primary); color: var(--ca-on-primary); border: none;
  border-radius: calc(var(--ca-radius) / 2); min-height: 48px; padding: 0 18px; font-weight: 600; width: 100%;
}
.primary:disabled { opacity: .6; }
.link { background: none; border: none; padding: 8px 0; min-height: 44px; color: var(--ca-text); text-decoration: underline; text-align: left; }
.alert { border-radius: calc(var(--ca-radius) / 2); padding: 10px 12px; font-size: 14px; background: #fef2f2; color: #991b1b; }
.note { font-size: 14px; }
.done { text-align: center; align-items: center; }
.done .tick {
  width: 56px; height: 56px; border-radius: 999px; background: var(--ca-primary); color: var(--ca-on-primary);
  display: flex; align-items: center; justify-content: center; font-size: 28px;
}
.done h2 { margin: 0; font-size: 20px; }
.done .summary { text-align: left; width: 100%; }
.actions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.actions a.ghost { color: var(--ca-text); text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; }

/* Floating mode: a launcher bubble and a panel, like the chat. */
.launcher {
  position: fixed; bottom: 20px; right: 20px; z-index: 2147482990;
  background: var(--ca-primary); color: var(--ca-on-primary); border: none; border-radius: 999px;
  min-height: 52px; padding: 0 20px; font-family: var(--ca-font); font-weight: 600; font-size: 15px;
  box-shadow: 0 4px 14px rgba(0,0,0,.2);
}
.float-panel {
  position: fixed; bottom: 84px; right: 20px; width: 400px; max-height: calc(100vh - 110px); overflow-y: auto;
  z-index: 2147482991; box-shadow: 0 8px 30px rgba(0,0,0,.25); border-radius: var(--ca-radius);
}
.float-panel[hidden] { display: none; }
@media (max-width: 640px) {
  .float-panel { inset: 0; width: 100vw; max-height: 100vh; border-radius: 0; }
  .float-panel .card { border-radius: 0; min-height: 100%; }
}

@container (max-width: 480px) {
  .card { padding: 14px; }
  .head { flex-wrap: wrap; }
  .pickers label { flex-basis: 100%; }
  .day .num { width: 36px; height: 36px; }
}
/* Phones: arrows and circles shrink so the week fits; tap height stays 44px. */
@container (max-width: 400px) {
  .week { gap: 0; }
  .arrow { min-width: 32px; }
  .day .num, .month .day .num { width: 32px; height: 32px; font-size: 14px; }
  .day .dow { font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;
