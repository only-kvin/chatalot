import type { Features } from "@/lib/plans";
import { GUIDE_PAGES, pagesFor } from "./guide";

// What Echo's cursor can point at: real buttons, links and fields of the
// dashboard, each found by a stable selector (a form field's id, or a
// data-echo marker on the element). The model plans a walkthrough from these
// ids only; the selectors never come from the model.

export type TargetAction = "click" | "fill";

export type Target = {
  id: string;
  // Where it is: a page, "/dashboard/staff/*" for any page under it, or "*"
  // for everywhere (the menu).
  pages: string[];
  selector: string;
  // click: Echo waits for them to click it. fill: Echo waits for "Next".
  action: TargetAction;
  // For the model: what and where it is, in the dashboard's own words.
  label: string;
  // Clicking it opens this page (or kind of page).
  opens?: string;
};

const NAV_TARGETS: Target[] = GUIDE_PAGES.map((p) => ({
  id: `nav.${p.href === "/dashboard" ? "overview" : p.href.split("/").pop()}`,
  pages: ["*"],
  selector: `[data-echo="nav:${p.href}"]`,
  action: "click",
  label: `${p.title} in the menu`,
  opens: p.href,
}));

const echo = (name: string) => `[data-echo="${name}"]`;
const HOURS_PAGES = ["/dashboard/availability", "/dashboard/staff/*"];
const HOURS_FORM = echo("hours.form");

