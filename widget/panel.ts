import { poweredBy } from "./shared/powered";
import { buildStyles } from "./styles";

export type WidgetConfig = {
  businessName: string;
  greeting: string;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  avatarUrl: string | null;
  // The chatbot's own name ("Lindi"). Older API responses lack these.
  assistantName?: string | null;
  iconOnLauncher?: boolean;
  launcherText: string;
  teaserText: string | null;
  quickReplies: string[];
  whatsappLink: string | null;
  // Website AI is on. Older API responses lack it; treat those as on.
  aiOnline?: boolean;
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
  // Only icons over https are shown (tenant-controlled URL).
  const iconUrl = config.avatarUrl?.startsWith("https://") ? config.avatarUrl : null;
  const assistantName = config.assistantName?.trim() || null;
  const displayName = assistantName ?? config.businessName;

  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildStyles(config.primaryColor);
  shadow.appendChild(style);

  const launcher = document.createElement("button");
  launcher.className = `launcher ${side}`;
  launcher.setAttribute("aria-label", config.launcherText);
  if (iconUrl && config.iconOnLauncher !== false) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = "";
    launcher.classList.add("has-icon");
    launcher.appendChild(img);
  } else {
    launcher.innerHTML = LAUNCHER_ICON;
  }
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
  panel.setAttribute("aria-label", `Chat with ${displayName}`);
  panel.hidden = true;

  const header = document.createElement("div");
  header.className = "header";
  // The chatbot's icon, or the first letter of its name.
  let avatar: HTMLElement;
  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = "";
    avatar = img;
  } else {
    avatar = document.createElement("span");
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = (displayName.trim()[0] ?? "?").toUpperCase();
  }
  avatar.className = "avatar";
  header.appendChild(avatar);
  // textContent, not innerHTML: businessName is tenant-controlled text.
  const who = document.createElement("div");
  who.className = "who";
  const title = document.createElement("strong");
  title.textContent = displayName;
  who.append(title);
  // With a chatbot name, the business name goes underneath. Only promise
  // instant replies while the AI is actually answering.
  const online = config.aiOnline !== false;
  if (online || assistantName) {
    const status = document.createElement("span");
    if (online) {
      const live = document.createElement("i");
      live.className = "live";
      status.append(live);
    }
    status.append(assistantName ? `${config.businessName}${online ? " · online" : ""}` : "Online · replies instantly");
    who.append(status);
  }
  header.appendChild(who);
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
  panel.appendChild(poweredBy());

  shadow.appendChild(panel);

  let sending = false;
  let sentThisPageView = false;

  // Re-renders this session's earlier messages after a page reload. Best-effort:
  // if it fails, the visitor just sees a fresh greeting.
  async function restoreHistory() {
    try {
      const params = new URLSearchParams({ key: publicKey, sessionId });
      const res = await fetch(`${apiOrigin}/api/chat/history?${params}`);
      if (!res.ok) return;
      const { messages } = (await res.json()) as {
        messages: { role: "user" | "assistant"; content: string }[];
      };
      // If the visitor already sent something in this page view, the server
      // history includes it too — rendering it now would duplicate it.
      if (!messages.length || sentThisPageView) return;

      for (const m of messages) addMessage(m.role, m.content);
    } catch {
      // Ignore — see comment above.
    }
  }
  restoreHistory();

  // A link button under the latest reply, e.g. "Continue on WhatsApp" when the
  // visitor asks for a person. Only https links from our own API are shown.
  function addAction(action: { type?: string; label?: string; url?: string }) {
    if (action.type !== "link" || !action.label || !action.url?.startsWith("https://")) return;
    const a = document.createElement("a");
    a.className = "msg-action";
    a.href = action.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = action.label;
    messagesEl.appendChild(a);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    sending = true;
    sentThisPageView = true;
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
          if (payload.action) addAction(payload.action);
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
