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
  dayTitle: string;
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
};
