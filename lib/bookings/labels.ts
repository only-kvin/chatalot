import { formatLocalDateTime } from "@/lib/time";
import { NOT_SENT_REASON, type NotSentReason } from "./reminders";

// Human wording for the booking history and status badges. Pure, so both
// server pages and tests use it.

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Attended",
  no_show: "No-show",
};

export function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "cancelled" || status === "no_show") return "destructive";
  if (status === "completed") return "secondary";
  return "default";
}

export const SOURCE_LABEL: Record<string, string> = {
  web: "Website chat",
  whatsapp: "WhatsApp",
  team: "Your team",
};

export { formatShortLocal } from "@/lib/time";

const REVIEW_NOT_SENT_REASON: Record<NotSentReason, string> = {
  opted_out: "they replied STOP",
  no_template: "there's no approved review template yet, and they haven't messaged in the last 24 hours",
  send_failed: "WhatsApp didn't accept the message",
};

export type BookingEvent = {
  type: string;
  actor: string;
  channel: string | null;
  details: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

function who(e: BookingEvent, currentUserId: string | null): string {
  if (e.actor === "team") return e.created_by && e.created_by === currentUserId ? "you" : "your team";
  if (e.actor === "system") return "ChatAlot";
  const via = e.channel === "whatsapp" ? "on WhatsApp" : e.channel === "web" ? "in the website chat" : "";
  return `the customer ${via}`.trim();
}

export function describeEvent(e: BookingEvent, currentUserId: string | null = null): string {
  const d = e.details ?? {};
  switch (e.type) {
    case "created":
      return e.actor === "team" ? `Booked by ${who(e, currentUserId)}` : `Booked by ${who(e, currentUserId)}`;
    case "rescheduled": {
      const from = typeof d.from === "string" ? formatLocalDateTime(d.from) : "?";
      const to = typeof d.to === "string" ? formatLocalDateTime(d.to) : "?";
      return `Moved by ${who(e, currentUserId)}: ${from} → ${to}`;
    }
    case "cancelled":
      return `Cancelled by ${who(e, currentUserId)}${typeof d.reason === "string" && d.reason ? `: "${d.reason}"` : ""}`;
    case "attended":
      return `Marked attended by ${who(e, currentUserId)}`;
    case "no_show":
      return `Marked no-show by ${who(e, currentUserId)}`;
    case "reopened":
      return `Set back to confirmed by ${who(e, currentUserId)}`;
    case "reminder_sent":
      return d.via === "template" ? "Reminder sent on WhatsApp (template)" : "Reminder sent on WhatsApp";
    case "reminder_not_sent": {
      const reason = typeof d.reason === "string" && d.reason in NOT_SENT_REASON ? NOT_SENT_REASON[d.reason as NotSentReason] : "";
      return `Reminder not sent${reason ? `: ${reason}` : ""}`;
    }
    case "review_requested":
      return d.via === "template" ? "Review request sent on WhatsApp (template)" : "Review request sent on WhatsApp";
    case "review_not_sent": {
      const reason =
        typeof d.reason === "string" && d.reason in REVIEW_NOT_SENT_REASON ? REVIEW_NOT_SENT_REASON[d.reason as NotSentReason] : "";
      return `Review request not sent${reason ? `: ${reason}` : ""}`;
    }
    case "review_rated":
      return `Customer rated the visit ${typeof d.rating === "number" ? d.rating : "?"}/5`;
    default:
      return e.type;
  }
}
