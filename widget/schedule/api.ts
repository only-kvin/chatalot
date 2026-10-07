import type { FormField } from "../shared/form";
import type { Theme } from "../shared/theme";
import type { Slot } from "./calendar";

// Calls to ChatAlot's public widget API. Every call carries the business's
// public key; the server resolves the business and checks the website.

export type ScheduleConfig = {
  businessName: string;
  contact: string;
  theme: Theme;
  copy: {
    title: string;
    confirmButton: string;
    successTitle: string;
    successMessage: string;
    requestedTitle: string;
    requestedMessage: string;
  };
  settings: { allowStaffChoice: boolean };
  fields: FormField[];
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
  | { ok: true; status: "confirmed" | "pending"; ref: string; startsAt: string; endsAt: string }
  | { ok: false; error: string; slotTaken: boolean };

export function createApi(apiOrigin: string, key: string) {
  async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const res = await fetch(`${apiOrigin}${path}?${new URLSearchParams({ key, ...params })}`);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    config: () => get<ScheduleConfig>("/api/widget/config", { widget: "schedule" }),
    services: () => get<{ services: Service[]; staff: Staff[] }>("/api/public/services"),
    availability: (q: { service: string; staff: string; from: string; to: string }) =>
      get<{ days: { date: string; slots: Slot[] }[] }>("/api/public/availability", {
        service: q.service,
        from: q.from,
        to: q.to,
        ...(q.staff ? { staff: q.staff } : {}),
      }),
    async book(body: Record<string, unknown>): Promise<BookingResult> {
      try {
        const res = await fetch(`${apiOrigin}/api/public/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, widget: "schedule", ...body }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) return json;
        return {
          ok: false,
          error: typeof json.error === "string" ? json.error : "We couldn't make the booking. Please try again.",
          slotTaken: json.reason === "slot_taken",
        };
      } catch {
        return { ok: false, error: "We couldn't reach the booking system. Check your connection and try again.", slotTaken: false };
      }
    },
  };
}
