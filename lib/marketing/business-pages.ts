import { bookingChat, calloutChat, calloutRequestChat, type DemoChat } from "./demo-chat";

// Content for the /for/<group> and /for/<type> pages. Server-only in
// practice: the menus read the light list in business-types.ts instead, so
// this text never ships in the header's JavaScript. Slugs and names must
// match that list (tests/marketing-content.test.ts checks). Example
// businesses, names and prices in the sample chats are made up, and every
// highlight must be something the app does today.

import type { BusinessGroupSlug } from "./business-types";

export type BusinessTypePage = {
  slug: string;
  name: string;
  headline: string;
  chat: DemoChat;
};

export type Highlight = { title: string; text: string; href: string };

export type BusinessGroupPage = {
  slug: BusinessGroupSlug;
  name: string;
  headline: string;
  intro: string;
  // Trades book call-outs to the customer's address (arrival windows,
  // call-out fees, service areas) rather than salon-style appointments.
  kind: "appointments" | "callouts";
  problems: { title: string; text: string }[];
  highlights: Highlight[];
  types: BusinessTypePage[];
};

const BOOKING_HIGHLIGHTS: Highlight[] = [
  {
    title: "Answers while you're with a client",
    text: "Prices, hours and \"do you have a gap on Saturday?\", answered on your website and WhatsApp from your own information.",
    href: "/features/never-miss-a-customer#website-chat",
  },
  {
    title: "Books real free times",
    text: "With the right person, for the right service, with buffers between appointments, so your day never double-books.",
    href: "/features/fill-your-calendar#booking",
  },
  {
    title: "Reminders before every appointment",
    text: "A WhatsApp reminder the day before, and a private link to reschedule instead of not showing up.",
    href: "/features/fill-your-calendar#reminders",
  },
  {
    title: "Reviews after the visit",
    text: "Customers are asked how it went; low scores come to you first, and everyone gets your Google review link.",
    href: "/features/grow-and-keep-clients#reviews",
  },
  {
    title: "Leads you can follow up",
    text: "Interested but not ready to book? The AI takes their details, with permission, and emails you the lead.",
    href: "/features/grow-and-keep-clients#leads",
  },
  {
    title: "Booking on your own website",
    text: "Appointment and schedule widgets in your colours, or a hosted booking page if you don't have a site.",
    href: "/features/your-website-upgraded#widgets",
  },
];

