"use client";

import { useEffect } from "react";
import type { Theme } from "./theme";

// Inline scripts don't run on client-side navigation, so this sets the theme
// when entering the dashboard that way, and puts public pages back to light
// when leaving it.
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      document.documentElement.dataset.theme = "light";
    };
  }, [theme]);
  return null;
}
