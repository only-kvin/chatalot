import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "./theme";
import { ThemeSync } from "./theme-sync";

// The signed-in user's saved theme for the dashboard and admin areas. A full
// page load already has it (THEME_BOOT in app/layout.tsx runs before paint);
// ThemeSync applies it on client-side navigation into these areas, and puts
// public pages back to light on the way out.
export async function ThemeScript() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <ThemeSync theme={theme} />;
}
