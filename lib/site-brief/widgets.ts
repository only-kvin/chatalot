import { BRAND_URL } from "@/lib/brand";
import type { Features } from "@/lib/plans";

// The business's ChatAlot widgets, ready to paste into a new website: only
// the ones its plan has switched on, with its own public key. Always the
// public domain (lib/brand.ts): briefs are stored and shared, so they must
// never carry a preview or localhost address.

export type WidgetSnippet = { name: string; code: string; placement: string };

export function widgetSnippets(publicKey: string, features: Features): WidgetSnippet[] {
  const script = `<script src="${BRAND_URL}/widget.js" data-key="${publicKey}" async></script>`;
  const snippets: WidgetSnippet[] = [];
  const chatOn = features.web_chat === "on";
  const inline = (type: string) => `<div data-chatalot="${type}"></div>`;

  if (chatOn) {
    snippets.push({
      name: "AI receptionist chat",
      code: script,
      placement: "Once on every page, just before </body>. It adds the floating chat button. Load the other widgets below from this same script.",
    });
  } else {
    // The script still loads the inline widgets; data-chat="off" hides the chat.
    snippets.push({
      name: "Widget loader",
      code: script.replace(" async>", ' data-chat="off" async>'),
      placement: "Once on every page, just before </body>. Loads the widgets below (no chat on this plan).",
    });
  }
  if (features.bookings === "on") {
    snippets.push({ name: "Appointment booking", code: inline("appointment"), placement: "On the Book page: customers choose a service, a person and a time." });
    snippets.push({ name: "Schedule", code: inline("schedule"), placement: "Optional, on the Book page or a timetable page: customers pick a day first." });
  }
  if (features.contact_form === "on") {
    snippets.push({ name: "Contact form", code: inline("contact"), placement: "On the Contact page." });
  }
  if (features.registration === "on") {
    snippets.push({ name: "Customer registration", code: inline("registration"), placement: "Optional, on a Join or Sign-up page." });
  }
  return snippets;
}
