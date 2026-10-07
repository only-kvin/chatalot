import { createWidget, type WidgetApi } from "./panel";
import { registeredWidget } from "./shared/loader-contract";

// widget.js: the one script a business adds to its site. It starts the chat
// (unless data-chat="off") and mounts every inline widget on the page,
// <div data-chatalot="schedule">, loading each widget's own bundle only
// when the page has one.

declare global {
  interface Window {
    AIReceptionist?: WidgetApi;
    // For sites that add widget <div>s after the page loads.
    ChatAlot?: { scan: () => void };
  }
}

const WIDGETS = ["schedule", "appointment", "reschedule", "contact"];

function getScriptTag(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current) return current;
  // Fallback for browsers/loaders where currentScript isn't available by the
  // time this runs (e.g. deferred execution) — find our own tag by data-key.
  return document.querySelector("script[data-key]");
}

// Captured now: currentScript is only set while this file first runs.
const script = getScriptTag();

async function startChat(key: string, apiOrigin: string) {
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

const loading = new Map<string, Promise<void>>();

// Loads a widget's bundle once, however many of its <div>s the page has.
function loadBundle(name: string, apiOrigin: string): Promise<void> {
  let promise = loading.get(name);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = `${apiOrigin}/widgets/${name}.js`;
      tag.async = true;
      tag.onload = () => resolve();
      tag.onerror = () => reject(new Error(`failed to load ${name}`));
      document.head.appendChild(tag);
    });
    loading.set(name, promise);
  }
  return promise;
}

function scan(key: string, apiOrigin: string) {
  const els = document.querySelectorAll<HTMLElement>("[data-chatalot]:not([data-chatalot-mounted])");
  for (const el of els) {
    const name = el.dataset.chatalot ?? "";
    if (!WIDGETS.includes(name)) {
      console.error(`[ChatAlot] unknown widget "${name}"`);
      continue;
    }
    el.dataset.chatalotMounted = "";
    const mode = el.dataset.mode === "float" ? "float" : "inline";
    loadBundle(name, apiOrigin)
      .then(() => registeredWidget(name)?.(el, { key, apiOrigin, mode }))
      .catch((err) => console.error("[ChatAlot]", err));
  }
}

function init() {
  const key = script?.getAttribute("data-key");
  if (!key) {
    console.error("[ChatAlot] widget.js: missing data-key attribute on script tag");
    return;
  }
  const apiOrigin = new URL(script!.src).origin;

  if (script!.getAttribute("data-chat") !== "off") startChat(key, apiOrigin);
  scan(key, apiOrigin);
  window.ChatAlot = { scan: () => scan(key, apiOrigin) };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
