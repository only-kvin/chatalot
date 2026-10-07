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

function vars(t: { primary: string; surface: string; text: string; radius: number; family: string }): string {
  return `
    --ca-primary: ${t.primary};
    --ca-on-primary: ${onColor(t.primary)};
    --ca-surface: ${t.surface};
    --ca-text: ${t.text};
    --ca-muted: color-mix(in srgb, ${t.text} 55%, ${t.surface});
    --ca-line: color-mix(in srgb, ${t.text} 14%, ${t.surface});
    --ca-soft: color-mix(in srgb, ${t.primary} 10%, ${t.surface});
    --ca-radius: ${t.radius}px;
    --ca-font: ${t.family};`;
}

export function themeCss(theme: Theme): string {
  const family = FONTS[theme.font]?.family ?? "inherit";
  const own = { ...theme, family };
  const dark = { ...theme, ...DARK, family };
  if (theme.mode === "dark") return `:host { ${vars(dark)} }`;
  if (theme.mode === "auto") {
    return `:host { ${vars(own)} } @media (prefers-color-scheme: dark) { :host { ${vars(dark)} } }`;
  }
  return `:host { ${vars(own)} }`;
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
