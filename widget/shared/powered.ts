import { BRAND_NAME, BRAND_URL } from "../../lib/brand";

// The small "Powered by <brand>" line at the foot of every widget. The name
// and link come from lib/brand.ts at build time, so a rename only needs that
// file changed and the widgets rebuilt (which every deploy does).
// One place on purpose: a plan that hides it later only has to skip this.

const SVG_NS = "http://www.w3.org/2000/svg";

// The brand symbol (doorway with a crescent moon), in the line's grey so it
// sits quietly next to any business's colour.
function symbol(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  const shape = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  shape("rect", { width: "32", height: "32", rx: "8", fill: "currentColor" });
  shape("path", { d: "M10 24V15a6 6 0 0 1 12 0v9z", fill: "var(--ca-surface, #fff)" });
  shape("circle", { cx: "21.5", cy: "10.5", r: "4.6", fill: "currentColor" });
  return svg;
}

export function poweredBy(): HTMLElement {
  const p = document.createElement("p");
  p.className = "powered";
  const a = document.createElement("a");
  a.href = `${BRAND_URL}/?ref=widget`;
  a.target = "_blank";
  a.rel = "noopener";
  a.append(symbol(), BRAND_NAME.toLowerCase());
  p.append("Powered by ", a);
  return p;
}

// Quiet on purpose: small and grey. The booking widgets pass their own muted
// text and surface colours (light or dark theme); the chat panel has neither,
// so it falls back to the brand grey, which passes WCAG AA on white.
export const POWERED_CSS = `
.powered { margin: 0; padding: 6px 0 2px; text-align: center; font-size: 11px; line-height: 1.3; color: var(--ca-muted, #5a6662); letter-spacing: .01em; }
.powered a { color: inherit; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; vertical-align: bottom; }
.powered a svg { width: 11px; height: 11px; }
.powered a:hover { color: var(--ca-text, #13201c); text-decoration: underline; }
`;
