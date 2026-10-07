// The dashboard's appearance choice. It's kept in a cookie (not localStorage)
// so the server can render the right theme straight away, with no flash.
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "light";
}
