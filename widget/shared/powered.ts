import { BRAND_NAME, BRAND_URL } from "../../lib/brand";

// The small "Powered by <brand>" line at the foot of every widget. The name
// and link come from lib/brand.ts at build time, so a rename only needs that
// file changed and the widgets rebuilt (which every deploy does).
// One place on purpose: a plan that hides it later only has to skip this.

export function poweredBy(): HTMLElement {
  const p = document.createElement("p");
  p.className = "powered";
  const a = document.createElement("a");
  a.href = `${BRAND_URL}/?ref=widget`;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = BRAND_NAME;
  p.append("Powered by ", a);
  return p;
}

// Quiet on purpose: small, grey, no logo. Colours are given in full so it
// reads on both the chat panel and the booking card.
export const POWERED_CSS = `
.powered { margin: 0; padding: 6px 0 2px; text-align: center; font-size: 11px; line-height: 1.3; color: #8a8a92; letter-spacing: .01em; }
.powered a { color: inherit; font-weight: 600; text-decoration: none; }
.powered a:hover { color: #55555c; text-decoration: underline; }
`;
