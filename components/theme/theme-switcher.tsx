"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import type { Theme } from "./theme";
import { setTheme, useTheme } from "./use-theme";

const OPTIONS = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "Auto", icon: <MonitorIcon /> },
] as const;

export function ThemeSwitcher({ serverTheme }: { serverTheme: Theme }) {
  const { theme } = useTheme(serverTheme);
  return <SegmentedControl aria-label="Appearance" options={OPTIONS} value={theme} onChange={setTheme} />;
}

// One-tap light/dark flip, for page headers.
export function ThemeFlipButton({ serverTheme }: { serverTheme: Theme }) {
  const { isDark } = useTheme(serverTheme);
  return (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
