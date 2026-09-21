import { waitUntil } from "@vercel/functions";
import { verifyMetaSignature } from "@/lib/security/meta-signature";
import { processWhatsAppWebhook } from "@/lib/channels/process-whatsapp-webhook";

// Meta's one-time webhook verification handshake when you register this URL.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  // Meta expects a fast 200 and retries deliveries that don't get one — actual
  // processing (which can call two external APIs: the model and WhatsApp) happens
  // after the response is sent.
  waitUntil(processWhatsAppWebhook(payload));

  return new Response("OK", { status: 200 });
}
