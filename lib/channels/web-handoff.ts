// Website chats have no way for the owner to reply, so a "handoff" there means:
// tell the owner (bell + email), offer the customer the business's WhatsApp —
// where the owner can reply from the dashboard — and let the AI take their
// name and number for a callback. The chat is never locked.

const WHATSAPP_PREFILL = "Hi! I was chatting on your website and would like to speak to a person.";

// The tenant's WhatsApp link with a ready-to-send message, so the owner sees
// why the customer is writing. Non-WhatsApp or malformed links are dropped.
export function whatsappContinueUrl(link: string | null | undefined): string | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname === "wa.me" || url.hostname === "api.whatsapp.com") {
    if (!url.searchParams.has("text")) url.searchParams.set("text", WHATSAPP_PREFILL);
    return url.toString();
  }
  return null;
}

export type ChatAction = { type: "link"; label: string; url: string };

export function whatsappAction(url: string | null): ChatAction | null {
  return url ? { type: "link", label: "Continue on WhatsApp", url } : null;
}

// Sent without the model when a visitor asks for a person.
export function webHandoffMessage(opts: { whatsapp: boolean; handoffContact: string | null }): string {
  const reach = opts.whatsapp
    ? " The quickest way to reach them is on WhatsApp: tap the button below."
    : opts.handoffContact
      ? ` You can also reach them directly on ${opts.handoffContact}.`
      : "";
  return (
    `Of course. I've let the team know you'd like to speak to a person.${reach}` +
    " Or, if you'd like them to contact you, just share your name and phone number here."
  );
}

// Sent when the owner has taken over a website chat: messages are saved for
// them, and the customer gets a way to actually reach a person.
export function webTakenOverMessage(opts: { whatsapp: boolean; handoffContact: string | null }): string {
  const reach = opts.whatsapp
    ? " For the quickest reply, continue on WhatsApp using the button below."
    : opts.handoffContact
      ? ` For the quickest reply, contact them on ${opts.handoffContact}.`
      : "";
  return `Thanks, a team member has your message.${reach} If you'd like a call back, leave your name and phone number here.`;
}