const PAGE_TARGETS: Target[] = [
  // Services
  { id: "services.edit", pages: ["/dashboard/services"], selector: echo("services.edit"), action: "click", label: "Edit button on a service in the list (loads it into the form at the top)" },
  { id: "services.name", pages: ["/dashboard/services"], selector: "#name", action: "fill", label: "Name field in the service form" },
  { id: "services.duration", pages: ["/dashboard/services"], selector: "#duration_minutes", action: "fill", label: "Duration (min) field in the service form" },
  { id: "services.price", pages: ["/dashboard/services"], selector: "#price_rand", action: "fill", label: "Price (R, optional) field in the service form" },
  { id: "services.price_type", pages: ["/dashboard/services"], selector: "#price_type", action: "fill", label: "Price type: Fixed price, From a price or Quoted on site" },
  { id: "services.location", pages: ["/dashboard/services"], selector: "#location", action: "fill", label: "Where it happens: at the business, the customer's address, or either" },
  { id: "services.callout_fee", pages: ["/dashboard/services"], selector: "#callout_fee_rand", action: "fill", label: "Call-out fee (R, optional); only shown when the service happens at the customer's address" },
  { id: "services.save", pages: ["/dashboard/services"], selector: echo("services.save"), action: "click", label: "Save service (or Add service for a new one) button" },

  // Opening hours (the business's on Availability, a person's on their staff page)
  { id: "hours.day", pages: HOURS_PAGES, selector: `${HOURS_FORM} select[name="weekday"]`, action: "fill", label: "Day to add hours for" },
  { id: "hours.from", pages: HOURS_PAGES, selector: `${HOURS_FORM} input[name="start_time"]`, action: "fill", label: "From time for those hours" },
  { id: "hours.to", pages: HOURS_PAGES, selector: `${HOURS_FORM} input[name="end_time"]`, action: "fill", label: "To time for those hours" },
  { id: "hours.add", pages: HOURS_PAGES, selector: echo("hours.add"), action: "click", label: "Add hours button (saves straight away)" },

  // Availability
  { id: "closure.date", pages: ["/dashboard/availability"], selector: "#date", action: "fill", label: "Date under Closures and special hours" },
  { id: "closure.closed", pages: ["/dashboard/availability"], selector: 'input[name="is_closed"]', action: "fill", label: "Closed all day tick box (untick for special hours)" },
  { id: "closure.from", pages: ["/dashboard/availability"], selector: "#exc_start_time", action: "fill", label: "Special hours from" },
  { id: "closure.to", pages: ["/dashboard/availability"], selector: "#exc_end_time", action: "fill", label: "Special hours To" },
  { id: "closure.add", pages: ["/dashboard/availability"], selector: echo("closure.add"), action: "click", label: "Add button for the closure or special hours" },
  { id: "rules.notice", pages: ["/dashboard/availability"], selector: "#booking_lead_time_minutes", action: "fill", label: "Minimum notice for new bookings (Booking rules)" },
  { id: "rules.horizon", pages: ["/dashboard/availability"], selector: "#booking_horizon_days", action: "fill", label: "Customers can book up to (how far ahead)" },
  { id: "rules.save", pages: ["/dashboard/availability"], selector: echo("rules.save"), action: "click", label: "Save booking rules button" },

  // Knowledge
  { id: "knowledge.edit", pages: ["/dashboard/knowledge"], selector: echo("knowledge.edit"), action: "click", label: "Edit button on a knowledge item" },
  { id: "knowledge.type", pages: ["/dashboard/knowledge"], selector: "#type", action: "fill", label: "Type of item: FAQ, service, policy or info" },
  { id: "knowledge.title", pages: ["/dashboard/knowledge"], selector: "#title", action: "fill", label: "Title of the item" },
  { id: "knowledge.content", pages: ["/dashboard/knowledge"], selector: "#content", action: "fill", label: "Content: the answer the AI gives" },
  { id: "knowledge.save", pages: ["/dashboard/knowledge"], selector: echo("knowledge.save"), action: "click", label: "Add item (or Update item) button" },

  // Settings
  { id: "settings.business_name", pages: ["/dashboard/settings"], selector: "#business_name", action: "fill", label: "Business name" },
  { id: "settings.tone", pages: ["/dashboard/settings"], selector: "#tone", action: "fill", label: "Tone the AI uses" },
  { id: "settings.greeting", pages: ["/dashboard/settings"], selector: "#greeting", action: "fill", label: "Greeting the AI starts with" },
  { id: "settings.extra", pages: ["/dashboard/settings"], selector: "#system_prompt_extra", action: "fill", label: "Extra instructions for the AI" },
  { id: "settings.handoff", pages: ["/dashboard/settings"], selector: "#handoff_contact", action: "fill", label: "Handoff contact customers are given for a person" },
  { id: "settings.review_link", pages: ["/dashboard/settings"], selector: "#google_review_url", action: "fill", label: "Google review link (Reviews)" },
  { id: "settings.domains", pages: ["/dashboard/settings"], selector: "#allowed_domains", action: "fill", label: "Allowed domains: the websites the chat widget may run on" },
  { id: "settings.save", pages: ["/dashboard/settings"], selector: echo("settings.save"), action: "click", label: "Save settings button (business info, reviews, domains)" },
  { id: "settings.address", pages: ["/dashboard/settings"], selector: "#business_address", action: "fill", label: "Your address (Bookings card)" },
  { id: "settings.service_areas", pages: ["/dashboard/settings"], selector: "#service_areas_input", action: "fill", label: "Areas you cover for call-outs" },
  { id: "settings.cancellation", pages: ["/dashboard/settings"], selector: "#cancellation_policy", action: "fill", label: "Cancellation policy" },
  { id: "settings.alert_phone", pages: ["/dashboard/settings"], selector: "#owner_alert_phone", action: "fill", label: "Your mobile for WhatsApp alerts" },
  { id: "settings.bookings_save", pages: ["/dashboard/settings"], selector: echo("settings.bookings_save"), action: "click", label: "Save booking settings button (Bookings card)" },

  // Widgets (Chat tab)
  { id: "widget.copy", pages: ["/dashboard/widget"], selector: echo("widget.copy"), action: "click", label: "Copy snippet button (Install snippet), to paste into their website" },
  { id: "widget.color", pages: ["/dashboard/widget"], selector: "#primary_color", action: "fill", label: "Primary colour of the chat widget" },
  { id: "widget.launcher", pages: ["/dashboard/widget"], selector: "#launcher_text", action: "fill", label: "Launcher text on the chat button" },
  { id: "widget.teaser", pages: ["/dashboard/widget"], selector: "#teaser_text", action: "fill", label: "Teaser bubble text" },
  { id: "widget.name", pages: ["/dashboard/widget"], selector: "#assistant_name", action: "fill", label: "Chatbot name" },
  { id: "widget.quick_replies", pages: ["/dashboard/widget"], selector: "#quick_replies", action: "fill", label: "Quick replies, one per line" },
  { id: "widget.whatsapp", pages: ["/dashboard/widget"], selector: "#whatsapp_link", action: "fill", label: "WhatsApp link" },
  { id: "widget.save", pages: ["/dashboard/widget"], selector: echo("widget.save"), action: "click", label: "Save appearance button" },

  // Staff
  { id: "staff.new_name", pages: ["/dashboard/staff"], selector: "#new-staff-name", action: "fill", label: "Name of a new person (Add someone)" },
  { id: "staff.new_role", pages: ["/dashboard/staff"], selector: "#new-staff-role", action: "fill", label: "Role of a new person (optional)" },
  { id: "staff.add", pages: ["/dashboard/staff"], selector: echo("staff.add"), action: "click", label: "Add button for a new person" },
  { id: "staff.open", pages: ["/dashboard/staff"], selector: echo("staff.open"), action: "click", label: "Edit on a person in the staff list (opens their page)", opens: "/dashboard/staff/*" },
  { id: "staff.time_off_from", pages: ["/dashboard/staff/*"], selector: "#from_date", action: "fill", label: "Time off From date" },
  { id: "staff.time_off_to", pages: ["/dashboard/staff/*"], selector: "#to_date", action: "fill", label: "Time off To date (optional)" },
  { id: "staff.time_off_reason", pages: ["/dashboard/staff/*"], selector: "#reason", action: "fill", label: "Time off Reason (only the owner sees it)" },
  { id: "staff.time_off_add", pages: ["/dashboard/staff/*"], selector: echo("staff.time_off_add"), action: "click", label: "Add time off button" },

  // Conversations
  { id: "conversations.open", pages: ["/dashboard/conversations", "/dashboard/conversations/*"], selector: echo("conversations.open"), action: "click", label: "A chat in the conversations list (opens it)", opens: "/dashboard/conversations/*" },
  { id: "conversations.reply", pages: ["/dashboard/conversations/*"], selector: echo("conversations.reply"), action: "fill", label: "Reply box in an open chat" },

  // Bookings
  ...(["upcoming", "calendar", "pending", "past", "cancelled"] as const).map(
    (tab): Target => ({
      id: `bookings.tab.${tab}`,
      pages: ["/dashboard/bookings"],
      selector: echo(`bookings.tab.${tab}`),
      action: "click",
      label: `${{ upcoming: "Upcoming", calendar: "Calendar", pending: "To approve", past: "Past", cancelled: "Cancelled" }[tab]} tab on Bookings`,
    }),
  ),
  { id: "bookings.open", pages: ["/dashboard/bookings"], selector: echo("bookings.open"), action: "click", label: "A booking in the Upcoming list (opens it)", opens: "/dashboard/bookings/*" },

  // Leads and customers
  { id: "leads.export", pages: ["/dashboard/leads"], selector: echo("leads.export"), action: "click", label: "Export CSV button" },
  { id: "customers.search", pages: ["/dashboard/customers"], selector: 'input[name="q"]', action: "fill", label: "Search customers box" },
];

