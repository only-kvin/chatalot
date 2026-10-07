// "chatalot:event" for conversion stats: view, step, submitted. Sent as a
// DOM event from the widget's element (bubbles out of the shadow root) and
// as a window message, so a site's analytics can listen either way. Never
// carries customer details.

export type WidgetEvent = { widget: string; action: "view" | "step" | "submitted"; step?: string };

export function emit(el: HTMLElement, event: WidgetEvent): void {
  el.dispatchEvent(new CustomEvent("chatalot:event", { detail: event, bubbles: true, composed: true }));
  window.postMessage({ type: "chatalot:event", ...event }, window.location.origin);
}
