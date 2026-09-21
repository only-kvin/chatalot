import { createWidget, type WidgetApi } from "./panel";

declare global {
  interface Window {
    AIReceptionist?: WidgetApi;
  }
}

function getScriptTag(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current) return current;
  // Fallback for browsers/loaders where currentScript isn't available by the
  // time this runs (e.g. deferred execution) — find our own tag by data-key.
  return document.querySelector("script[data-key]");
}

async function init() {
  const script = getScriptTag();
  const key = script?.getAttribute("data-key");
  if (!key) {
    console.error("[ChatAlot] widget.js: missing data-key attribute on script tag");
    return;
  }

  const apiOrigin = new URL(script!.src).origin;

  try {
    const res = await fetch(`${apiOrigin}/api/widget/config?key=${encodeURIComponent(key)}`);
    if (!res.ok) {
      console.error("[ChatAlot] widget.js: failed to load config", res.status);
      return;
    }
    const config = await res.json();
    window.AIReceptionist = createWidget(config, apiOrigin, key);
  } catch (err) {
    console.error("[ChatAlot] widget.js: failed to initialize", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