export const TARGETS: Target[] = [...NAV_TARGETS, ...PAGE_TARGETS];

// Does a page pattern cover where they are? `here` may itself be a pattern
// ("/dashboard/staff/*") when it's where a click leads, not a real path.
export function onPage(pattern: string, here: string): boolean {
  if (pattern === "*" || pattern === here) return true;
  if (!pattern.endsWith("/*")) return false;
  const base = pattern.slice(0, -2);
  return here.startsWith(base + "/");
}

// The section a page belongs to, for plan gating: /dashboard/staff/* is Staff.
function sectionOf(pattern: string) {
  const path = pattern.replace(/\/\*$/, "/x");
  return GUIDE_PAGES.filter((p) => (p.href === "/dashboard" ? path === p.href : path === p.href || path.startsWith(p.href + "/"))).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

// Targets on pages this business can open.
export function targetsFor(features: Features): Target[] {
  const open = new Set(pagesFor(features).open.map((p) => p.href));
  return TARGETS.filter((t) => t.pages.some((p) => p === "*" ? open.has(t.opens!) : open.has(sectionOf(p)?.href ?? "")));
}

export function targetCatalogText(features: Features): string {
  return targetsFor(features)
    .map((t) => `- ${t.id} (${t.action === "click" ? "click" : "type/choose"}): ${t.label}`)
    .join("\n");
}

export type TourStep = { target: string; selector: string; action: TargetAction; say: string };

const MAX_STEPS = 12;

// Turns the model's steps into a walkthrough that works from where the owner
// is: unknown or off-plan targets are refused, and a step on another page
// gets the clicks that lead there first ("Services in the menu", "Edit on a
// person"), so the model can't skip one and leave the cursor stranded.
export function planTour(
  steps: { target: string; say: string }[],
  context: { pathname: string; features: Features },
): { ok: true; steps: TourStep[] } | { ok: false; error: string } {
  const allowed = new Map(targetsFor(context.features).map((t) => [t.id, t]));
  const unknown = steps.filter((s) => !allowed.has(s.target)).map((s) => s.target);
  if (unknown.length) return { ok: false, error: `Not targets you can use: ${unknown.join(", ")}. Use ids from the target list.` };

  const plan: TourStep[] = [];
  let here = context.pathname;
  const add = (t: Target, say: string) => {
    plan.push({ target: t.id, selector: t.selector, action: t.action, say });
    if (t.opens) here = t.opens;
  };
  const navTo = (page: string) => {
    const nav = TARGETS.find((t) => t.pages[0] === "*" && t.opens === page);
    if (nav) add(nav, `Click ${nav.label.replace(/ in the menu$/, "")} in the menu.`);
  };

  for (const step of steps) {
    const target = allowed.get(step.target)!;
    // A menu step to where they already are would just point at nothing new.
    if (target.pages[0] === "*" && target.opens && onPage(target.opens, here)) continue;
    if (!target.pages.some((p) => onPage(p, here))) {
      // A plain page: go there from the menu. A page under one ("/x/*"):
      // go to its list, then click what opens it.
      const plain = target.pages.find((p) => !p.endsWith("/*"));
      if (plain) navTo(plain);
      else {
        const opener = [...allowed.values()].find((t) => t.opens && target.pages.includes(t.opens) && !t.pages.includes("*"));
        if (!opener) return { ok: false, error: `There's no way to reach ${target.id} from here.` };
        const list = opener.pages.find((p) => !p.endsWith("/*"))!;
        if (!opener.pages.some((p) => onPage(p, here))) navTo(list);
        add(opener, `Click ${opener.label.replace(/ \(.*\)$/, "")}.`);
      }
    }
    add(target, step.say);
  }

  if (plan.length > MAX_STEPS) return { ok: false, error: `That's ${plan.length} steps; keep it to ${MAX_STEPS} or fewer.` };
  return { ok: true, steps: plan };
}
