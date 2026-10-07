// The business's look as CSS custom properties on the widget's shadow root,
// so nothing about colours or shape is hard-coded in the bundle.

export type Theme = {
  primary: string;
  surface: string;
  text: string;
  radius: number;
  font: "system" | "inter" | "poppins" | "lora" | "nunito";
  mode: "light" | "dark" | "auto";
};

const FONTS: Record<Theme["font"], { family: string; google?: string }> = {
  system: { family: "inherit" },
  inter: { family: "'Inter', sans-serif", google: "Inter:wght@400;500;600" },
  poppins: { family: "'Poppins', sans-serif", google: "Poppins:wght@400;500;600" },
  nunito: { family: "'Nunito', sans-serif", google: "Nunito:wght@400;600;700" },
  lora: { family: "'Lora', serif", google: "Lora:wght@400;500;600" },
};

// Black or white, whichever reads better on the main colour.
export function onColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return luminance > 0.45 ? "#18181b" : "#ffffff";
}

const DARK = { surface: "#18181b", text: "#fafafa" };

// Besides the business's own colours, a few derived ones give the widgets
// the dashboard's depth: a top-lit gradient on buttons, a coloured glow
// under them, and soft layered shadows that are darker on dark themes.
function vars(t: { primary: string; surface: string; text: string; radius: number; family: string }, dark: boolean): string {
  return `
    --ca-primary: ${t.primary};
    --ca-on-primary: ${onColor(t.primary)};
    --ca-primary-hi: color-mix(in srgb, ${t.primary} 84%, #fff);
    --ca-primary-lo: color-mix(in srgb, ${t.primary} 86%, #000);
    --ca-glow: color-mix(in srgb, ${t.primary} 45%, transparent);
    --ca-surface: ${t.surface};
    --ca-surface-2: color-mix(in srgb, ${t.text} 2.5%, ${t.surface});
    --ca-raised: ${dark ? `color-mix(in srgb, #fff 6%, ${t.surface})` : t.surface};
    --ca-text: ${t.text};
    --ca-muted: color-mix(in srgb, ${t.text} 55%, ${t.surface});
    --ca-line: color-mix(in srgb, ${t.text} 12%, ${t.surface});
    --ca-soft: color-mix(in srgb, ${t.primary} 10%, ${t.surface});
    --ca-hi: ${dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.9)"};
    --ca-shadow: ${dark ? "rgba(0,0,0,.5)" : "rgba(17,17,26,.12)"};
    --ca-shade: ${dark ? "rgba(255,255,255,.06)" : "rgba(17,17,26,.05)"};
    --ca-radius: ${t.radius}px;
    --ca-font: ${t.family};`;
}

export function themeCss(theme: Theme): string {
  const family = FONTS[theme.font]?.family ?? "inherit";
  const own = { ...theme, family };
  const dark = { ...theme, ...DARK, family };
  if (theme.mode === "dark") return `:host { ${vars(dark, true)} }`;
  if (theme.mode === "auto") {
    return `:host { ${vars(own, false)} } @media (prefers-color-scheme: dark) { :host { ${vars(dark, true)} } }`;
  }
  return `:host { ${vars(own, false)} }`;
}

// Web fonts must be declared in the page itself (not the shadow root).
export function loadFont(font: Theme["font"]): void {
  const google = FONTS[font]?.google;
  if (!google || document.querySelector(`link[data-chatalot-font="${font}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${google}&display=swap`;
  link.dataset.chatalotFont = font;
  document.head.appendChild(link);
}
