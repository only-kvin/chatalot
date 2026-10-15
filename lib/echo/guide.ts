import { FEATURE_INFO, FEATURES, type Feature, type Features } from "@/lib/plans";

// What ECHO, the in-app assistant, knows about the dashboard: one entry per
// page, written from the pages' real headings, field labels and tabs. ECHO
// answers "how do I..." from this, so when a page changes, change it here too
// (tests/echo.test.ts checks every page's href against the sidebar).

export type GuidePage = {
  href: string;
  title: string;
  // Gated pages, as in nav-items.ts.
  feature?: Feature;
  purpose: string;
  howTo: string[];
};

export const GUIDE_PAGES: GuidePage[] = [
  {
    href: "/dashboard",
    title: "Overview",
    purpose: "The home page: today's bookings, live conversations, new leads, the AI receptionist on/off switches and the \"Get set up\" checklist.",
    howTo: [
      "The \"Get set up\" checklist shows which setup steps are still to do; each step links to the page that does it.",
      "The AI receptionist panel switches the AI on or off for the website and WhatsApp.",
    ],
  },
  {
    href: "/dashboard/conversations",
    title: "Conversations",
    purpose: "Every chat the AI receptionist has had on the website and WhatsApp.",
    howTo: [
      "Filter with the tabs: All, Needs you, WhatsApp, Website.",
      "\"Needs you\" lists chats handed to a person; the sidebar shows how many.",
      "Open a chat to read it and reply yourself, which takes it over from the AI.",
    ],
  },
  {
    href: "/dashboard/messages",
    title: "Messages",
    feature: "contact_form",
    purpose: "What people sent through the contact form on the business's website.",
    howTo: ["Tabs: New and All. Open a message to read it and act on it."],
  },
  {
    href: "/dashboard/leads",
    title: "Leads",
    purpose: "People who shared their details with the AI because they were interested, with what they wanted.",
    howTo: ["Each lead has a status (new, contacted, booked, won, lost) you can update.", "Leads can be exported as CSV."],
  },
  {
    href: "/dashboard/customers",
    title: "Customers",
    purpose: "Everyone who has messaged on WhatsApp or left their details on the website, with their full history.",
    howTo: [
      "Open a customer to see Details, Conversations, Leads and Bookings.",
      "Edit their Name, Email and Notes under Details. A customer can also be deleted from there.",
      "A customer marked as having replied STOP gets no reminders or notices.",
    ],
  },
  {
    href: "/dashboard/bookings",
    title: "Bookings",
    feature: "bookings",
    purpose: "Every booking, how it was made, and every change since.",
    howTo: [
      "Tabs: Upcoming, Calendar, To approve, Past, Cancelled.",
      "Open a booking to see Customer, Where and History, and use Actions to approve, decline (with an optional message), reschedule (pick a New date) or cancel (with an optional reason sent to the customer).",
      "A booking can be assigned to a Staff member from its page.",
    ],
  },
  {
    href: "/dashboard/services",
    title: "Services",
    feature: "bookings",
    purpose: "What customers can book, how long it takes and who does it.",
    howTo: [
      "Each service has a Name, optional Category, Description, Duration (min) and optional Price (R), with a Price type.",
      "\"Free before\" and \"Free after\" (min) keep gaps around a booking.",
      "\"Where it happens\" sets whether it's at the business or the customer's address. Call-outs also have a Call-out fee (R) and an Arrival time, from an exact start time to a morning-or-afternoon window.",
    ],
  },
  {
    href: "/dashboard/staff",
    title: "Staff",
    feature: "bookings",
    purpose: "The people customers can book. Without any staff, the business takes one booking at a time.",
    howTo: [
      "Add someone with a Name and optional Role under \"Add someone\".",
      "Open a staff member to set their Photo, Details (incl. Bookings at the same time), Alerts and login, which Services they do, Working hours and Time off.",
      "Working hours work like the business's Opening hours: pick a Day, From and To, then press \"Add hours\".",
      "Time off: a From date, an optional To date, optionally only part of the day, and a Reason only the owner sees.",
    ],
  },
  {
    href: "/dashboard/availability",
    title: "Availability",
    feature: "bookings",
    purpose: "When customers can book, and the rules for booking.",
    howTo: [
      "Opening hours: the weekly hours customers can book in. Pick a Day, set From and To, then press \"Add hours\" (it saves straight away; there's no separate Save). Add a day twice for split hours, e.g. a lunch break. Each time listed has a × to remove it; a day with no hours shows as Closed.",
      "Closures and special hours: pick a Date. Leave \"Closed all day\" ticked to close that day, or untick it and set Special hours from and To. Then press Add. Each saved date has a Remove button.",
      "Booking rules: Minimum notice for new bookings, how far ahead customers can book, how often start times are offered, and how late customers can change or cancel in chat. Switch on \"I approve bookings before they're confirmed\" to approve each booking under Bookings > To approve. Press \"Save booking rules\" to keep changes.",
    ],
  },
  {
    href: "/dashboard/knowledge",
    title: "Knowledge",
    purpose: "The FAQs, services, prices and policies the AI receptionist answers customers from.",
    howTo: [
      "Add an item with a Type (FAQ, service, policy or info), a Title and the Content.",
      "The AI only knows what's here, so missing answers usually mean a missing item.",
      "The Website section can import content from the business's existing website.",
    ],
  },
  {
    href: "/dashboard/widget",
    title: "Widgets",
    purpose: "What customers see on the business's website: the chat widget and, depending on the plan, the Schedule, Appointment, Contact and Registration widgets.",
    howTo: [
      "Chat tab: Chatbot icon, Install snippet, and Appearance (Primary colour, Position, Launcher text, Teaser bubble, Chatbot name, Quick replies, WhatsApp link), with a Live preview.",
      "The other tabs each have \"Add it to your website\" with their snippet, and Look (Corner roundness, Font, Light or dark).",
      "To install, paste the snippet into the website and add the website's domain under Settings > Allowed domains.",
    ],
  },
  {
    href: "/dashboard/settings",
    title: "Settings",
    purpose: "The business's details and how the AI receptionist behaves.",
    howTo: [
      "Business info: Business name, Tone, Greeting, Extra instructions and Handoff contact for the AI.",
      "Bookings: Your address, Areas you cover for call-outs, Travel time, Cancellation policy, emergency handling and your mobile for WhatsApp alerts.",
      "Also: Online booking page, Reviews (Google review link), Daily summary, Allowed domains and Your website.",
    ],
  },
];

