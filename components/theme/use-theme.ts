import { useSyncExternalStore } from "react";
import { parseTheme, THEME_COOKIE, type Theme } from "./theme";

// Browser-only half of ./theme (server code imports that one).

// The live theme is <html data-theme>, so every switch on the page stays in
// step without a React context.
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

export function useTheme(serverTheme: Theme): { theme: Theme; isDark: boolean } {
  const theme = useSyncExternalStore(
    subscribe,
    () => parseTheme(document.documentElement.dataset.theme),
    () => serverTheme,
  );
  const osDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return { theme, isDark: theme === "dark" || (theme === "system" && osDark) };
}
