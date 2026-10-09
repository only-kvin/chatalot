// A scripted conversation for the hero animation: a website visitor asks,
// the AI answers, and the result lands in the owner's day view. The home
// page uses DEFAULT_DEMO_CHAT; business-type pages pass their own.

export type DemoChat = {
  business: string;
  greeting: string;
  messages: { from: "visitor" | "ai"; text: string }[];
  // The booking that snaps into the owner's calendar at the end. For trades
  // it's a callout request instead.
  result: { time: string; customer: string; what: string; label: string };
  // Other entries already in the owner's day, around the new one.
  day: { time: string; customer: string; what: string }[];
  // Above the owner's list: "Saturday" over "Your day", or "Today" over
  // "New leads" for callout businesses.
  dayTitle: string;
  dayHeading: string;
};

export const DEFAULT_DEMO_CHAT: DemoChat = {
  business: "Glow Studio",
  greeting: "Hi! Welcome to Glow Studio. How can I help?",
  messages: [
    { from: "visitor", text: "Hi, can I get a gel manicure on Saturday?" },
    {
      from: "ai",
      text: "Yes! A gel manicure is R350 and takes about 45 minutes. On Saturday I have 10:00 or 13:30. Which suits you?",
    },
    { from: "visitor", text: "10:00 please. It's Thandi" },
    { from: "ai", text: "You're booked, Thandi: Saturday at 10:00. We'll send you a reminder the day before." },
  ],
  result: { time: "10:00", customer: "Thandi", what: "Gel manicure", label: "New booking" },
  day: [
    { time: "09:00", customer: "Lerato", what: "Pedicure" },
    { time: "11:00", customer: "Aisha", what: "Lash lift" },
    { time: "13:30", customer: "", what: "" },
  ],
  dayTitle: "Saturday",
  dayHeading: "Your day",
};

// Builders for the business-type pages, so each type only supplies what's
// specific to it.

const DEFAULT_DAY = [
  { time: "09:00", customer: "Lerato", what: "" },
  { time: "11:00", customer: "Aisha", what: "" },
  { time: "13:30", customer: "", what: "" },
];

// A booking: the visitor asks, the AI offers two times, they pick one.
export function bookingChat(o: {
  business: string;
  ask: string;
  // Must offer `time` (and usually one other).
  answer: string;
  time: string;
  day: string;
  customer: string;
  what: string;
  others?: [string, string];
}): DemoChat {
  const [a, b] = o.others ?? ["Pedicure", "Consultation"];
  return {
    business: o.business,
    greeting: `Hi! Welcome to ${o.business}. How can I help?`,
    messages: [
      { from: "visitor", text: o.ask },
      { from: "ai", text: o.answer },
      { from: "visitor", text: `${o.time} please. It's ${o.customer}` },
      { from: "ai", text: `You're booked, ${o.customer}: ${o.day} at ${o.time}. We'll send you a reminder the day before.` },
    ],
    result: { time: o.time, customer: o.customer, what: o.what, label: "New booking" },
    day: DEFAULT_DAY.map((d, i) => ({ ...d, what: d.customer ? (i === 0 ? a : b) : "" })),
    dayTitle: o.day,
    dayHeading: "Your day",
  };
}

// A callout: the visitor describes a job, the AI takes their details with
// permission, and the owner gets a lead to call back.
export function calloutChat(o: {
  business: string;
  ask: string;
  answer: string;
  customer: string;
  area: string;
  what: string;
}): DemoChat {
  return {
    business: o.business,
    greeting: `Hi! You've reached ${o.business}. How can we help?`,
    messages: [
      { from: "visitor", text: o.ask },
      { from: "ai", text: o.answer },
      { from: "visitor", text: `Yes. ${o.customer}, 082 555 0142, ${o.area}` },
      { from: "ai", text: `Thanks, ${o.customer}. I've passed this to the team, and they'll call you back to arrange a time.` },
    ],
    result: { time: "Now", customer: o.customer, what: o.what, label: "New lead" },
    day: [
      { time: "08:12", customer: "Pieter", what: "Quote request" },
      { time: "10:40", customer: "Naledi", what: "Callout · Soweto" },
    ],
    dayTitle: "Today",
    dayHeading: "New leads",
  };
}
