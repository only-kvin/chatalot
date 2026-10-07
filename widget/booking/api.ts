import type { FormField } from "../shared/form";
import type { Theme } from "../shared/theme";
import type { Slot } from "./calendar";

// Calls to ChatAlot's public widget API. Every call carries the business's
// public key; the server resolves the business and checks the website.

export type BookingWidget = "schedule" | "appointment";

// What both booking widgets share; each adds its own wording on top.
export type BaseConfig = {
  businessName: string;
  contact: string;
  theme: Theme;
  fields: FormField[];
  copy: {
    title: string;
    confirmButton: string;
    successTitle: string;
    successMessage: string;
    requestedTitle: string;
    requestedMessage: string;
  };
};

export type Service = {
  id: string;
  name: string;
  description: string;
  category: string;
  durationMinutes: number;
  priceCents: number | null;
  staffIds: string[];
};
export type Staff = { id: string; name: string; role: string; avatarUrl: string | null };

export type BookingResult =
  | { ok: true; status: "confirmed" | "pending"; ref: string; startsAt: string; endsAt: string; staffName: string | null }
  | { ok: false; error: string; slotTaken: boolean };

export type AvailabilityQuery = {
  service: string;
  staff: string;
  from: string;
  to: string;
  // A manage-link token: that booking's own time counts as free.
  token?: string;
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

const OFFLINE = "We couldn't reach the booking system. Check your connection and try again.";

export function createApi(apiOrigin: string, key: string) {
  async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const res = await fetch(`${apiOrigin}${path}?${new URLSearchParams({ key, ...params })}`);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    config: <T extends BaseConfig>(widget: BookingWidget) => get<T>("/api/widget/config", { widget }),
    services: () => get<{ services: Service[]; staff: Staff[] }>("/api/public/services"),
    availability: (q: AvailabilityQuery) =>
      get<{ days: { date: string; slots: Slot[] }[] }>("/api/public/availability", {
        service: q.service,
        from: q.from,
        to: q.to,
        ...(q.staff ? { staff: q.staff } : {}),
        ...(q.token ? { token: q.token } : {}),
      }),
    async book(widget: BookingWidget, body: Record<string, unknown>): Promise<BookingResult> {
      try {
        const { ok, json } = await post(`${apiOrigin}/api/public/appointments`, { key, widget, ...body });
        if (ok && json.ok) return json as BookingResult;
        return {
          ok: false,
          error: typeof json.error === "string" ? json.error : "We couldn't make the booking. Please try again.",
          slotTaken: json.reason === "slot_taken",
        };
      } catch {
        return { ok: false, error: OFFLINE, slotTaken: false };
      }
    },
    // Moves a booking using the signed token from the customer's email link.
    async reschedule(token: string, date: string, time: string): Promise<{ ok: true; startsAt: string; endsAt: string } | { ok: false; error: string; slotTaken: boolean }> {
      try {
        const { ok, json } = await post(`${apiOrigin}/api/public/reschedule`, { token, date, time });
        if (ok && json.ok) return json as { ok: true; startsAt: string; endsAt: string };
        return {
          ok: false,
          error: typeof json.error === "string" ? json.error : "We couldn't move the booking. Please try again.",
          slotTaken: json.reason === "slot_taken",
        };
      } catch {
        return { ok: false, error: OFFLINE, slotTaken: false };
      }
    },
  };
}

export type Api = ReturnType<typeof createApi>;

export function price(cents: number | null): string | null {
  if (cents === null) return null;
  return `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}
