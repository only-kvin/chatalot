// Meta WhatsApp Cloud API senders.
// Graph API version pinned here — check https://developers.facebook.com/docs/graph-api/changelog
// for the current stable version if this one has been deprecated.
const GRAPH_VERSION = "v21.0";

async function callGraphApi(phoneNumberId: string, accessToken: string, body: unknown) {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed ${res.status}: ${errBody}`);
  }
}

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Whether a free-form (non-template) message may be sent: Meta only allows it
// within 24h of the customer's last inbound message. Check this before every
// free-form send that isn't an immediate reply — e.g. a human replying from the
// dashboard hours later.
export function isWithinServiceWindow(
  lastInboundAt: string | Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  const elapsed = now.getTime() - new Date(lastInboundAt).getTime();
  return elapsed >= 0 && elapsed < SERVICE_WINDOW_MS;
}

// Free-form text reply. Only valid within the 24h customer service window
// (i.e. in response to an inbound message) — Meta rejects it outside that window.
export async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
): Promise<void> {
  await callGraphApi(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

// Approved template message — the only way to message outside the 24h window.
// Not called anywhere in v1 (no templates are approved yet), but implemented
// per spec so Phase 4's booking reminders have something to build on.
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[] = [],
): Promise<void> {
  await callGraphApi(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  });
}