// Detail pages (/dashboard/bookings/123) belong to their section.
export function pageForPath(pathname: string): GuidePage | null {
  let best: GuidePage | null = null;
  for (const page of GUIDE_PAGES) {
    const matches = page.href === "/dashboard" ? pathname === page.href : pathname === page.href || pathname.startsWith(page.href + "/");
    if (matches && (!best || page.href.length > best.href.length)) best = page;
  }
  return best;
}

// The pages this business can open, and the ones on a higher plan. Hidden
// features aren't mentioned at all: the owner shouldn't know they exist.
export function pagesFor(features: Features): { open: GuidePage[]; locked: GuidePage[] } {
  const open: GuidePage[] = [];
  const locked: GuidePage[] = [];
  for (const page of GUIDE_PAGES) {
    const state = page.feature ? features[page.feature] : "on";
    if (state === "on") open.push(page);
    else if (state === "locked") locked.push(page);
  }
  return { open, locked };
}

const featuresIn = (features: Features, state: "on" | "locked") => FEATURES.filter((f) => features[f] === state);

export function guideText(features: Features): string {
  const { open } = pagesFor(features);
  const sections = open.map((p) => [`## ${p.title} (${p.href})`, p.purpose, ...p.howTo.map((h) => `- ${h}`)].join("\n"));
  // Every plan feature, including those without a page of their own (review
  // requests, WhatsApp...), so "can I...?" gets a straight answer.
  sections.push(
    ["## On this business's plan", ...featuresIn(features, "on").map((f) => `- ${FEATURE_INFO[f].title}: ${FEATURE_INFO[f].pitch}`)].join("\n"),
  );
  const locked = featuresIn(features, "locked");
  if (locked.length) {
    sections.push(
      [
        "## Not on this business's plan (they can upgrade)",
        ...locked.map((f) => `- ${FEATURE_INFO[f].title}: ${FEATURE_INFO[f].pitch} Upgrade page: /dashboard/upgrade/${f}`),
      ].join("\n"),
    );
  }
  return sections.join("\n\n");
}

// Where ECHO may send the owner: open pages, and upgrade pages for locked features.
export function allowedHrefs(features: Features): Set<string> {
  return new Set([...pagesFor(features).open.map((p) => p.href), ...featuresIn(features, "locked").map((f) => `/dashboard/upgrade/${f}`)]);
}
