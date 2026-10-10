import { BRAND_DOMAIN, BRAND_NAME } from "@/lib/brand";

// Setup guides on /resources/<slug>. They describe the dashboard as it is:
// page names and buttons must match the app (app/(dashboard)/dashboard).

export type GuideStep = { title: string; text: string; points?: string[]; code?: string };

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  readMinutes: number;
  intro: string;
  steps: GuideStep[];
  // A closing tip or troubleshooting list.
  tips?: { title: string; points: string[] };
};

const SNIPPET = `<script src="https://${BRAND_DOMAIN}/widget.js" data-key="pk_your_key" async></script>`;

export const GUIDES: Guide[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "From sign-up to your first answered chat.",
    readMinutes: 5,
    intro: `${BRAND_NAME} works best when it knows your business well. This is the order we suggest; most businesses are done in an afternoon.`,
    steps: [
      {
        title: "Sign in",
        text: "After your demo we set up your business and you sign in with your email. There's no password: we email you a sign-in link each time.",
      },
      {
        title: "Tell it about your business",
        text: "Open Knowledge and add what customers ask about, in plain language. The AI answers only from this, so the more you add, the better it does.",
        points: [
          "Info: your hours, address and contact details. These are always included in every answer.",
          "Services: what you offer, prices and how long things take.",
          "Policies: cancellations, deposits, what to bring.",
          "FAQs: the questions you answer every day.",
        ],
      },
      {
        title: "Set its voice",
        text: "In Settings → Business info, choose a tone, write the greeting customers see first, and add a handoff contact for when a person is needed.",
      },
      {
        title: "Set up bookings (optional)",
        text: "Add your Services (and where each happens: at your place, at the customer's, or either), your Staff and their hours, and your opening hours and closures under Availability. Going to customers? Set your call-out fee on the service, and your service areas and travel time in Settings → Bookings.",
      },
      {
        title: "Make the chat yours",
        text: "In Widgets, pick your colour, which corner the chat sits in, the launcher text, a teaser message and quick-reply buttons. The preview updates as you go.",
      },
      {
        title: "Add it to your website",
        text: "Add your website's address under Settings → Allowed domains, then copy the install snippet from Widgets into your site.",
        code: SNIPPET,
      },
      {
        title: "Test it",
        text: "Open your website, ask the chat a few real questions, and check the conversation in Conversations. If an answer is wrong or missing, add or fix it in Knowledge; changes are used straight away.",
      },
    ],
    tips: {
      title: "Next",
      points: [
        "Connect your WhatsApp number so the same receptionist answers there too.",
        "Turn the daily summary email on or off in Settings.",
        "Add a Google review link in Settings → Reviews if you take bookings.",
      ],
    },
  },
  {
    slug: "install-widget",
    title: "Installing the widget",
    summary: "One line of code on any website.",
    readMinutes: 3,
    intro: "Everything on your website, the chat and any booking or contact widgets, runs from one script.",
    steps: [
      {
        title: "Allow your website",
        text: "In Settings → Allowed domains, list every address your site uses, one per line. Only these sites can load your widgets.",
        points: ["List both forms if your site uses them, e.g. example.co.za and www.example.co.za"],
      },
      {
        title: "Copy your snippet",
        text: "In Widgets, press \"Copy snippet\". It looks like this, with your own key:",
        code: SNIPPET,
      },
      {
        title: "Paste it into your site",
        text: "Add it once, on every page, just before the closing </body> tag or in your site's custom code setting.",
        points: [
          "WordPress: your theme's footer, or a plugin that adds code to the header or footer.",
          "Wix: Settings → Custom code. Wix only allows this on its paid plans.",
          "Squarespace: Settings → Advanced → Code injection, on plans that include it.",
          "A hand-built site: paste it into your page template.",
        ],
      },
      {
        title: "Place booking and contact widgets (optional)",
        text: "To show a widget inside a page, put its tag where you want it to appear. The same script loads it.",
        code: `<div data-chatalot="appointment"></div>`,
        points: ["The tags are \"schedule\", \"appointment\", \"contact\" and \"registration\". Each widget's tab in Widgets shows its tag, ready to copy."],
      },
    ],
    tips: {
      title: "If the chat doesn't appear",
      points: [
        "Check the exact address in your browser is in Allowed domains (with or without www).",
        "Make sure the snippet is on the page, not only in a draft or preview.",
        "Website chat must be included in your plan.",
      ],
    },
  },
  {
    slug: "connect-whatsapp",
    title: "Connecting WhatsApp",
    summary: "Put the AI on your business number.",
    readMinutes: 4,
    intro: `${BRAND_NAME} answers on WhatsApp through Meta's official WhatsApp Cloud API. We connect your number with you; here's what to have ready.`,
    steps: [
      {
        title: "Choose the number",
        text: "Use a number that isn't active on the WhatsApp or WhatsApp Business app. A number can only be used in one place, so a number on the app has to be removed from it first.",
      },
      {
        title: "Have a Meta business account",
        text: "Your WhatsApp number belongs to your business in Meta's systems, so you'll need a Meta business account (the one behind Facebook and Instagram business pages works).",
      },
      {
        title: "Pick your display name",
        text: "This is the name customers see in WhatsApp. Meta reviews it, so it should match your business's real name.",
      },
      {
        title: "We connect it",
        text: `We register the number with the WhatsApp Cloud API and link it to your ${BRAND_NAME} account. From then on, the AI answers there from the same knowledge as your website chat.`,
      },
    ],
    tips: {
      title: "Good to know",
      points: [
        "Replies are free-form within 24 hours of the customer's last message; after that, only Meta-approved templates can be sent, such as booking reminders.",
        "Customers can reply STOP to pause messages from you and START to resume.",
        "You can take over any WhatsApp conversation from Conversations, and hand it back to the AI when you're done.",
        "Promotional messages need the customer's opt-in; you'll find consent on each customer's record.",
      ],
    },
  },
];

export function findGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
