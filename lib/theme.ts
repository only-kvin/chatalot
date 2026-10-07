// Light / dark / system appearance for the dashboard. The choice lives in
// localStorage (per device). THEME_INIT_SCRIPT applies it before first paint
// on full page loads; applyTheme handles changes and client-side navigation.

export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Only the signed-in app is themed. Public pages (booking links, legal pages,
// login) and the widget preview always stay light.
const THEMED_PATH = /^\/(dashboard|admin)(\/|$)/;

export function isThemedPath(pathname: string): boolean {
  return THEMED_PATH.test(pathname) && !pathname.startsWith("/dashboard/widget/preview");
}

// Runs inline in <head>; keep it dependency-free and in sync with applyTheme.
export const THEME_INIT_SCRIPT = `(function(){try{var p=location.pathname;if(!/^\\/(dashboard|admin)(\\/|$)/.test(p)||p.indexOf("/dashboard/widget/preview")===0)return;var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark")t="system";var d=t==="dark"||(t==="system"&&matchMedia("${DARK_QUERY}").matches);var e=document.documentElement;e.setAttribute("data-theme-pref",t);if(d)e.classList.add("dark")}catch(_){}})()`;

export function readThemePref(): ThemePref {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

export function applyTheme(pref: ThemePref, { animate = false } = {}) {
  const root = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (animate && !reduceMotion) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 400);
  }
  root.setAttribute("data-theme-pref", pref);
  root.classList.toggle("dark", dark);
}

export function clearTheme() {
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-theme-pref");
}

// Tiny store so every switcher on the page stays in sync.
const listeners = new Set<() => void>();

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Storage blocked (private mode): the choice still applies for this visit.
  }
  applyTheme(pref, { animate: true });
  listeners.forEach((fn) => fn());
}

export function subscribeThemePref(fn: () => void) {
  listeners.add(fn);
  const media = window.matchMedia(DARK_QUERY);
  // Follow the OS live while on "system".
  const onSystemChange = () => {
    if (readThemePref() === "system") applyTheme("system", { animate: true });
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      applyTheme(readThemePref(), { animate: true });
      fn();
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
