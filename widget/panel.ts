import { buildStyles } from "./styles";

export type WidgetConfig = {
  businessName: string;
  greeting: string;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  avatarUrl: string | null;
  launcherText: string;
  teaserText: string | null;
  quickReplies: string[];
  whatsappLink: string | null;
};

export type WidgetApi = {
  open: () => void;
  close: () => void;
  sendMessage: (text: string) => void;
};

const LAUNCHER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

function sessionIdFor(key: string): string {
  const storageKey = `chatalot_session_${key}`;
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
  }
  return id;
}

export function createWidget(
  config: WidgetConfig,
  apiOrigin: string,
  publicKey: string,
): WidgetApi {
  const side = config.position === "bottom-left" ? "left" : "right";
  const sessionId = sessionIdFor(publicKey);

  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildStyles(config.primaryColor);
  shadow.appendChild(style);

  const launcher = document.createElement("button");
  launcher.className = `launcher ${side}`;
  launcher.setAttribute("aria-label", config.launcherText);
  launcher.innerHTML = LAUNCHER_ICON;
  shadow.appendChild(launcher);

  let teaser: HTMLDivElement | null = null;
  if (config.teaserText) {
    teaser = document.createElement("div");
    teaser.className = `teaser ${side}`;
    teaser.textContent = config.teaserText;
    shadow.appendChild(teaser);
  }

  const panel = document.createElement("div");
  panel.className = `panel ${side}`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `Chat with ${config.businessName}`);
  panel.hidden = true;

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `<span>${config.businessName}</span>`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.textContent = "✕";
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const messagesEl = document.createElement("div");
  messagesEl.className = "messages";
  panel.appendChild(messagesEl);

  function addMessage(role: "user" | "assistant", text: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  if (config.greeting) addMessage("assistant", config.greeting);

  if (config.quickReplies.length > 0) {
    const chips = document.createElement("div");
    chips.className = "quick-replies";
    for (const reply of config.quickReplies) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = reply;
      chip.addEventListener("click", () => sendMessage(reply));
      chips.appendChild(chip);
    }
    panel.appendChild(chips);
  }

  if (config.whatsappLink) {
    const wa = document.createElement("a");
    wa.className = "whatsapp-link";
    wa.href = config.whatsappLink;
    wa.target = "_blank";
    wa.rel = "noopener noreferrer";
    wa.textContent = "Chat on WhatsApp instead";
    panel.appendChild(wa);
  }

  const inputRow = document.createElement("div");
  inputRow.className = "input-row";
  const textarea = document.createElement("textarea");
  textarea.rows = 1;
  textarea.setAttribute("aria-label", "Message");
  textarea.placeholder = "Type a message…";
  const sendBtn = document.createElement("button");
  sendBtn.className = "send-btn";
  sendBtn.textContent = "Send";
  inputRow.appendChild(textarea);
  inputRow.appendChild(sendBtn);
  panel.appendChild(inputRow);

  shadow.appendChild(panel);

  let sending = false;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    sending = true;
    sendBtn.disabled = true;
    textarea.value = "";

    addMessage("user", trimmed);
    const replyEl = addMessage("assistant", "");

    try {
      const res = await fetch(`${apiOrigin}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: publicKey, sessionId, message: trimmed }),
      });

      if (!res.ok || !res.body) {
        replyEl.textContent = "Sorry, something went wrong. Please try again.";
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;
          const data = trimmedLine.slice("data:".length).trim();
          if (data === "[DONE]") continue;

          const payload = JSON.parse(data);
          if (payload.text) {
            replyEl.textContent += payload.text;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        }
      }
    } catch {
      replyEl.textContent = "Sorry, something went wrong. Please try again.";
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  function open() {
    panel.hidden = false;
    if (teaser) teaser.style.display = "none";
    textarea.focus();
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    panel.hidden = true;
    document.removeEventListener("keydown", onKeydown);
    launcher.focus();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      close();
      return;
    }
    // Basic focus trap within the panel while open.
    if (e.key === "Tab") {
      const focusable = panel.querySelectorAll<HTMLElement>(
        "button, textarea, a[href]",
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = shadow.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  launcher.addEventListener("click", () => (panel.hidden ? open() : close()));
  closeBtn.addEventListener("click", close);
  teaser?.addEventListener("click", open);
  sendBtn.addEventListener("click", () => sendMessage(textarea.value));
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(textarea.value);
    }
  });

  return { open, close, sendMessage };
}
