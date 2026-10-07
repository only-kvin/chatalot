import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "./theme";
import { ThemeSync } from "./theme-sync";

// Applies the signed-in user's saved theme for the dashboard and admin areas.
// The root layout renders data-theme="light" (public pages — booking links,
// the hosted booking page — always use the light theme); this inline script
// swaps it before the first paint, and ThemeSync keeps it right across
// client-side navigation.
export async function ThemeScript() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <>
      <script
        // A fixed string built from a parsed enum value, never user text.
        dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)}` }}
      />
      <ThemeSync theme={theme} />
    </>
  );
}
