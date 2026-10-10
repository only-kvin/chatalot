# Call-outs and Mobile Services: Build Brief (one phase)

Make bookings work for businesses that go to the customer (plumbers, electricians, mobile barbers, home massage) as well as those the customer visits (salons, gyms), and for businesses that do both. **No payments in this phase:** fees are shown and agreed in advance, and paid to the business directly, outside ChatAlot.

Before writing code, read `CLAUDE.md`, `AGENTS.md` (this Next.js version differs from your training data: read the relevant guide in `node_modules/next/dist/docs/` first), and:
- `lib/bookings/` (availability, catalog, create, manage, reminders, labels)
- the `create_booking()` / `reschedule_booking()` database functions
- `widget/booking/` and `widget/appointment/`
- the AI booking tools in `lib/agent/tools.ts` and the rules in `lib/agent/prompt.ts`
- `lib/signup.ts` and the `complete_signup` function
- `lib/marketing/business-pages.ts` and `lib/marketing/business-types.ts`

Follow the migration, RLS-testing and deploy routine in `docs/SETUP.md`.

## What exists today

- A service has a name, description, duration, `price_cents`, and buffers before and after. Every booking assumes the customer comes to the business.
- Owner approval of bookings (`bookings_need_approval`), reminders, manage links and staff calendars already work.
- **Trades are treated as "no bookings":** sign-up sets `feature_overrides = {"bookings": "off"}` for `business_type = 'trades'`, and the trades marketing pages leave booking out. This phase changes both, so trades can take **call-out requests** through the same booking engine.

## Data model (one migration)

**`services`, add:**
- `location text not null default 'business'`, check (`business` | `customer` | `either`): where the service happens.
- `price_type text not null default 'fixed'`, check (`fixed` | `from` | `on_inspection`). `from` shows "from R…"; `on_inspection` shows "quoted on site" and the AI never states a price for it.
- `callout_fee_cents integer`, check `>= 0`, null = none. Only used when the service happens at the customer.
- `arrival_window_minutes integer`, null = exact start time; otherwise e.g. 120 for "between 08:00 and 10:00". Check between 30 and 480.

**`agent_configs`, add:**
- `service_areas text[] not null default '{}'`: the suburbs and towns the business covers, as the owner types them.
- `travel_buffer_minutes integer not null default 0`, check 0–240: added before and after every booking at the customer, on top of the service's own buffers.
- `cancellation_policy text not null default ''`: shown in confirmations, reminders and the AI's answers.
- `emergency_callouts boolean not null default false`, plus `emergency_note text not null default ''` (e.g. "24/7 emergency call-outs, R950 after hours").

**`bookings`, add:**
- `location text not null default 'business'`, check (`business` | `customer`): where *this* booking happens.
- `address_line text`, `suburb text`, `city text`, `postal_code text`, `access_notes text` (gate codes, parking): required when `location = 'customer'`, enforced with a check constraint.
- `arrival_window_end timestamptz`, null for exact-time bookings. `starts_at` stays the window start.
- `callout_fee_cents integer`: the fee **as agreed at booking time**, so later price changes don't rewrite it.

The address is personal information (POPIA). Only that business's staff see it (RLS as today). It's never sent to the AI model beyond the current conversation, and it's deleted with the booking and contact as usual.

## How booking works per service

| Service location | Customer is asked | Calendar blocks | Shown to the customer |
|---|---|---|---|
| `business` | nothing extra | as today | business address |
| `customer` | address, suburb (checked against `service_areas`), access notes | travel buffer + job, using the window rule below | call-out fee, arrival window or time |
| `either` | "Where would you like it: at our place, or at yours?" Choosing "at yours" adds the rows above | depends on the choice | depends on the choice |