export const BUSINESS_PAGES: BusinessGroupPage[] = [
  {
    slug: "beauty",
    name: "Beauty",
    headline: "Keep the chair full while your hands are busy",
    intro: "For salons, barbers and beauty studios: answer every \"how much?\" and \"are you free?\" without putting down the scissors. Mobile? Customers can book you to come to them too.",
    kind: "appointments",
    problems: [
      { title: "Messages arrive mid-appointment", text: "You can't reply with foils in someone's hair, and the person asking books somewhere that answered first." },
      { title: "Late-night price questions", text: "Most enquiries come after hours, when you're finally off your feet." },
      { title: "Empty slots from no-shows", text: "A missed appointment is time you can't sell again." },
    ],
    highlights: BOOKING_HIGHLIGHTS,
    types: [
      {
        slug: "hair-salon",
        name: "Hair salon",
        headline: "A receptionist for your hair salon that never misses a booking",
        chat: bookingChat({
          business: "Studio Lumière",
          ask: "Hi, how much is a cut and blow-dry? Could I come in on Friday?",
          answer: "A cut and blow-dry is R450 and takes about 45 minutes. On Friday I have 10:00 or 14:30 with Zanele. Which works?",
          time: "14:30",
          day: "Friday",
          customer: "Megan",
          what: "Cut & blow-dry",
          others: ["Full colour", "Men's cut"],
        }),
      },
      {
        slug: "barbershop",
        name: "Barbershop",
        headline: "Fill the barber's chair without picking up your phone",
        chat: bookingChat({
          business: "Sharp & Co",
          ask: "Can I get a fade with Tumi tomorrow?",
          answer: "Yes! A fade with Tumi is R180, about 30 minutes. Tomorrow he has 09:30 or 16:00. Which suits you?",
          time: "16:00",
          day: "Tomorrow",
          customer: "Kabelo",
          what: "Fade with Tumi",
          others: ["Beard trim", "Kids' cut"],
        }),
      },
      {
        slug: "nail-salon",
        name: "Nail salon",
        headline: "More manicures booked, fewer messages to answer",
        chat: bookingChat({
          business: "Polished",
          ask: "Hi, can I get a gel manicure on Saturday?",
          answer: "A gel manicure is R350 and takes about 45 minutes. On Saturday I have 10:00 or 13:30. Which suits you?",
          time: "10:00",
          day: "Saturday",
          customer: "Thandi",
          what: "Gel manicure",
          others: ["Pedicure", "Nail art"],
        }),
      },
      {
        slug: "lash-salon",
        name: "Lash salon",
        headline: "Lash bookings and infills, handled while you work",
        chat: bookingChat({
          business: "Lash Lounge",
          ask: "When can I come in for an infill? It's been 3 weeks",
          answer: "Perfect timing! An infill is R300, about an hour. This Thursday I have 11:00 or 15:00. Which works for you?",
          time: "11:00",
          day: "Thursday",
          customer: "Aisha",
          what: "Lash infill",
          others: ["Full set", "Lash lift"],
        }),
      },
      {
        slug: "hair-removal",
        name: "Hair removal",
        headline: "Answer the questions people are shy to ask, any time",
        chat: bookingChat({
          business: "Smooth Studio",
          ask: "How long does a full leg wax take? Can I book for next week?",
          answer: "A full leg wax takes about 45 minutes and is R380. Next Tuesday I have 12:00 or 17:30. Which suits you?",
          time: "17:30",
          day: "Tuesday",
          customer: "Nomsa",
          what: "Full leg wax",
          others: ["Brazilian", "Underarm"],
        }),
      },
    ],
  },
  {
    slug: "wellness",
    name: "Wellness",
    headline: "Calm for your clients, and for your front desk",
    intro: "For spas, therapists and practices: answer treatment questions and fill your rooms, without interrupting a session. Home visits work too: customers choose your place or theirs.",
    kind: "appointments",
    problems: [
      { title: "You can't answer mid-session", text: "A ringing phone breaks the calm, so enquiries wait, and some go elsewhere." },
      { title: "Treatment questions take time", text: "\"Which massage is best for back pain?\" needs a proper answer, not a missed call." },
      { title: "Gaps in the treatment book", text: "Late cancellations and forgotten appointments leave rooms empty." },
    ],
    highlights: BOOKING_HIGHLIGHTS,
    types: [
      {
        slug: "day-spa",
        name: "Day spa",
        headline: "Fill your treatment rooms, even while every room is busy",
        chat: bookingChat({
          business: "Serenity Day Spa",
          ask: "Do you have a couples massage on Sunday?",
          answer: "We do! A 60-minute couples massage is R1,400 for two. On Sunday I have 10:00 or 14:00. Which would you like?",
          time: "14:00",
          day: "Sunday",
          customer: "Lindiwe",
          what: "Couples massage",
          others: ["Facial", "Body wrap"],
        }),
      },
      {
        slug: "hotel-spa",
        name: "Hotel spa",
        headline: "Turn guests' questions into treatments booked",
        chat: bookingChat({
          business: "The Vineyard Spa",
          ask: "I'm staying at the hotel. Can I get a facial tomorrow afternoon?",
          answer: "Of course! Our signature facial is 60 minutes, R890. Tomorrow afternoon I have 13:00 or 16:00. Which suits you?",
          time: "16:00",
          day: "Tomorrow",
          customer: "James",
          what: "Signature facial",
          others: ["Hot stone massage", "Manicure"],
        }),
      },
      {
        slug: "massage",
        name: "Massage",
        headline: "Book massages without stopping one to answer the phone",
        chat: bookingChat({
          business: "Knead Massage",
          ask: "My lower back is tight. What do you recommend, and are you free on Wednesday?",
          answer: "A 60-minute deep tissue massage is a good fit, R650. On Wednesday I have 09:00 or 18:00. Which works?",
          time: "18:00",
          day: "Wednesday",
          customer: "Riaan",
          what: "Deep tissue, 60 min",
          others: ["Swedish massage", "Sports massage"],
        }),
      },
      {
        slug: "med-spa",
        name: "Med spa",
        headline: "Answer treatment questions carefully, and book consultations",
        chat: bookingChat({
          business: "Glow Aesthetics",
          ask: "Do I need a consultation before skin treatments?",
          answer: "Yes, we start with a 30-minute skin consultation, R250, which is deducted from your treatment. Friday I have 10:30 or 15:30. Which suits you?",
          time: "10:30",
          day: "Friday",
          customer: "Priya",
          what: "Skin consultation",
          others: ["Chemical peel", "Microneedling"],
        }),
      },
      {
        slug: "physiotherapy",
        name: "Physiotherapy",
        headline: "New patients booked in, while you treat the ones in front of you",
        chat: bookingChat({
          business: "Move Physio",
          ask: "I hurt my knee running. Can I see a physio this week?",
          answer: "Sorry to hear that! A first assessment is 45 minutes. On Thursday I have 08:00 or 13:00 with Sarah. Which suits you?",
          time: "08:00",
          day: "Thursday",
          customer: "Bongani",
          what: "First assessment",
          others: ["Follow-up", "Dry needling"],
        }),
      },
      {
        slug: "chiropractic",
        name: "Chiropractic",
        headline: "Keep adjustments booked and patients coming back",
        chat: bookingChat({
          business: "Align Chiropractic",
          ask: "Can I book a follow-up adjustment for Monday?",
          answer: "Yes! A follow-up is about 20 minutes. On Monday I have 07:30 or 12:30. Which works for you?",
          time: "07:30",
          day: "Monday",
          customer: "Hannah",
          what: "Follow-up adjustment",
          others: ["Initial consult", "Adjustment"],
        }),
      },
      {
        slug: "wellness-centre",
        name: "Wellness centre",
        headline: "One receptionist for every therapist in your centre",
        chat: bookingChat({
          business: "Harmony Wellness",
          ask: "Do you have reflexology on Saturday morning?",
          answer: "We do! Reflexology with Ayanda is 45 minutes, R420. On Saturday I have 09:00 or 11:30. Which suits you?",
          time: "09:00",
          day: "Saturday",
          customer: "Grace",
          what: "Reflexology",
          others: ["Acupuncture", "Yoga therapy"],
        }),
      },
    ],
  },
  {
    slug: "fitness",
    name: "Fitness",
    headline: "Answer every \"how do I join?\" while you're coaching",
    intro: "For gyms, studios and coaches: handle trial, class and membership questions on your website and WhatsApp, and fill your sessions.",
    kind: "appointments",
    problems: [
      { title: "Questions arrive mid-class", text: "You're on the floor coaching while prospects wait for a reply about trials and prices." },
      { title: "The same questions every day", text: "Times, prices, what to bring: answered again and again by hand." },
      { title: "Sessions that don't fill", text: "Spots go unbooked because people couldn't book when they were keen." },
    ],
    highlights: BOOKING_HIGHLIGHTS,
    types: [
      {
        slug: "gym",
        name: "Gym",
        headline: "Turn \"how much is membership?\" into a booked tour",
        chat: bookingChat({
          business: "Iron Works Gym",
          ask: "How much is membership? Can I come see the gym first?",
          answer: "Membership details are best covered in person. Book a free 20-minute tour: tomorrow I have 07:00 or 17:30. Which suits you?",
          time: "17:30",
          day: "Tomorrow",
          customer: "Sipho",
          what: "Gym tour",
          others: ["Induction", "PT session"],
        }),
      },
      {
        slug: "personal-training",
        name: "Personal training",
        headline: "Book clients in between sets, without touching your phone",
        chat: bookingChat({
          business: "Coach Dee PT",
          ask: "I want to start training. Do you do a first session?",
          answer: "Yes! A first session with Dee is 60 minutes, R450, including goals and a fitness check. Monday I have 06:00 or 18:00. Which works?",
          time: "06:00",
          day: "Monday",
          customer: "Chloe",
          what: "First PT session",
          others: ["PT session", "PT session"],
        }),
      },
      {
        slug: "yoga",
        name: "Yoga",
        headline: "Fill your mats while you teach",
        chat: bookingChat({
          business: "Breathe Yoga",
          ask: "Is there a beginners class this weekend?",
          answer: "There is! Beginners Flow is 60 minutes, R150 drop-in. On Saturday it runs at 08:00 and 10:00. Which would you like?",
          time: "08:00",
          day: "Saturday",
          customer: "Zoe",
          what: "Beginners Flow",
          others: ["Vinyasa", "Yin"],
        }),
      },
      {
        slug: "pilates",
        name: "Pilates",
        headline: "Reformer spots booked, without the back-and-forth",
        chat: bookingChat({
          business: "Core Pilates",
          ask: "Do you have a reformer class tomorrow?",
          answer: "Yes! Reformer classes are 50 minutes, R220. Tomorrow there are spots at 07:00 and 17:30. Which suits you?",
          time: "17:30",
          day: "Tomorrow",
          customer: "Ruth",
          what: "Reformer class",
          others: ["Mat Pilates", "Private session"],
        }),
      },
      {
        slug: "group-training",
        name: "Group training",
        headline: "Fill every session, and keep every spot accounted for",
        chat: bookingChat({
          business: "Squad Fitness",
          ask: "Can I join a bootcamp session this week?",
          answer: "Absolutely! Bootcamp is 45 minutes, R120 per session. Wednesday has spots at 06:00 and 17:45. Which works?",
          time: "06:00",
          day: "Wednesday",
          customer: "Thabo",
          what: "Bootcamp",
          others: ["HIIT", "Circuit"],
        }),
      },
      {
        slug: "martial-arts",
        name: "Martial arts",
        headline: "Trial classes booked while you're on the mat",
        chat: bookingChat({
          business: "Dojo Ubuntu",
          ask: "My son is 9. Can he try a karate class?",
          answer: "He'd be very welcome! Kids' karate is 45 minutes and the first class is free. Tuesday I have 15:30 or 16:30. Which suits you?",
          time: "15:30",
          day: "Tuesday",
          customer: "Ahmed",
          what: "Kids' trial class",
          others: ["Adults' class", "Grading"],
        }),
      },
      {
        slug: "dance-studio",
        name: "Dance studio",
        headline: "Answer every class question, and fill the floor",
        chat: bookingChat({
          business: "Rhythm Dance Studio",
          ask: "Do you have salsa for beginners?",
          answer: "We do! Beginner salsa is 60 minutes, R130. On Thursday there are spots at 18:00 and 19:15. Which would you like?",
          time: "19:15",
          day: "Thursday",
          customer: "Carla",
          what: "Beginner salsa",
          others: ["Hip hop", "Ballet"],
        }),
      },
      {
        slug: "sports-facility",
        name: "Sports facility",
        headline: "Courts and fields booked, without the phone tag",
        chat: bookingChat({
          business: "Arena Sports Centre",
          ask: "Can I book a padel court on Saturday?",
          answer: "Yes! Padel courts are R400 per hour. On Saturday I have 09:00 or 15:00. Which would you like?",
          time: "09:00",
          day: "Saturday",
          customer: "Marco",
          what: "Padel court, 1 hour",
          others: ["Squash court", "5-a-side field"],
        }),
      },
    ],
  },
  {
    slug: "trades",
    name: "Trades and home services",
    headline: "Never lose a job because you were on another one",
    intro: "For plumbers, electricians and home services: the AI answers while you're on a roof or under a sink, takes the address and books the call-out for you to confirm.",
    kind: "callouts",
    problems: [
      { title: "Missed calls while you're on a job", text: "You can't answer with your hands in a geyser, and the customer calls the next number on Google." },
      { title: "Quote requests lost in WhatsApp", text: "Requests sink under supplier and family chats, and never get a reply." },
      { title: "The same questions all day", text: "\"Do you work in my area?\" and \"Are you available today?\", answered by hand." },
    ],
    highlights: [
      {
        title: "Answers while you're on the job",
        text: "Areas you cover, callout fees and what you do, answered on your website and WhatsApp from your own information.",
        href: "/features/never-miss-a-customer#website-chat",
      },
      {
        title: "Request a call-out",
        text: "In chat, on WhatsApp or in your booking widget, customers give their address and pick a time. Requests wait for you to confirm.",
        href: "/features/fill-your-calendar#booking",
      },
      {
        title: "Arrival windows",
        text: "Offer \"between 08:00 and 10:00\" instead of an exact time, with travel time kept free either side so windows never double-book.",
        href: "/features/fill-your-calendar#booking",
      },
      {
        title: "Call-out fee shown upfront",
        text: "Customers hear your call-out fee before they book. Jobs you quote on site are never given a made-up price.",
        href: "/features/fill-your-calendar#booking",
      },
      {
        title: "Your service areas",
        text: "List the suburbs you cover. Requests from further out still come in, marked for you to check before you confirm.",
        href: "/features/fill-your-calendar#booking",
      },
      {
        title: "Urgent jobs straight to your phone",
        text: "A burst pipe on a Sunday skips the calendar: it's flagged urgent and sent to you by email, dashboard alert and WhatsApp.",
        href: "/features/never-miss-a-customer#takeover",
      },
    ],
    types: [
      {
        slug: "plumbers",
        name: "Plumbers",
        headline: "Book every geyser and leak call-out, even while you're on a job",
        chat: calloutRequestChat({
          business: "FlowFix Plumbing",
          ask: "My geyser's overflow pipe keeps dripping. Can someone come out tomorrow?",
          answer: "We can come tomorrow between 08:00 and 10:00 or between 12:00 and 14:00. It's quoted on site, and the call-out fee is R450, payable on arrival. Which window suits you?",
          reply: "08:00 to 10:00 please. Sipho, 082 555 0142, 14 Vale Ave, Randburg",
          confirm: "Thanks, Sipho. Call-out requested: tomorrow between 08:00 and 10:00 at 14 Vale Ave, Randburg. FlowFix will confirm shortly.",
          window: "08:00–10:00",
          customer: "Sipho",
          what: "Geyser overflow · Randburg",
        }),
      },
      {
        slug: "electricians",
        name: "Electricians",
        headline: "Take every callout request, even from the top of a ladder",
        chat: calloutChat({
          business: "Bright Spark Electrical",
          ask: "Half my plugs stopped working and the trip switch won't stay up",
          answer: "That needs an electrician to check safely, so please leave that circuit off for now. Can I take your name, number and suburb so we can call you back?",
          customer: "Anele",
          area: "Durbanville",
          what: "Tripping circuit · Durbanville",
        }),
      },
      {
        slug: "handymen",
        name: "Handymen",
        headline: "Every small job request captured, while you finish the last one",
        chat: calloutChat({
          business: "Handy Harry",
          ask: "Can you hang shelves and fix a sticking door?",
          answer: "Yes, we do both. Can I take your name, number and suburb so Harry can call to confirm a time and price?",
          customer: "Jess",
          area: "Rondebosch",
          what: "Shelves + door · Rondebosch",
        }),
      },
      {
        slug: "cleaners",
        name: "Cleaners",
        headline: "Quote requests answered while your team is cleaning",
        chat: calloutChat({
          business: "Sparkle Clean Co",
          ask: "How much for a move-out clean on a 2-bed flat?",
          answer: "Move-out cleans are quoted on the size and condition of the flat. Can I take your name, number and suburb so we can call you with a quote?",
          customer: "Kayla",
          area: "Sea Point",
          what: "Move-out clean · Sea Point",
        }),
      },
      {
        slug: "pest-control",
        name: "Pest control",
        headline: "Every urgent pest call answered, any time of day",
        chat: calloutChat({
          business: "Bug Off Pest Control",
          ask: "We have cockroaches in the kitchen. Do you service Midrand?",
          answer: "Yes, we cover Midrand. Can I take your name and number so we can call you to arrange an inspection?",
          customer: "Tshepo",
          area: "Midrand",
          what: "Cockroaches · Midrand",
        }),
      },
    ],
  },
  {
    slug: "clinics",
    name: "Clinics and professional services",
    headline: "A front desk that answers, even when yours is busy",
    intro: "For practices and consultants: answer common questions, book appointments and pass anything clinical or complex to a person.",
    kind: "appointments",
    problems: [
      { title: "A busy line at reception", text: "Patients can't get through while your front desk helps the person in front of them." },
      { title: "After-hours enquiries", text: "People look for appointments in the evening, when nobody is there to answer." },
      { title: "Missed appointments", text: "No-shows cost you a consultation slot you can't fill at short notice." },
    ],
    highlights: [
      {
        title: "Answers routine questions",
        text: "Hours, fees, what to bring and how to find you, answered from your own information. Anything it doesn't know, it hands to a person.",
        href: "/features/never-miss-a-customer#website-chat",
      },
      ...BOOKING_HIGHLIGHTS.slice(1, 3),
      {
        title: "A person when it matters",
        text: "Anything sensitive goes to your team: take over any conversation, and get alerted when someone asks for a person.",
        href: "/features/never-miss-a-customer#takeover",
      },
      ...BOOKING_HIGHLIGHTS.slice(4),
    ],
    types: [
      {
        slug: "dental-practice",
        name: "Dental practice",
        headline: "Fill check-up slots without tying up reception",
        chat: bookingChat({
          business: "Bright Smile Dental",
          ask: "I need a check-up and clean. Any time next week?",
          answer: "Of course! A check-up and clean takes about 45 minutes. Next Tuesday I have 08:30 or 14:00 with Dr Naidoo. Which suits you?",
          time: "14:00",
          day: "Tuesday",
          customer: "Michael",
          what: "Check-up & clean",
          others: ["Filling", "Consultation"],
        }),
      },
      {
        slug: "optometrist",
        name: "Optometrist",
        headline: "Eye tests booked, questions answered, any time",
        chat: bookingChat({
          business: "Clear View Optometrists",
          ask: "Can I book an eye test? I think I need new glasses",
          answer: "Happy to help! An eye test takes about 30 minutes. On Saturday I have 09:30 or 11:00. Which works for you?",
          time: "09:30",
          day: "Saturday",
          customer: "Fatima",
          what: "Eye test",
          others: ["Contact lens fitting", "Frame collection"],
        }),
      },
      {
        slug: "vet",
        name: "Vet",
        headline: "Appointments booked while you care for the animals in front of you",
        chat: bookingChat({
          business: "Paws & Claws Vet",
          ask: "My dog needs his annual vaccinations. When can we come in?",
          answer: "We'd love to see him! A vaccination visit is about 20 minutes. Tomorrow I have 10:00 or 16:30. Which suits you? For emergencies, please call us directly.",
          time: "16:30",
          day: "Tomorrow",
          customer: "Liam",
          what: "Vaccinations · Max (dog)",
          others: ["Sterilisation consult", "Check-up"],
        }),
      },
      {
        slug: "consultants",
        name: "Consultants",
        headline: "Discovery calls booked, without the email back-and-forth",
        chat: bookingChat({
          business: "Mokoena Advisory",
          ask: "I'd like to discuss tax planning for my small business",
          answer: "Thanks for reaching out! A 30-minute discovery call is free. On Thursday I have 10:00 or 15:00. Which suits you?",
          time: "10:00",
          day: "Thursday",
          customer: "Nadia",
          what: "Discovery call",
          others: ["Strategy session", "Review meeting"],
        }),
      },
    ],
  },
];

export function findBusinessPage(slug: string): { group: BusinessGroupPage; type?: BusinessTypePage } | undefined {
  for (const group of BUSINESS_PAGES) {
    if (group.slug === slug) return { group };
    const type = group.types.find((t) => t.slug === slug);
    if (type) return { group, type };
  }
  return undefined;
}
