import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinServiceWindow, sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/channels/whatsapp";
import { canonicalPhone, formatPhone } from "@/lib/contacts/phone";
import { isOptedOut } from "@/lib/contacts/consent";
import { notifyOwnerOfLowRating } from "@/lib/email/notify-low-rating";
import { describeBooking, logBookingEvent } from "./manage";
import { classifyTemplateError, findWhatsAppConversation, reminderRoute, type NotSentReason, type ReminderBooking } from "./reminders";
import type { TenantWhatsApp } from "./whatsapp-channel";
import { LOW_RATING_MAX, parseRating, ratingReply, reviewRequestText } from "./rating";

// Review requests. The morning after a booking is marked Attended, the
// customer is asked once to rate the visit 1-5. The business's Google review
// link is in that first message, for everyone, and in the thank-you whatever
// the score: Google forbids "review gating" (only steering happy customers to
// reviews). Sent the same way as reminders — skipped after STOP, a normal
// message inside the 24h window, else the approved template — but never
// retried: a request that can't go out is noted in the booking's history only.

// Must exist and be approved in Meta Business Manager — see docs/SETUP.md.
export const REVIEW_TEMPLATE_NAME = "review_request";
const REVIEW_TEMPLATE_LANGUAGE = "en";

// Visits older than this aren't asked about (e.g. attendance marked late).
export const REVIEW_LOOKBACK_DAYS = 3;
// How long a bare "5" still counts as the answer to a request.
const RATING_REPLY_DAYS = 7;

export type ReviewBooking = ReminderBooking;

// Claims the booking so it's only ever attempted once, even if two runs
// overlap. false = another run already has it.
async function claim(admin: SupabaseClient, b: ReviewBooking): Promise<boolean> {
  const { data } = await admin
    .from("bookings")
    .update({ review_requested_at: new Date().toISOString() })
    .eq("id", b.id)
    .eq("tenant_id", b.tenant_id)
    .is("review_requested_at", null)
    .select("id");
  return Boolean(data?.length);
}

async function finish(
  admin: SupabaseClient,
  b: ReviewBooking,
  outcome: { sent: true; via: "message" | "template" } | { sent: false; reason: NotSentReason },
) {
  await admin
    .from("bookings")
    .update({ review_request_status: outcome.sent ? "sent" : "not_sent" })
    .eq("id", b.id)
    .eq("tenant_id", b.tenant_id);
  await logBookingEvent(admin, {
    tenantId: b.tenant_id,
    bookingId: b.id,
    type: outcome.sent ? "review_requested" : "review_not_sent",
    actor: "system",
    channel: "whatsapp",
    details: outcome.sent ? { via: outcome.via } : { reason: outcome.reason },
  });
}

export async function sendReviewRequest(
  admin: SupabaseClient,
  b: ReviewBooking,
  channel: TenantWhatsApp & { googleReviewUrl: string },
): Promise<"sent" | "not_sent" | "already_claimed"> {
  if (!(await claim(admin, b))) return "already_claimed";

  if (await isOptedOut(admin, b.tenant_id, b.contact_id)) {
    await finish(admin, b, { sent: false, reason: "opted_out" });
    return "not_sent";
  }

  const conversation = await findWhatsAppConversation(admin, b);
  const route = reminderRoute({ optedOut: false, windowOpen: isWithinServiceWindow(conversation?.last_inbound_at ?? null) });
  const text = reviewRequestText({
    name: b.name,
    business: channel.businessName,
    service: b.serviceName,
    reviewUrl: channel.googleReviewUrl,
  });

  let via: "message" | "template";
  try {
    if (route === "message" && conversation) {
      await sendWhatsAppText(channel.phoneNumberId, channel.accessToken, conversation.external_id, text);
      via = "message";
    } else {
      const to = canonicalPhone(b.phone);
      if (!to) {
        await finish(admin, b, { sent: false, reason: "send_failed" });
        return "not_sent";
      }
      await sendWhatsAppTemplate(channel.phoneNumberId, channel.accessToken, to, REVIEW_TEMPLATE_NAME, REVIEW_TEMPLATE_LANGUAGE, [
        b.name,
        channel.businessName || "us",
        b.serviceName,
        channel.googleReviewUrl,
      ]);
      via = "template";
    }
  } catch (err) {
    console.error(`Review request for booking ${b.id} failed:`, err);
    await finish(admin, b, { sent: false, reason: route === "message" ? "send_failed" : classifyTemplateError(err) });
    return "not_sent";
  }

  // Kept in the transcript, so the owner sees it and the AI has context if
  // they answer in words rather than a number.
  if (conversation) {
    await admin.from("messages").insert({ tenant_id: b.tenant_id, conversation_id: conversation.id, role: "assistant", content: text });
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id)
      .eq("tenant_id", b.tenant_id);
  }
  await finish(admin, b, { sent: true, via });
  return "sent";
}

// If this WhatsApp message is a bare score answering an open review request
// from this customer, records it and returns the reply to send; otherwise
// null and the message goes to the AI as usual.
export async function handleRatingReply(
  admin: SupabaseClient,
  p: {
    tenantId: string;
    contactId: string | null;
    conversationId: string;
    text: string;
    businessName: string;
    reviewUrl: string | null;
  },
): Promise<string | null> {
  const rating = parseRating(p.text);
  if (rating === null || !p.contactId) return null;

  const since = new Date(Date.now() - RATING_REPLY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, name, phone, starts_at, services(name)")
    .eq("tenant_id", p.tenantId)
    .eq("contact_id", p.contactId)
    .eq("review_request_status", "sent")
    .is("review_rating", null)
    .gte("review_requested_at", since)
    .order("review_requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!booking) return null;

  // Conditional, so a duplicate delivery can't overwrite or double-alert.
  const { data: updated } = await admin
    .from("bookings")
    .update({ review_rating: rating, review_rated_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("tenant_id", p.tenantId)
    .is("review_rating", null)
    .select("id");
  if (!updated?.length) return null;

  await logBookingEvent(admin, {
    tenantId: p.tenantId,
    bookingId: booking.id,
    type: "review_rated",
    actor: "ai",
    channel: "whatsapp",
    details: { rating },
  });

  if (rating <= LOW_RATING_MAX) {
    const serviceName = (booking.services as unknown as { name: string } | null)?.name ?? "Booking";
    await notifyOwnerOfLowRating(
      admin,
      p.tenantId,
      p.businessName,
      {
        customer: booking.name,
        rating,
        booking: describeBooking({ serviceName, startsAt: booking.starts_at }),
        phone: formatPhone(canonicalPhone(booking.phone)) || booking.phone,
      },
      p.conversationId,
    );
  }

  return ratingReply({ rating, reviewUrl: p.reviewUrl });
}
