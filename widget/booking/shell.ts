import { h } from "../shared/dom";
import type { MountContext } from "../shared/loader-contract";
import { POWERED_CSS, poweredBy } from "../shared/powered";
import { loadFont, themeCss, type Theme } from "../shared/theme";
import { BOOKING_CSS } from "./styles";

// The frame every booking widget renders into: a Shadow DOM (so the host
// site's CSS can't reach in), the business's theme, a screen-reader
// announcer, and the optional floating launcher.

export type Shell = {
  id: string;
  card: HTMLElement;
  shadow: ShadowRoot;
  // Replaces the card's contents, keeping keyboard focus where it was. Takes
  // a builder so focus is noted before building (which can move nodes).
  paint: (build: () => (Node | null | false)[], opts?: { done?: boolean }) => void;
  announce: (text: string) => void;
  applyTheme: (theme: Theme, launcherLabel: string) => void;
  button: (cls: string, label: string, onClick: () => void, key?: string, attrs?: Record<string, string | boolean | number>) => HTMLButtonElement;
  focusFirst: (selector: string) => void;
};

let instances = 0;

export function createShell(host: HTMLElement, ctx: MountContext, name: string, extraCss = ""): Shell {
  const id = `ca-${name}-${++instances}`;
  const shadow = host.attachShadow({ mode: "open" });
  const themeStyle = h("style");
  // Announcements live outside the re-rendered card.
  const live = h("div", { class: "sr", "aria-live": "polite" });
  const card = h("section", { class: "card", "aria-labelledby": `${id}-title` });
  // "Powered by" stays the card's last line through every re-render.
  const powered = poweredBy();
  shadow.append(h("style", {}, BOOKING_CSS + extraCss + POWERED_CSS + ".card > .powered { margin-top: -6px; }"), themeStyle, live);

  let launcher: HTMLButtonElement | null = null;
  if (ctx.mode === "float") {
    launcher = h("button", { class: "launcher", "aria-expanded": "false" }, "Book now");
    const panel = h("div", { class: "float-panel", role: "dialog", "aria-modal": "false", hidden: true }, card);
    shadow.append(launcher, panel);
    const toggle = (open: boolean) => {
      panel.hidden = !open;
      launcher!.setAttribute("aria-expanded", String(open));
      // After the panel is shown, or the browser won't move focus into it.
      if (open) setTimeout(() => (card.querySelector("h2") as HTMLElement | null)?.focus(), 0);
      else launcher!.focus();
    };
    launcher.addEventListener("click", () => toggle(panel.hidden));
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") toggle(false);
    });
  } else {
    shadow.append(card);
  }

  function paint(build: () => (Node | null | false)[], opts: { done?: boolean } = {}) {
    const active = shadow.activeElement as HTMLElement | null;
    const focusKey = active?.dataset?.k;
    const nodes = build();
    card.className = `card${opts.done ? " done" : ""}`;
    card.replaceChildren(...nodes.filter((n): n is Node => Boolean(n)), powered);
    // Re-inserting nodes drops focus: put it back on the same element (form
    // fields persist across renders), or its re-created twin.
    if (active?.isConnected) active.focus();
    else if (focusKey) (card.querySelector(`[data-k="${focusKey}"]`) as HTMLElement | null)?.focus();
  }

  return {
    id,
    card,
    shadow,
    paint,
    announce(text) {
      live.textContent = "";
      // Cleared first so a repeated message is still read out. Not
      // requestAnimationFrame: browsers pause it in background tabs.
      setTimeout(() => (live.textContent = text), 50);
    },
    applyTheme(theme, launcherLabel) {
      themeStyle.textContent = themeCss(theme);
      loadFont(theme.font);
      if (launcher) launcher.textContent = launcherLabel;
    },
    button(cls, label, onClick, key, attrs = {}) {
      const b = h("button", { type: "button", class: cls, "data-k": key, ...attrs }, label);
      b.addEventListener("click", onClick);
      return b;
    },
    focusFirst(selector) {
      (card.querySelector(selector) as HTMLElement | null)?.focus();
    },
  };
}
