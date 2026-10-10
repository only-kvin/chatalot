// The feature groups: the Features menu, the home page tour and the
// /features pages all read from here. Every point must describe something
// the app does today; if it isn't built, it isn't listed.

export type FeatureVisual = "takeover" | "reminder" | "grow" | "install";

export type FeatureSection = {
  // Also the anchor the menus link to: /features/<page>#<id>.
  id: string;
  // Short form for menus.
  label: string;
  title: string;
  text: string;
  points: string[];
};

export type FeaturePage = {
  slug: string;
  title: string;
  headline: string;
  intro: string;
  // One-paragraph summary for the home page tour.
  blurb: string;
  visual: FeatureVisual;
  sections: FeatureSection[];
};

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "never-miss-a-customer",
    title: "Never miss a customer",
    headline: "Every message answered, even at 21:47 on a Sunday",
    intro:
      "Your AI receptionist answers questions on your website and WhatsApp from your own information, any time of day. When a conversation needs you, you're one tap away.",
    blurb:
      "Your AI receptionist answers questions from your own information, on your website and on WhatsApp, at any hour. When it matters, you step in.",
    visual: "takeover",
    sections: [
      {
        id: "website-chat",
        label: "AI receptionist on your website",
        title: "An AI receptionist on your website",
        text: "A chat bubble on every page of your site that answers the way you would, using only what you've told it.",
        points: [
          "Answers from your knowledge base: services, prices, hours, policies and FAQs, in plain language",
          "Never invents prices, availability or policies; when it doesn't know, it says so and offers a person",
          "Stays on your business and politely declines unrelated requests",
          "Your colours, greeting, quick-reply buttons and an optional \"Chat on WhatsApp\" button",
          "The conversation picks up where it left off when a visitor comes back",
        ],
      },
      {
        id: "whatsapp",
        label: "WhatsApp replies",
        title: "Replies on WhatsApp",
        text: "The same receptionist on your WhatsApp Business number, through Meta's official WhatsApp Cloud API.",
        points: [
          "One knowledge base for your website and WhatsApp",
          "Customers can reply STOP to pause messages and START to resume",
          "Follows WhatsApp's rules: free-form replies within 24 hours of the customer's last message, approved templates after that",
        ],
      },
      {
        id: "takeover",
        label: "Human takeover when it matters",
        title: "A person when it matters",
        text: "You can step into any conversation, and customers can always ask for a person.",
        points: [
          "\"Take over\" pauses the AI on that conversation while you reply; \"Hand back to AI\" when you're done",
          "When a customer asks for a person, you get an email and an alert in your dashboard",
          "Conversations that need you are counted in your sidebar, so nothing slips",
        ],
      },
    ],
  },
  {
    slug: "fill-your-calendar",
    title: "Fill your calendar",
    headline: "Bookings that fill themselves, and show up",
    intro:
      "Customers book real free times, in chat or online, with the right person. Reminders go out before every appointment, and changing a time takes a tap.",
    blurb:
      "Customers pick a real free time with the right person, or the AI sends them your booking link. Reminders go out before every appointment.",
    visual: "reminder",
    sections: [
      {
        id: "booking",
        label: "Online booking with staff, services and hours",
        title: "Online booking built around how you work",
        text: "Your services, your team and your hours decide what customers can book, so double bookings don't happen.",
        points: [
          "Services with durations, prices and buffer time between appointments",
          "Staff with their own working hours, breaks, time off and the services they offer",
          "Opening hours, closures and holidays, plus how far ahead and how late people can book",
          "Capacity for group sessions, and optional approval before a booking is confirmed",
          "Call-outs to the customer's address: arrival windows, travel time, your service areas and the call-out fee shown upfront",
        ],
      },
      {
        id: "booking-links",
        label: "Booking links the AI sends",
        title: "The AI books, or sends the link",
        text: "In chat, the AI checks your real availability and books the customer in. Or it sends a link that opens your booking page on the right service.",
        points: [
          "Offers a few times spread across the day, with the person the customer asked for",
          "Refuses a person who doesn't offer that service, and suggests who does",
          "Your hosted booking page, or your own website's booking page",
        ],
      },
      {
        id: "reminders",
        label: "Reminders that cut no-shows",
        title: "Reminders that cut no-shows",
        text: "Customers get a WhatsApp reminder before their appointment, so fewer people forget.",
        points: [
          "Sent automatically the day before",
          "Uses an approved WhatsApp template when the 24-hour window has closed",
          "You're alerted if a reminder couldn't be sent",
        ],
      },
      {
        id: "rescheduling",
        label: "Rescheduling by link",
        title: "Rescheduling by link",
        text: "Every booking comes with a private link where the customer can change the time or cancel, within your rules.",
        points: [
          "Picks from your real free times, so changes never clash",
          "You're told about every change and cancellation",
        ],
      },
    ],
  },
  {
    slug: "grow-and-keep-clients",
    title: "Grow and keep clients",
    headline: "Turn conversations into customers who come back",
    intro:
      "Every enquiry becomes a lead you can follow up. After a visit, customers are asked for a review, and you see how your day went without opening the app.",
    blurb:
      "Every enquiry becomes a lead in your dashboard, with an email to you. After a visit, customers are asked for a review, and low scores come to you first.",
    visual: "grow",
    sections: [
      {
        id: "leads",
        label: "Lead capture with owner alerts",
        title: "Leads, captured and followed up",
        text: "When someone shows interest, the AI asks for their name and number, with their permission, and files a lead for you.",
        points: [
          "An email and a dashboard alert for every new lead",
          "Track each lead from New to Contacted, Booked, Won or Lost",
          "Export your leads as CSV at any time",
        ],
      },
      {
        id: "reviews",
        label: "Review requests and low-score alerts",
        title: "Review requests and low-score alerts",
        text: "After an appointment, customers are asked how it went.",
        points: [
          "Ratings from 1 to 5 are saved on the booking",
          "A low score alerts you straight away, so you can make it right",
          "Everyone gets your Google review link; no filtering out unhappy customers",
        ],
      },
      {
        id: "customers",
        label: "Customer records with POPIA consent history",
        title: "Customer records with consent history",
        text: "One record per customer, with their conversations, bookings and what they've agreed to.",
        points: [
          "A dated history of each consent: booking messages, newsletters, promotions",
          "Customers can manage their own choices from a private link",
          "Delete a customer's data when they ask",
        ],
      },
      {
        id: "daily-summary",
        label: "Daily summary for the owner",
        title: "A daily summary in your inbox",
        text: "One email a day with today's bookings, anything that needs your attention, and what happened yesterday.",
        points: ["Skips quiet days", "Switch it off in Settings whenever you like"],
      },
    ],
  },
  {
    slug: "your-website-upgraded",
    title: "Your website, upgraded",
    headline: "Booking and enquiries, built into your site",
    intro:
      "Add the chat and ready-made widgets to the website you already have, in your colours, with one line of code. No website yet? Use your hosted booking page.",
    blurb:
      "Add booking, contact and registration widgets in your colours, or use your hosted booking page. Installing takes one line of code.",
    visual: "install",
    sections: [
      {
        id: "widgets",
        label: "Branded widgets: schedule, appointment, contact, registration",
        title: "Branded widgets",
        text: "Ready-made widgets you place anywhere on your pages.",
        points: [
          "Schedule: customers pick a day on a month calendar, then a time",
          "Appointment: customers choose a service and a person first, then a time",
          "Contact: an enquiry form that files a lead and lands in your Messages",
          "Registration: customers sign up with your form, and choose what they hear from you",
          "Your colours, font, corner roundness, and light or dark mode; edit the form fields yourself",
        ],
      },
      {
        id: "booking-page",
        label: "Hosted booking page",
        title: "A hosted booking page",
        text: "A booking page with your name and number, ready to share on Instagram, Google or WhatsApp. No website needed.",
        points: ["The appointment widget in your look", "The link the AI sends when customers want to book themselves"],
      },
      {
        id: "install",
        label: "One-line install",
        title: "One line to install",
        text: "Paste one script into your site and every widget works from it.",
        points: [
          "Works on any website that lets you add a script, including WordPress, Wix and Squarespace sites",
          "Only the websites you list can load your widgets",
        ],
      },
    ],
  },
];

export function featurePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((p) => p.slug === slug);
}

// "/features/<page>#<section>" for a section id.
export function featureHref(sectionId: string): string {
  const page = FEATURE_PAGES.find((p) => p.sections.some((s) => s.id === sectionId));
  return page ? `/features/${page.slug}#${sectionId}` : "/features";
}
