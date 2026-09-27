export function buildStyles(primaryColor: string): string {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

    .launcher {
      position: fixed;
      bottom: 20px;
      width: 56px;
      height: 56px;
      border-radius: 999px;
      background: ${primaryColor};
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      z-index: 2147483000;
    }
    .launcher.left { left: 20px; }
    .launcher.right { right: 20px; }
    .launcher svg { width: 26px; height: 26px; }

    .teaser {
      position: fixed;
      bottom: 84px;
      max-width: 220px;
      background: white;
      color: #18181b;
      padding: 10px 14px;
      border-radius: 12px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.15);
      font-size: 14px;
      z-index: 2147483000;
    }
    .teaser.left { left: 20px; }
    .teaser.right { right: 20px; }

    .panel {
      position: fixed;
      bottom: 88px;
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 110px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483001;
    }
    .panel.left { left: 20px; }
    .panel.right { right: 20px; }
    .panel[hidden] { display: none; }

    @media (max-width: 640px) {
      .panel { width: 100vw; height: 100vh; max-height: 100vh; bottom: 0; left: 0; right: 0; border-radius: 0; }
    }

    .header {
      background: ${primaryColor};
      color: white;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
    }
    .close-btn {
      background: transparent;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      padding: 4px;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .msg.assistant { background: #f4f4f5; color: #18181b; align-self: flex-start; }
    .msg.user { background: ${primaryColor}; color: white; align-self: flex-end; }
    /* A button under an assistant reply, e.g. "Continue on WhatsApp" on handoff. */
    .msg-action {
      align-self: flex-start;
      display: inline-block;
      padding: 8px 14px;
      border-radius: 999px;
      background: #25d366;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
    .msg-action:focus-visible { outline: 2px solid ${primaryColor}; outline-offset: 2px; }

    .quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 16px 12px;
    }
    .chip {
      border: 1px solid #d4d4d8;
      background: white;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
    }

    .whatsapp-link {
      display: block;
      text-align: center;
      font-size: 13px;
      padding: 8px;
      color: ${primaryColor};
      text-decoration: none;
      border-top: 1px solid #f4f4f5;
    }

    .input-row {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid #f4f4f5;
    }
    .input-row textarea {
      flex: 1;
      resize: none;
      border: 1px solid #d4d4d8;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 14px;
      max-height: 80px;
    }
    .send-btn {
      background: ${primaryColor};
      color: white;
      border: none;
      border-radius: 10px;
      padding: 0 16px;
      cursor: pointer;
      font-weight: 600;
    }
    .send-btn:disabled { opacity: 0.5; cursor: default; }

    @media (prefers-reduced-motion: no-preference) {
      .panel { transition: opacity 120ms ease, transform 120ms ease; }
    }
  `;
}