**Arrival windows.** When `arrival_window_minutes` is set:
- Offered times are window starts aligned to the window length (08:00–10:00, 10:00–12:00…), shown as "08:00–10:00".
- **Before implementing, propose how a window booking should block the calendar** (e.g. the whole window plus the job duration plus travel, so the window can't be double-sold) with its trade-offs, and wait for my answer. Capacity per staff member keeps working through the existing locked check in `create_booking()`.

**Service area check.**
- Compare the customer's suburb or town with `service_areas`: case-insensitive, trimmed, and tolerant of "Sandton" vs "Sandton, Johannesburg". No paid geocoding.
- **If it doesn't match, don't refuse outright.** Take the details as a request marked "outside listed area", needing owner approval, and tell the customer the business will confirm whether they cover it.

**Call-outs default to "request, then confirm".** For `customer` bookings, use the existing approval flow regardless of `bookings_need_approval`, unless the owner turns on "Confirm call-outs instantly" in Settings.

**Price wording everywhere** (AI, widgets, emails, booking page) comes from one helper in `lib/bookings/labels.ts`:
- "R350"
- "from R350"
- "Quoted on site · call-out fee R450"
- "Call-out fee R450, payable to [business] on arrival"

## Emergencies

When `emergency_callouts` is on and the customer describes something urgent (burst pipe, no power, flooding, a blocked toilet on a Sunday):

- **Don't offer next week's slots.** Mark the conversation **urgent**, create a lead flagged urgent, and notify the owner immediately: notification bell, email, and WhatsApp to the owner's number if one is set up. Then hand over (`request_human`) with the emergency note ("A plumber will call you back within 30 minutes" only if the owner wrote that).
- **Safety first, always (even when emergency call-outs are off):** for gas smells, sparking or electrical burning, flooding near electricity, or anyone hurt, the AI tells the customer to get to safety and contact emergency services first, before anything else. It never gives repair instructions beyond basic safe steps the business's own knowledge provides (e.g. "switch off the geyser at the DB board").
- Add an `urgent` flag to conversations and leads, a filter for it in the dashboard, and make urgent items stand out in the notification bell.

## The AI

- `check_availability` and `create_booking` take `location` and the address fields. For `either` services the AI asks where. For `customer` services it collects address, suburb and access notes naturally (one question at a time), checks the service area, and states the call-out fee and the window before asking for consent to book.
- New platform rules in `prompt.ts`:
  - Never state a price for an `on_inspection` service. Say it's quoted on site and give the call-out fee.
  - Always mention the call-out fee before booking a call-out.
  - Mention the cancellation policy when confirming, if there is one.
  - The emergency and safety rules above.
- The existing "never invent prices, availability or policies" rule still applies to all of this.

## Widgets, booking page and messages

- **Appointment widget, schedule widget and the hosted `/book/<slug>` page:**
  - A "Where?" step for `either` services.
  - Address fields for `customer` bookings, with the service-area message.
  - Window times shown as "08:00–10:00".
  - Price labels from the shared helper.
  - Keep the bundle size in check: report the new gzipped sizes against the current ones.
- **Confirmation emails, the manage page (`/b/<token>`), the customer page and reminders:** the address, the window or time, the call-out fee and the cancellation policy.
- **WhatsApp reminder template:** the approved `booking_reminder` template has fixed variables. Check whether a window fits its time variable ("between 08:00 and 10:00"). If a new template is needed, add it as `callout_reminder` in the template list in `docs/SETUP.md`, and fall back to the existing one until it's approved.

## Dashboard

- **Services editor:** where it happens, price type, call-out fee, arrival window, with a live preview of the customer-facing price label.
- **Settings → Bookings:** service areas (chips input), travel buffer, cancellation policy, "Confirm call-outs instantly", emergency call-outs and note.
- **Bookings list and detail:**
  - The address with an **"Open in Maps"** link (a plain Google Maps search URL: no API key, no cost) and the access notes.
  - The window, the agreed call-out fee, and an "Outside listed area" badge.
  - A **day view that orders call-outs by time** so the owner can plan the route (no route optimisation in this phase).

## Trades: switch bookings back on

- **`complete_signup`:** stop setting `{"bookings": "off"}` for trades. Instead, for `business_type = 'trades'`, create the business with sensible defaults:
  - approval on for call-outs
  - travel buffer 30 minutes
  - one starter service, "Call-out" (location `customer`, price type `on_inspection`, 60 minutes, 120-minute arrival window, call-out fee left empty for the owner to fill in)
  - an onboarding checklist item: "Add your call-out fee and service areas"
- **Existing trades tenants are not changed automatically.** Add a note in `docs/SETUP.md` on how a platform admin switches one over.
- **Marketing pages (`business-pages.ts`, `business-types.ts`):** replace "leave out booking features" for trades with call-out features: request a call-out, arrival windows, call-out fee shown upfront, service areas, urgent jobs straight to your phone. Update the plumber sample conversation to end in a call-out request instead of only a callback. Only claim what this phase actually ships.
- Also, under Beauty and Wellness, mention that mobile services ("we come to you") are supported, without adding new business types.

## Tests (Vitest)

- A `customer` booking without an address is refused (the database check and the app validation). A `business` booking needs no address.
- `either` services: the chosen location is stored, and only "at yours" requires the address.
- Travel buffer applies only to customer bookings, and two call-outs can't be booked closer together than job + buffers.
- Window slots are aligned and labelled correctly, and a booked window isn't offered again (per the blocking rule you proposed and I approved).
- Service-area matching (case, spacing, "Suburb, City" forms). Outside the area → request with approval, never an instant booking.
- Call-outs need approval unless "Confirm call-outs instantly" is on.
- The agreed call-out fee is stored on the booking and doesn't change when the service's fee changes later.
- Price labels for every `price_type`, with and without a call-out fee. The AI prompt says `on_inspection` services have no stated price.
- The emergency path: urgent message → urgent lead and conversation, owner notified, handoff, no slots offered. The safety rule appears in the prompt even with emergency call-outs off.
- Trades sign-up creates bookings **on**, the starter "Call-out" service and the defaults. Other business types are unchanged.
- **Tenant isolation:** another tenant can't read booking addresses (RLS), and every new query filters by `tenant_id`.

## Docs and finish

- `docs/SETUP.md`: the migration, the new settings, the possible `callout_reminder` template, and how to switch an existing trades tenant to call-outs.
- Typecheck, lint, all tests, widget bundle sizes.
- Run it end to end on a test trades business: a call-out request through the AI on WhatsApp-style chat, one through the appointment widget with an out-of-area suburb, owner approval, the reminder, and the dashboard day view. Then show me screenshots at 390px and 1440px.
- Stop before committing.

## Not in this phase

Payments and deposits, quote requests with photos, route optimisation or maps APIs, and travel fees by distance.
