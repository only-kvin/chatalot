// The dashboard's appearance choice. It's kept in a cookie (not localStorage)
// so the server can render the right theme straight away, with no flash.
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "light";
}

// Runs before first paint on every full page load (app/layout.tsx): applies
// the saved theme on dashboard and admin pages only — public pages (booking
// links, the hosted booking page) always stay light. Client-side navigation
// is handled by ThemeSync.
export const THEME_BOOT = `(function(){try{var a=location.pathname.split("/")[1];if(a!=="dashboard"&&a!=="admin")return;var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);if(m)document.documentElement.dataset.theme=m[1];}catch(e){}})();`;
