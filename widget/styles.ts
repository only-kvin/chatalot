import { POWERED_CSS } from "./shared/powered";
import { onColor } from "./shared/theme";

// The chat widget's look, in the ChatAlot dashboard's style: a top-lit
// gradient in the business's colour with a soft glow, layered shadows, a
// panel that slides open from the launcher, bubbles that ease in and a
// typing indicator while the reply is on its way. Motion is calm and quick:
// UI under 300ms, closing faster than opening (see docs/brand/README.md).
export function buildStyles(primaryColor: string): string {
  return `
    :host {
      all: initial;
      --p: ${primaryColor};
      --on-p: ${onColor(primaryColor)};
      --p-hi: color-mix(in srgb, ${primaryColor} 84%, #fff);
      --p-lo: color-mix(in srgb, ${primaryColor} 86%, #000);
      --glow: color-mix(in srgb, ${primaryColor} 45%, transparent);
      --soft: color-mix(in srgb, ${primaryColor} 10%, #fff);
      --ink: #1d1d1f;
      --muted: #6b6b72;
      --line: rgba(17,17,26,.08);
      --ease: cubic-bezier(.2,.8,.2,1);
      --ease-out: cubic-bezier(.23,1,.32,1);
      --drawer: cubic-bezier(.32,.72,0,1);
    }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button { cursor: pointer; transition: transform .12s ease, box-shadow .2s ease, background-color .2s ease; }
    button:active:not(:disabled) { transform: scale(.96); }
    :focus-visible { outline: 2px solid var(--p); outline-offset: 2px; }

    .launcher {
      position: fixed;
      bottom: 20px;
      width: 58px;
      height: 58px;
      border-radius: 999px;
      background: linear-gradient(180deg, var(--p-hi), var(--p-lo));
      color: var(--on-p);
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 0 rgba(255,255,255,.3) inset, 0 12px 28px -10px var(--glow), 0 4px 12px rgba(0,0,0,.14);
      z-index: 2147483000;
      /* Seen on every page load, so a calm fade-and-grow, no bounce.
         backwards: once in, hover and press control the transform again. */
      animation: pop .28s var(--ease-out) backwards;
    }
    /* Mouse only: on phones a tap triggers hover and the lift would stick. */
    @media (hover: hover) and (pointer: fine) {
      .launcher:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 1px 0 rgba(255,255,255,.3) inset, 0 16px 34px -10px var(--glow), 0 6px 16px rgba(0,0,0,.16); }
    }
    .launcher:active { transform: scale(.94); }
    .launcher.left { left: 20px; }
    .launcher.right { right: 20px; }
    .launcher svg { width: 26px; height: 26px; }
    /* The chatbot's own icon on the button: fills the circle, keeps the glow. */
    .launcher.has-icon { padding: 0; overflow: hidden; background: #fff; }
    .launcher.has-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 999px; }

    .teaser {
      position: fixed;
      bottom: 88px;
      max-width: 230px;
      background: #fff;
      color: var(--ink);
      padding: 11px 14px;
      border-radius: 16px;
      box-shadow: 0 0 0 1px var(--line), 0 12px 30px -12px rgba(17,17,26,.3);
      font-size: 14px;
      line-height: 1.35;
      cursor: pointer;
      z-index: 2147483000;
      animation: up .5s var(--ease) .6s both;
    }
    .teaser.left { left: 20px; }
    .teaser.right { right: 20px; }

    .panel {
      position: fixed;
      bottom: 92px;
      width: 384px;
      height: 600px;
      max-height: calc(100vh - 116px);
      background: linear-gradient(180deg, #fff, #fcfcfd);
      border-radius: 22px;
      box-shadow: 0 0 0 1px var(--line), 0 30px 70px -20px rgba(17,17,26,.35), 0 40px 80px -40px var(--glow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483001;
      animation: open .24s var(--drawer) both;
    }
    /* Closing is quicker than opening; panel.ts hides it once this ends. */
    .panel.closing { animation: close .16s var(--ease-out) both; pointer-events: none; }
    .panel.left { left: 20px; transform-origin: bottom left; }
    .panel.right { right: 20px; transform-origin: bottom right; }
    .panel[hidden] { display: none; }

    @media (max-width: 640px) {
      .panel { width: 100vw; height: 100vh; max-height: 100vh; bottom: 0; left: 0; right: 0; border-radius: 0; }
    }

    .header {
      background: linear-gradient(160deg, var(--p-hi), var(--p-lo));
      color: var(--on-p);
      padding: 14px 14px 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 1px 0 rgba(255,255,255,.2) inset;
    }
    .avatar {
      position: relative;
      width: 38px;
      height: 38px;
      border-radius: 999px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      background: rgba(255,255,255,.22);
      object-fit: cover;
    }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .who strong { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who span { font-size: 12px; opacity: .85; display: flex; align-items: center; gap: 6px; }
    /* "Online" dot. Steady on purpose: constant motion beside the
       conversation is distracting. */
    .live { position: relative; width: 7px; height: 7px; border-radius: 999px; background: #34c759; box-shadow: 0 0 0 2px rgba(255,255,255,.5); }
    .close-btn {
      background: rgba(255,255,255,.14);
      border: none;
      color: inherit;
      width: 36px;
      height: 36px;
      border-radius: 999px;
      font-size: 16px;
      line-height: 1;
      flex: none;
    }
    .close-btn:hover { background: rgba(255,255,255,.26); }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .msg {
      max-width: 82%;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 14px;
      line-height: 1.45;
      white-space: pre-wrap;
      animation: up .2s var(--ease-out) both;
    }
    .msg.assistant {
      background: #fff;
      color: var(--ink);
      align-self: flex-start;
      border-bottom-left-radius: 6px;
      box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgba(17,17,26,.04);
    }
    .msg.user {
      background: linear-gradient(180deg, var(--p-hi), var(--p-lo));
      color: var(--on-p);
      align-self: flex-end;
      border-bottom-right-radius: 6px;
      box-shadow: 0 6px 14px -8px var(--glow);
    }
    /* Typing indicator: an assistant bubble still waiting for its first word. */
    .msg.assistant:empty { padding: 14px 16px; }
    .msg.assistant:empty::before {
      content: "";
      display: block;
      width: 30px;
      height: 8px;
      background:
        radial-gradient(circle 4px, var(--muted) 98%, transparent) 0 50% / 10px 8px no-repeat,
        radial-gradient(circle 4px, var(--muted) 98%, transparent) 50% 50% / 10px 8px no-repeat,
        radial-gradient(circle 4px, var(--muted) 98%, transparent) 100% 50% / 10px 8px no-repeat;
      animation: typing 1s ease-in-out infinite;
    }
    /* A button under an assistant reply, e.g. "Continue on WhatsApp" on handoff. */
    .msg-action {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      padding: 9px 16px;
      border-radius: 999px;
      background: linear-gradient(180deg, #34d27a, #1fae5b);
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 6px 14px -6px rgba(37,211,102,.6);
      animation: up .2s var(--ease-out) both;
    }
    .msg-action:focus-visible { outline: 2px solid var(--p); outline-offset: 2px; }

    .quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 16px 12px;
    }
    .chip {
      border: none;
      background: #fff;
      color: var(--ink);
      border-radius: 999px;
      padding: 7px 13px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgba(17,17,26,.05);
    }
    .chip:hover { background: var(--soft); box-shadow: 0 0 0 1px var(--glow); }

    .whatsapp-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      padding: 9px;
      color: #128c4a;
      text-decoration: none;
      border-top: 1px solid var(--line);
    }
    .whatsapp-link::before { content: ""; width: 8px; height: 8px; border-radius: 999px; background: #25d366; }
    .whatsapp-link:hover { background: #f3fbf6; }

    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--line);
      background: #fff;
    }
    .input-row textarea {
      flex: 1;
      resize: none;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      font-size: 14px;
      max-height: 90px;
      background: #f7f7fa;
      transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
    }
    .input-row textarea:focus { outline: none; background: #fff; border-color: var(--p); box-shadow: 0 0 0 4px var(--soft); }
    .send-btn {
      background: linear-gradient(180deg, var(--p-hi), var(--p-lo));
      color: var(--on-p);
      border: none;
      border-radius: 14px;
      min-height: 42px;
      padding: 0 16px;
      font-weight: 600;
      box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 6px 14px -6px var(--glow);
    }
    .send-btn:disabled { opacity: 0.5; cursor: default; }

    @keyframes up { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: none; } }
    @keyframes open { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
    @keyframes close { to { opacity: 0; transform: translateY(8px) scale(.96); } }
    @keyframes pop { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
    @keyframes fade { from { opacity: 0; } }
    @keyframes fade-out { to { opacity: 0; } }
    @keyframes typing { 50% { opacity: .35; } }

    /* "Powered by" sits under the message box, on the panel's white. */
    .input-row { padding-bottom: 6px; }
    .panel > .powered { background: #fff; padding: 0 0 8px; }
    ${POWERED_CSS}

    /* Reduced motion means fewer and gentler, not none: nothing moves or
       scales, but the launcher, panel and new messages still fade. */
    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
      .launcher, .teaser, .panel, .msg, .msg-action { animation-name: fade !important; animation-duration: .15s !important; animation-timing-function: ease !important; animation-fill-mode: both !important; }
      .panel.closing { animation-name: fade-out !important; }
      button:active:not(:disabled), .launcher:active { transform: none; }
    }
  `;
}
