import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const sent = vi.fn(async (_email: { to: string; subject: string; html: string }) => undefined);
vi.mock("../lib/email/send", async (orig) => ({
  ...(await orig<typeof import("../lib/email/send")>()),
  sendCustomerEmail: (e: { to: string; subject: string; html: string }) => sent(e),
}));

import { cancellationEmail, emailSignupsAboutCancellation } from "../lib/email/event-signup";

const base = {
  name: "Thandi",
  businessName: "The Courtyard",
  contact: "011 555 0100",
  title: "Summer wine tasting",
  startsAt: "2026-12-05T16:00:00Z",
  message: "",
  paidCents: null,
};

describe("cancellation email", () => {
  it("says what was cancelled and when, in SA time", () => {
    const { subject, html } = cancellationEmail(base);
    expect(subject).toBe("Cancelled: Summer wine tasting");
    expect(html).toContain("The Courtyard has cancelled <strong>Summer wine tasting</strong> on Saturday 5 December at 18:00");
    expect(html).toContain("Contact The Courtyard on 011 555 0100");
    expect(html).not.toContain("refund");
    expect(html).not.toContain("Their message");
  });

  it("includes the business's message, safely, in paragraphs", () => {
    const { html } = cancellationEmail({ ...base, message: "Rain <b>forecast</b>.\n\nNew date soon!" });
    expect(html).toContain("<p>Rain &lt;b&gt;forecast&lt;/b&gt;.</p><p>New date soon!</p>");
  });

  it("tells people who paid that the business will be in touch about a refund", () => {
    const { html } = cancellationEmail({ ...base, paidCents: 50000 });
    expect(html).toContain("You paid R500 for your tickets. The Courtyard will be in touch about your refund.");
  });
});

describe("emailSignupsAboutCancellation", () => {
  it("emails everyone still signed up who gave an email", async () => {
    sent.mockClear();
    const signups = [
      { id: "1", name: "A", email: "a@example.com", payment_status: "paid", amount_due_cents: 30000 },
      { id: "2", name: "B", email: "b@example.com", payment_status: "not_required", amount_due_cents: null },
    ];
    const filters: string[] = [];
    const client = {
      from(table: string) {
        const q = {
          select: () => q,
          eq: (k: string, v: unknown) => (filters.push(`${table}.${k}=${v}`), q),
          not: (k: string, op: string, v: unknown) => (filters.push(`${table}.${k} ${op} ${v}`), q),
          maybeSingle: async () => ({
            data: table === "events" ? { title: "Wine night", starts_at: "2026-12-05T16:00:00Z" } : { business_name: "The Courtyard", handoff_contact: "" },
          }),
          then: (resolve: (v: unknown) => void) => resolve({ data: signups }),
        };
        return q;
      },
    } as unknown as SupabaseClient;

    expect(await emailSignupsAboutCancellation(client, "t1", "e1", "Sorry!")).toBe(2);
    // Only confirmed sign-ups with an email, in this business, for this event.
    expect(filters).toEqual(expect.arrayContaining(["event_signups.status=confirmed", "event_signups.email is null", "event_signups.tenant_id=t1", "event_signups.event_id=e1"]));
    expect(sent.mock.calls.map(([e]) => e.to)).toEqual(["a@example.com", "b@example.com"]);
    expect(sent.mock.calls[0]![0].html).toContain("You paid R300");
    expect(sent.mock.calls[1]![0].html).not.toContain("You paid");
  });
});
