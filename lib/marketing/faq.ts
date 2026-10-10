import { BRAND_NAME } from "@/lib/brand";

// Questions buyers ask. Shared by the home page and /resources. Every answer
// must describe what the product does today.
export const FAQ: { q: string; a: string }[] = [
  {
    q: "How does the AI know about my business?",
    a: `You give it your services, prices, hours and policies in the dashboard, in plain language. It answers only from that, and when it doesn't know, it says so and offers to pass the customer to you.`,
  },
  {
    q: "Will it make up prices or promise times we don't have?",
    a: "No. It's instructed never to invent prices, availability or policies. Bookings come from your real calendar, so it can only offer times that are actually free.",
  },
  {
    q: "Can I take over a conversation?",
    a: "Yes, at any time. Tap \"Take over\" on a conversation and the AI steps back while you reply yourself. Customers can also ask for a person, and you get an alert.",
  },
  {
    q: "Does it work on WhatsApp?",
    a: `Yes. ${BRAND_NAME} connects to your WhatsApp Business number through Meta's official WhatsApp Cloud API, and answers there the same way it does on your website.`,
  },
  {
    q: "How do I add it to my website?",
    a: "Paste one line of code into your site, the same way you'd add analytics. It works on any website that lets you add a script, including WordPress, Wix and Squarespace sites. We can help you set it up.",
  },
  {
    q: "What about POPIA?",
    a: "The AI asks before saving anyone's details, and every customer record keeps a history of what they agreed to and when. You can delete a customer's data on request.",
  },
  {
    q: "What if I go to my customers instead?",
    a: "Plumbers, electricians and mobile services take call-out requests: customers give their address and choose an arrival window, see your call-out fee before they book, and you confirm each request. Fees are paid to you directly. Bookings are optional too: you can just capture jobs as leads.",
  },
];
