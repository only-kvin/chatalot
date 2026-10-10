# Setup

Manual steps the platform owner needs to do. Kept up to date as new phases add new services.

## Phase 0 — Foundation

1. **Vercel project**: linked to `cavinmashilangwako-gmailcoms-projects/chatalot`. CLI is already authenticated as you (`vercel whoami`), no login needed.

2. **Supabase project**: a dedicated project was created directly on supabase.com (not through the Vercel Marketplace, since that account's free-tier Marketplace slot was already used by another app). Project ref `bayncbpdxkoakrnidrkk`, region `eu-west-1` (Ireland). `vercel.json` pins Vercel Functions to `dub1` (Dublin) to sit next to it: every page makes several database calls in a row, and from Vercel's default `iad1` (Washington) each one cost ~340 ms. If the Supabase project ever moves region, move `regions` in `vercel.json` with it.
   - The 4 credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `POSTGRES_URL_NON_POOLING`) are set in Vercel's Environment Variables (Production/Preview/Development) and in local `.env.local`.
   - **Note**: the direct-connection hostname (`db.<ref>.supabase.co`) is IPv6-only unless you pay for Supabase's IPv4 add-on. If your network can't resolve it, use the **Session Pooler** connection string instead (Settings → Database → Connection string → URI tab), which is what `POSTGRES_URL_NON_POOLING` is actually set to here.

3. **Push schema migrations** (only needed again after adding new migration files):
   ```
   pnpm exec supabase db push --db-url "$POSTGRES_URL_NON_POOLING"
   ```
   (On Windows/bash, `set -a && source .env.local && set +a` first so the var is in the shell's environment.)

4. **Sign in once** at `/login` with your own email (`cavinmashilangwako@gmail.com`) to create your `auth.users` row — this has to happen before you can be made a platform admin.

5. **Grant yourself platform admin**:
   ```
   pnpm bootstrap-admin cavinmashilangwako@gmail.com
   ```

6. **Seed the demo tenant**:
   ```
   pnpm seed-demo-salon
   ```

7. **Run the RLS isolation test** (needs a populated `.env.local`):
   ```
   pnpm test
   ```

8. Visit `/admin` (as the platform admin) to create and view tenants.

## Phase 1 — Website widget MVP

1. **LLM provider — temporarily Groq, not Anthropic.** Anthropic has no free API tier (needs a paid credit top-up); Groq does. `GROQ_API_KEY` is set (console.groq.com). To switch to Anthropic later: add `ANTHROPIC_API_KEY` with some credit, then rewrite `lib/agent/model.ts`'s internals to call `@anthropic-ai/sdk` with `claude-haiku-4-5-20251001` instead of Groq's REST API — its exported `runAgentTurn()` signature is designed to stay the same, so nothing else in `lib/agent/` needs to change.
   - Model note: `llama-3.3-70b-versatile` was deprecated on Groq; currently using `openai/gpt-oss-120b`, which supports tool-calling reliably. If Groq deprecates this too, check `GET https://api.groq.com/openai/v1/models` for models with `"tools"` in `supported_features`.

2. **Voyage AI** (dash.voyageai.com): `VOYAGE_API_KEY` — free tier, powers embeddings for the knowledge base.
   - **Rate limit note**: without a payment method on file, Voyage throttles accounts to 3 requests/minute (separate from the free token allowance, which still applies either way — 200M free tokens for Voyage 3-series models). This is fine for normal usage (one embed call per knowledge item saved), but bulk re-embedding (e.g. `pnpm reembed-tenant`) will hit it — that script already retries with backoff. Add a payment method on the Voyage billing page if you want higher throughput; it won't change what you're actually charged within the free allowance.

3. **Upstash Redis**: provisioned via Vercel Marketplace (`vercel integration add upstash/upstash-kv`) — needed accepting Upstash's marketplace terms once in the browser first. Env vars are `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Marketplace naming), not `UPSTASH_REDIS_REST_*`.

4. **Build the widget bundle** (also runs automatically as part of `pnpm build`):
   ```
   pnpm build:widget
   ```
   Outputs `public/widget.js` (~3KB gzipped). Test it locally via `public/widget-demo.html` — replace `data-key` with a real tenant's `public_widget_key`.

5. Knowledge base items added via `/dashboard/knowledge` are automatically re-embedded on save. The Demo Salon items seeded in Phase 0 (before Voyage was set up) were backfilled via `pnpm reembed-tenant demo-salon` — use the same command for any tenant whose items predate their embeddings key.

## Phase 2 — Leads + dashboard

1. **Resend** (resend.com): `RESEND_API_KEY` — free tier. Sender is `onboarding@resend.dev` (Resend's shared test domain), which only delivers to *your own* Resend account's verified email until a real sending domain is configured and verified — fine for now since lead notifications go to the tenant owner, and in dev that's you. Swap the `FROM` constant in `lib/email/notify-lead.ts` once the platform has its own domain (still an open question from the original spec).
   - Not provisioned through the Vercel Marketplace — that flow requires a domain you already own to verify, which we don't have yet.

2. **Supabase's own auth emails now go through Resend's SMTP too** (Authentication → SMTP settings in the Supabase dashboard: host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender `onboarding@resend.dev`). This was necessary because Supabase's default mailer caps out at **2 emails/hour** without custom SMTP, which we hit almost immediately during dev. Custom SMTP removes that cap.

3. Lead notifications go to every `tenant_members` row with `role = 'owner'` for that tenant (looked up via `lib/db/tenant-owners.ts`). A tenant with no owner member yet (e.g. admin-created without an owner email) just silently gets no email — the lead is still saved either way.

4. Fixed during this phase: `lib/security/origin-check.ts` was rejecting requests with **no** `Origin` header at all, even in development — same-origin `fetch()` calls often omit it entirely, which broke the documented `widget-demo.html` local-testing flow (served from this same app). Now a missing Origin is allowed in dev, still rejected in production. Covered by `tests/origin-check.test.ts`.

## Phase 3 — WhatsApp

**Code status**: fully built and verified with synthetic signed payloads — signature verification, channel routing, encrypted token storage, dedup, the full agent pipeline (retrieval + tool calls + token tracking), and all three keyword behaviors (`human`/`agent` handoff + owner email, `STOP` pause) all confirmed working. The only untested piece is the actual outbound send, since that needs a real Meta access token — a test call against the real Graph API correctly got rejected for an invalid token, confirming the request shape itself is right.

**Still needed from you before this goes live** (per your spec's own "Setup, once for the platform" / "Per client" sections):

1. **Meta Business Portfolio + Developer App**: create at developers.facebook.com, add the WhatsApp product. This gives you `META_APP_SECRET` (Settings → Basic → App Secret) — replace the placeholder currently in `.env.local` with the real value, and add it to Vercel too (it was deliberately *not* added to Vercel yet, to avoid a fake-looking secret sitting in production env vars).

2. **Register the webhook URL** in the Meta app's WhatsApp → Configuration page: `https://<your-vercel-domain>/api/whatsapp/webhook`, verify token = the `WHATSAPP_VERIFY_TOKEN` already set (real value, not a placeholder — generated once and it's fine to keep). Subscribe to the `messages` field.

3. **Business Verification**: needed to go past Meta's test-mode limits and onboard real clients (per your spec's notes).

4. **Per client**: get them a number not already on the regular WhatsApp app, connect it in Meta (manually for now; Embedded Signup is a later nice-to-have), then go to `/admin/tenants/<tenant-id>` and enter its Phone Number ID + access token — stored encrypted (`ENCRYPTION_KEY`, already set) via `lib/security/crypto.ts`.

5. Once a real number is connected, test with a real WhatsApp message to it and check `/dashboard/conversations` for the `whatsapp`-channel entry.

**Gotchas found during the first live setup (2026-09-27)** — each one silently stops messages arriving:

- **Supabase Auth URL config**: Authentication → URL Configuration must have Site URL `https://chatalot.vercel.app` and Redirect URLs `https://chatalot.vercel.app/**` + `http://localhost:3000/**`. Otherwise magic links land on localhost.
- **Verify token**: paste the value *without* the quotes it has in `.env.local`. Callback URL must be `https://…/api/whatsapp/webhook` exactly — no trailing slash (a 308 redirect fails Meta's check).
- **Publish the app**: Meta delivers no real messages to an unpublished app. Publishing needs the Privacy Policy URL (`/privacy`), data deletion URL (`/data-deletion`), an icon and a category (App settings → Basic).
- **Phone Number ID, not the phone number**: the admin form wants Meta's digits-only ID (API Setup → "Phone number ID"), not `+1 555-…`. The form now rejects the latter.
- **System user needs the WhatsApp account assigned** (Business Settings → System users → Assign assets → WhatsApp accounts → Full control), not just the app.
- **Subscribe the app to the WhatsApp Business Account** — the step that finally made messages arrive. Subscribing the `messages` webhook field is not enough: the WABA itself must list your app in `subscribed_apps`. Check with `GET /{waba-id}/subscribed_apps`; if your app is missing, `POST /{waba-id}/subscribed_apps` with the system-user token (Graph API Explorer works).
- **Diagnosis**: no `POST /api/whatsapp/webhook` in Vercel logs = Meta isn't sending (publish / WABA subscription); `401` = wrong `META_APP_SECRET`; `200` but nothing in the dashboard = Phone Number ID doesn't match a channel.

## Phase 4 — Bookings

**Design notes** (not manual steps, but worth knowing before you configure anything):

- **Timezone is hardcoded to `Africa/Johannesburg`** (UTC+2, no DST) in `lib/agent/availability.ts` — every tenant is a South African business, so there's no per-tenant timezone column. If that ever changes, this is the one file to touch.
- **Capacity model is a single shared calendar per tenant**: one booking at a time across the whole business, regardless of service (enforced by a Postgres exclusion constraint on `bookings`, not just app logic). There's no staff/resource concept — if a tenant needs multiple concurrent bookings (e.g. several chairs), that's a bigger schema change, not configuration.

**Manual steps:**

1. **Push the new migration** (adds `services`, `availability_rules`, `availability_exceptions`, `bookings`, and the `btree_gist` extension):
   ```
   pnpm exec supabase db push --db-url "$POSTGRES_URL_NON_POOLING"
   ```

2. **`CRON_SECRET`**: generate one (see `.env.example`) and set it in Vercel's Environment Variables. Vercel Cron automatically sends it as `Authorization: Bearer <CRON_SECRET>` to routes listed in `vercel.json` — no extra wiring needed once the env var is set and the project is deployed. The daily cron (`/api/cron/daily` — booking reminders, then review requests) runs once a day there (06:00 UTC = 08:00 SA) — **Vercel's Hobby plan only allows daily cron schedules**, an hourly one fails the whole deploy outright. The route compensates by checking a 48h lookahead window instead of a narrow "~24h out" one, so a booking still gets a reminder attempt on each of the 1-2 daily runs before it happens, even with only one run a day. Upgrading to Pro would unlock finer-grained schedules if that's ever wanted.

3. **WhatsApp reminder template**: create and get approval for a **Utility** template named `booking_reminder` (English) in WhatsApp Manager → Message Templates, with three body variables in this order: customer name, service, date and time (e.g. "Hi {{1}}, a reminder of your {{2}} on {{3}}. Reply here if you need to change it."). How reminders go out (see `lib/bookings/reminders.ts`): a customer who replied STOP is skipped; one who messaged in the last 24 hours gets a normal WhatsApp message (works before the template is approved); otherwise the template is used. When none of that works, the booking history shows "Reminder not sent: <why>" and the owner gets one bell alert to call the customer. The daily run retries unsent reminders until the appointment is within the window.

   **STOP / START**: a customer replying STOP (or UNSUBSCRIBE / OPT OUT) is opted out of every message ChatAlot starts — reminders, booking notices from the dashboard, and later review requests and win-back — and the AI is paused for that chat. START (or SUBSCRIBE) undoes both. Both are confirmed to the customer. Opted-out customers are marked on the Customers page.

4. **WhatsApp review request template**: create a template named `review_request` (English) in WhatsApp Manager → Message Templates. Meta will most likely put it in the **Marketing** category (asking for a review isn't a transaction update); accept that. Four body variables in this order: customer name, business name, service, Google review link. The body must read exactly:

   ```
   Hi {{1}}, thanks for visiting {{2}}! How was your {{3}}? Reply with a number from 1 (poor) to 5 (great).

   If you have a moment, a Google review helps us a lot: {{4}}

   Thank you!
   ```

   (It must match `reviewRequestText()` in `lib/bookings/rating.ts`, which is also what's sent inside the 24h window.)

   Two more templates came with call-outs (2026-10-10): **`callout_reminder`** and **`urgent_alert`**. See "Call-outs and mobile services" below for their exact wording. Then, per business, paste their **Google review link** in Dashboard → Settings → Reviews (Google Business Profile → "Ask for reviews" → copy link). Review requests are off until that link is set.

   How it works (`lib/bookings/review-requests.ts`): each morning, bookings marked **Attended** in the last 3 days are asked once — skipped after STOP, a normal message inside the 24h window, else the template. It's never retried; if it can't go out, the booking history says "Review request not sent: <why>". A reply that is just a score ("5", "4/5", "⭐⭐⭐") within 7 days is saved on the booking (star rating on the Bookings pages) and thanked; 3 or below also alerts the owner (bell + email). **The Google link goes to every customer whatever their score** — Google forbids review gating, so never change the code to show it only to happy customers.

5. **Owner daily summary**: nothing to set up. The same daily cron then emails each business's owners at 08:00 SA with today's bookings (flagging any whose reminder couldn't go out), what needs them (chats waiting for a person, new leads, past bookings not yet marked Attended / No-show), and yesterday's numbers including ratings. Mornings with nothing to report are skipped, and it's sent at most once a day per business (`agent_configs.daily_summary_sent_on`). Owners turn it off in Dashboard → Settings → Daily summary. Like the other owner emails it goes through Resend, so until a sending domain is verified it only reaches your own Resend account's email (see Phase 2).

6. Once services and weekly availability are set up per-tenant (`/dashboard/services`, `/dashboard/availability`), the agent can offer real booking slots — test via `public/widget-demo.html` or a WhatsApp conversation by asking to book something.

## Reliability & safety hardening (2026-09-27)

**Manual step:**

1. **Push the new migration** (adds `conversations.last_inbound_at` for WhatsApp's 24-hour service window, backfilled from `last_message_at` for existing WhatsApp conversations):
   ```
   pnpm exec supabase db push --db-url "$POSTGRES_URL_NON_POOLING"
   ```
   Deploy *after* pushing — the WhatsApp webhook now writes this column, and would fail on every inbound message until it exists.

**Behaviour changes worth knowing:**

- **WhatsApp failures now hand off to a human.** If the AI times out or errors (or the reply can't be sent), the conversation is set to `human` and the owner gets the "human requested" email, so someone actually follows up. Hand it back to the AI from the conversation page once dealt with.
- **"Take over" mid-reply wins.** If the owner takes over while the AI is still generating a WhatsApp reply, that reply is discarded instead of sent.
- **Agent turns have a hard 20s deadline** (all model calls in the tool loop combined); past it the visitor gets the fallback reply with `handoff_contact`.
- **The widget restores the visitor's last 50 messages** on reload, via `GET /api/chat/history` (same origin check as the rest of the widget API).

## Widget suite, Phase A: shared booking layer (2026-10-07)

**Manual step:** none. The migrations (`booking_foundations`, `booking_block_defaults`, `private_schema_service_role`, `staff_services_staff_index`) are already applied to the dev project; for any other database, push them with `pnpm exec supabase db push` *before* deploying.

**What changed:**

- **One booking engine for everyone.** `lib/bookings/availability.ts` decides which times are bookable and `lib/bookings/create.ts` makes bookings; the AI tools, dashboard rescheduling and (from Phase C) the booking widgets all use them. Never put booking rules in widget code or prompt text.
- **Bookings are made by database functions** `create_booking()` / `reschedule_booking()`, which lock the business's calendar and re-check capacity, then write the booking, its lead and its history entry in one transaction. Two people taking the same slot at once get one booking and one "that slot was just taken". `tests/booking-concurrency.test.ts` proves it against the real database.
- **Staff (optional).** A business with no staff works as before: one calendar, one booking at a time. Once staff are added (`staff` table; dashboard screens come in Phase B), each person is their own calendar with their own hours (`availability_rules` rows with their `staff_id`, else the business's hours), time off (`time_off`) and capacity (`max_concurrent`: 1 for a chair, e.g. 12 for a class). Services can be limited to certain staff (`staff_services`; none linked = anyone). Bookings made before a business adds staff count against every staff member until reassigned, so nothing gets double-booked.
- **Booking settings per business** (`agent_configs`, editable in Phase B): `booking_lead_time_minutes` (default **60**: customers can no longer book a slot starting within the hour), `booking_horizon_days` (default 60) and `slot_minutes` (15/30/60, default 15). The team can still book or move bookings at short notice from the dashboard.
- **Service buffers** (`services.buffer_before_min` / `buffer_after_min`) keep time free around an appointment without lengthening it.

## Widget suite, Phase B: business setup in the dashboard (2026-10-07)

**Manual step:** none (no migration).

**What owners can now do:**

- **Staff** (`/dashboard/staff`, new in the nav): add people; set their role, photo link, how many bookings they take at once (1 for a chair, more for a class), the services they offer, their own working hours (several windows a day make a break) or "same as opening hours", and time off (whole days or part of a day). Reorder them with the arrows. Deactivating someone with upcoming bookings asks for a second click; those bookings stay with them until moved. Only people who never had a booking can be deleted.
- **Services**: category, time kept free before/after (buffers), "show in the booking widgets", display order, and who offers each one ("Anyone on the team", or only chosen people). A service with bookings can't be deleted, only made inactive.
- **Availability**: opening hours (Monday first), closures and special hours, and a new **Booking rules** card: minimum notice, how far ahead customers can book, slot size, and the chat change/cancel cutoff (moved here from Settings).
- **Bookings**: a Staff column and filter once staff exist (including "Not assigned"), and on an upcoming booking a "Staff member" picker to give it to someone else at the same time. That person must be working and free then. The customer isn't messaged; the history records it.

**Worth knowing:** a staff member's own hours *replace* the opening hours for them, so someone with Monday hours can be booked on a Monday even if the business is otherwise closed. Closures on the Availability page still close everyone.

## Widget suite, Phase C1: schedule widget server side (2026-10-07)

**Manual steps:**

1. **Migration** `schedule_widget` is already applied to the dev project (push it to any other database before deploying).
2. **Customer emails need a verified sending domain.** Booking confirmations, approvals, declines and cancellations now go to *customers* (when they give an email). Resend's shared sender (`onboarding@resend.dev`) only delivers to your own Resend account's address, so until a domain is verified customers receive nothing (owners' emails are unaffected). To fix: Resend → Domains → add e.g. `chatalot.co.za`, add the DNS records it shows (SPF, DKIM, optionally DMARC) at your DNS host, wait for "Verified", then change `FROM` in `lib/email/send.ts` to e.g. `ChatAlot <bookings@chatalot.co.za>`.

**What's new:**

- **Public widget API** (`/api/widget/config?widget=schedule`, `/api/public/services`, `/api/public/availability`, `/api/public/appointments`), all behind the business's widget key and allowed-domains check, rate-limited per IP and per key (`lib/security/rate-limit.ts`), with a hidden spam-trap field and a minimum fill time on bookings. Answers are validated against the business's *stored* form fields (`lib/widgets/fields.ts`), never a field list from the browser.
- **Booking approval** (Availability → Booking rules → "I approve bookings before they're confirmed"): bookings from the website and the AI arrive as *Awaiting approval*, holding their time; the owner gets a "Booking to approve" alert, and approves or declines on the booking (Bookings → To approve). The customer is emailed either way. The daily summary lists them.
- **Customer emails** (`lib/email/customer-booking.ts`) with the reference, an attached calendar file (`.ics`) and a **manage link** (`/b/<signed token>`, signed with a key derived from `ENCRYPTION_KEY`, valid until a month after the appointment) where the customer can cancel, within the business's change cutoff.
- **Dashboard → Widgets → Schedule**: the shared look (colours, roundness, font, light/dark), the schedule widget's wording, "let customers choose staff", the booking-form builder (name and mobile always; email, notes and custom questions optional) and the install snippet. The widget itself arrives in Phase C2.

## Widget suite, Phase C2: the schedule widget (2026-10-07)

**Manual step:** none. Businesses add the widget from Dashboard → Widgets → Schedule (copy the snippet).

**How it's put together:**

- `widget.js` is now a small **loader**: it starts the chat (unless the script tag has `data-chat="off"`) and mounts every `<div data-chatalot="schedule">` on the page, fetching that widget's own bundle (`/widgets/schedule.js`) only when the page has one. Existing installs keep working unchanged. `window.ChatAlot.scan()` mounts boxes added after the page loads (single-page sites). `data-mode="float"` on the box shows it as a launcher bubble instead.
- Both bundles are built by `scripts/build-widget.mjs` (part of `pnpm build`), which prints their gzipped sizes and **fails the build over 60 KB in total** (12.7 KB today).
- The widget (`widget/schedule/`) reuses the server's own pure code where it can (SA dates from `lib/time.ts`, phone checks, the `.ics` builder), takes all colours/roundness/font from the business's look via `--ca-*` CSS variables, and emits `chatalot:event` (`view`, `step`, `submitted`) as a DOM event and a window message for analytics.
- The dashboard's preview pages call the widget API from ChatAlot's own domain; `isOwnAppRequest()` (`lib/security/origin-check.ts`) lets those through without the business adding `chatalot.vercel.app` to its allowed domains.
- A booking's owner alert and customer email are sent after the response (`waitUntil`), so customers see their confirmation in about a second instead of six.

## Widget suite, Phase D: appointment widget, rescheduling, staff photos (2026-10-07)

**Manual step:** none. The `staff_photos` migration (a public Storage bucket) is already applied to the dev project.

**What's new:**

- **Appointment widget** (`<div data-chatalot="appointment">`, Dashboard → Widgets → Appointment): services first (grouped by category, with search from 9 services), then who (only people offering that service, with photos; "Any available" if the business allows it; skipped when there's no choice), then the same date-and-time picker as the schedule widget, then the customer's details. A step indicator and back arrow throughout; going back keeps what was chosen and typed. The confirmation names who the booking went to, and can add a "what happens next" line.
- **Shared booking pieces** (`widget/booking/`): the shell, the date-and-time picker, the details and confirmation steps are used by both widgets and the reschedule picker, so they can't drift apart.
- **Rescheduling from the email link**: the manage page (`/b/<token>`) has **Change time**, which loads the same picker (`/widgets/reschedule.js`) and moves the booking through `POST /api/public/reschedule`: an active booking, outside the change cutoff, to a genuinely free time (keeping the same person if they're free). The owner gets "Booking moved (using the link in their booking email)"; the customer gets a "Booking moved" email with the new calendar file.
- **Staff photos**: upload on the staff page (JPEG/PNG/WebP up to 2 MB, checked by the file's contents, not its name). Stored in the public `staff-photos` bucket under the business's own folder; replaced and deleted photos are removed. Server actions now accept bodies up to 3 MB (`next.config.ts`).
- `public/widget-demo.html?key=<public widget key>` loads any business's widgets locally.
- The widget preview page moved out of the dashboard layout (`app/(widget-preview)/`), so previews show just the widget.

## Widget suite, Phase E1: consent history and the contact widget (2026-10-07)

**Manual step:** none. The `contact_widget` migration is already applied to the dev project.

**What's new:**

- **Consent history** (`consents` table, `lib/contacts/consents.ts`): every yes or no a customer gives (booking notifications, marketing, newsletter), with where and when, appended and never edited, which is what a business needs to show under POPIA. `contacts.marketing_opt_in_at` mirrors the latest marketing answer for quick checks. Dashboard users can read it but not change it.
- **Contact widget** (`<div data-chatalot="contact">`, Dashboard → Widgets → Contact): the business's own fields (name and message always; an email or phone required so they can be answered; an optional subject list), optional and unticked "newsletter" and "events and promotions" boxes, the same spam checks and limits as bookings, and a thank-you with the expected response time. Each message becomes a contact message and a `contact_widget` lead, with a bell alert and owner email. The sender becomes a customer record only if they tick a consent box.
- **Messages** (new in the dashboard nav): an inbox of contact-form messages, New / All. Opening one marks it read; "Reply by email" (from the owner's own email, so it works without a verified sending domain) marks it replied. The daily summary counts unread ones.
- Form rules per widget live in `lib/widgets/fields.ts` (`FormKind`: booking, contact, registration); the dashboard's form builder adapts to each.

## Widget suite, Phase E2: registration and the customer's own page (2026-10-07)

**Manual step:** none. The `registration_widget` migration (`contacts.registered_at`) is already applied. As with all customer emails, the sign-up link only reaches real customers once a Resend sending domain is verified (see Phase C1).

**What's new:**

- **Registration widget** (`<div data-chatalot="registration">`, Dashboard → Widgets → Registration): sign up as a customer with no password. Name and email are always asked (the link goes by email), mobile optional, plus the business's own questions; a required "booking confirmations and reminders" consent and an optional, unticked "events and promotions" one. Signing up saves or updates the customer (never duplicated), records the consents, and emails a link to their own page. The answer is always "check your email", so the form can't reveal who is already a customer. An unticked box never withdraws an earlier yes. Optionally shows a "Book now" link to the business's booking page.
- **The customer's own page** (`/c/<signed token>`, link valid 30 days): their upcoming and recent bookings with that business, each with its change/cancel link, and newsletter / promotions switches; every change is added to the consent history. It only shows bookings made **with that email address**, so registering with someone else's phone number reveals nothing.
- **Customers in the dashboard** now show when they signed up on the website and their consent history.

## Widget suite, Phase F: the AI uses staff and sends booking links (2026-10-07)

**Manual step:** none. The `booking_page_url` migration is already applied.

**What's new:**

- **Staff in chat.** The AI's prompt lists who works here and what each person does (only when a business has staff). `check_availability` and `create_booking` take an optional staff name (full name, or a first name only one person has; ambiguous or unknown names are refused with the real list, never guessed). A person who doesn't offer the service is refused with who does. Booking results say who the booking is with, including who "anyone" went to; reschedule results too. With many open times, the AI is asked to offer 3 or 4 spread across the day.
- **Booking links.** New AI tool `send_booking_link` returns where a customer can book themselves, opening on a service when one is clear (`?ca_service=`): by default ChatAlot's hosted page **`/book/<business slug>`** (the business's appointment widget in its own look, with its name and phone; works for businesses without a website), or the business's own page if set in **Settings → Online booking page**. When the appointment widget is switched off, there's no link and the AI keeps booking in chat.
- Checked against the real model (Groq): it refused a person who doesn't do the service and offered who does, booked with the person asked for, and sent the link. The free Groq tier allows 8,000 tokens a minute, so several quick back-to-back turns hit its limit (the visitor then gets the fallback reply); a paid tier or the planned move to Claude Haiku removes that.

## Landing site, phase 2: home page, film, our own chatbot, /demo (2026-10-09)

The marketing site runs ChatAlot's own AI receptionist, set up exactly like a customer's. One-time steps:

1. **Create the ChatAlot tenant.** Run `pnpm seed-chatalot you+chatalot@gmail.com`. It creates (or refreshes) the tenant `chatalot` on the Pro plan with: product knowledge, a 30-minute **Demo call** service, Monday to Friday 09:00–17:00 hours, and `chatalot.vercel.app` as its allowed domain. The email becomes its owner, so its leads and alerts reach you. Use an address that isn't in another business yet (one sign-in sees one business for now); a Gmail `+chatalot` alias lands in your normal inbox. Re-running is safe: it replaces the knowledge and hours and updates the Demo call service in place.
2. **Embed its knowledge:** `pnpm reembed-tenant chatalot`.
3. **Set the widget key.** The seed prints `NEXT_PUBLIC_MARKETING_WIDGET_KEY=pk_…`. Add it to `.env.local` and to the Vercel project's environment variables (Production and Preview), then redeploy. Without it the site works, just with no chat, and `/demo` requests are only emailed.
4. **Custom domain later:** when the site moves to its own domain, update `lib/brand.ts` and add the new host to the tenant's allowed domains (Admin → Tenants → ChatAlot).

**What's new:**

- **Home page** (`app/(marketing)/page.tsx`): hero with the headline, a hero animation (a website chat in the chat widget's real styles, and the booking landing in the owner's day), the problem, a feature tour with small looping product moments, the 45-second film, business types, how it works, a pricing teaser, trust, FAQ and a closing call to action. Sections reveal once on scroll; with reduced motion everything is still.
- **Film:** `public/video/ad-45-landscape.mp4` and `ad-45-portrait.mp4` (copied from `../chatalot-ad/out/`) with poster stills from 0:15. Nothing loads until the visitor scrolls near it, and the video only when they press play. Re-export a film: copy the new file over, then `npx remotion ffmpeg -ss 15 -i <film> -frames:v 1 -q:v 4 <poster>.jpg` from the `chatalot-ad` folder.
- **`/demo` form:** saved as a lead (source `demo_form`) in the ChatAlot tenant, with a bell alert, and emailed to the platform admins. Zod validation, a POPIA consent tick, a honeypot, a 3-second minimum and 3 requests per 10 minutes per IP (Upstash).
- **Prices:** `lib/pricing.ts`. Every plan says "Contact us" until you fill in amounts.
- **"Start free trial"** buttons stay hidden until self-serve sign-up exists (`SIGNUP_OPEN` in `lib/marketing/site.ts`).

## Landing site, phase 3: feature, business-type, pricing and resources pages (2026-10-09)

No manual steps. All 41 new pages are built at deploy time from data files, so editing copy is a change to one file:

- **Features** (`/features`, `/features/<group>`): `lib/marketing/features.ts`. The Features menu, the home page tour and these pages all read it; menu links jump to each section's anchor.
- **Business types** (`/for/<group>`, 5 pages; changed 2026-10-10): names and slugs in `lib/marketing/business-types.ts` (menus, demo form); headlines, problems, highlights and each type's sample chat in `lib/marketing/business-pages.ts`. Each group page shows every kind of business in it as a section with its sample question and answer (anchor `#<type-slug>`). The per-type pages (`/for/plumbers`…) were removed as near-duplicates of their group page (thin content for SEO); `next.config.ts` redirects each one permanently (308) to `/for/<group>#<type>`, and the sitemap lists only the 5 groups. Add a separate type page back only with genuinely different content. Trades pages show call-out booking (since 2026-10-10, see "Call-outs and mobile services" below). `tests/marketing-content.test.ts` fails if the two files drift apart, a booking chat doesn't offer its own time, or any menu link points at a page that doesn't exist.
- **Pricing** (`/pricing`): plan contents from `lib/plans.ts`, amounts from `lib/pricing.ts` ("Contact us" while `null`).
- **Resources** (`/resources`, `/resources/<guide>`): guides in `lib/marketing/guides.ts`; FAQ in `lib/marketing/faq.ts`. Guides name real dashboard pages and buttons; update them when the dashboard changes.
- `sitemap.xml` lists every page from the same data (`lib/marketing/paths.ts`).

## Landing site, phase 4: self-serve sign-up with approval (2026-10-09)

1. **Migration** `supabase/migrations/20261009103305_self_serve_signup.sql` (adds the `pending` and `declined` tenant statuses, `tenants.business_type`/`approved_at`, the `signups` table and the `complete_signup()` function). Applied 2026-10-09.
2. **Check Supabase's email limit.** Sign-up confirmation links are Supabase Auth magic-link emails. Supabase's built-in email service only sends a handful per hour for the whole project (Authentication → Rate Limits), which is fine for staff logins but not for sign-ups. Before promoting `/signup`, set up custom SMTP (Authentication → Emails → SMTP Settings), e.g. Resend's SMTP once your sending domain is verified (the same domain work customer emails need).
3. **Supabase Auth URL config** must allow the redirect: `https://chatalot.vercel.app/**` is already there (and `http://localhost:3000/**` for local testing).

**How it works:**

- `/signup` (email, business name, business type, terms): Zod validation, a honeypot and 3-second check, and rate limits of 5 attempts per IP and 3 per email address an hour (Upstash). One trial per email: an address that already started a business, or already belongs to one, is told to sign in instead. An unconfirmed sign-up can be sent again.
- The magic link confirms the email and lands on `/signup/complete`, which calls `public.complete_signup()`: in one transaction it creates the business (status `pending`, plan `trial`, a slug from its name), its agent config and widget settings, and makes the person its owner. Trades start with call-out bookings on and a starter "Call-out" service (since 2026-10-10; see "Call-outs and mobile services"). Using the link twice opens the same business. Platform admins are emailed.
- **While pending** the owner can set everything up; the dashboard shows a "Waiting for approval" banner. Nothing is public: every public endpoint only serves `active` businesses (their own dashboard preview still works).
- **Admin → Waiting for approval** lists them with Approve and Decline. Approving makes the business `active` and emails the owner; declining shows them a "not approved" screen.
- The Overview shows a **Get set up** checklist (knowledge, hours, install the widget, test a chat) until every step is done.
- Tests: `tests/signup.test.ts` (real database).

## Website import (2026-10-09)

Businesses can import their own website into their knowledge base, so the AI answers questions the owner never typed in.

1. **Migration** `supabase/migrations/20261009110219_website_import.sql`: `knowledge_items` gains `source` (`manual`/`website`), `source_url`, `content_hash`, `excluded` and `gone_count`, plus the `page` type (website items are always `page`, never `info`, so a page is never forced into every prompt); new `website_imports` table (one active import per business); `match_chunks()` now skips excluded pages and returns each match's `source`, `source_url` and `title`. Applied 2026-10-09.
   - **Pushing migrations from a network without IPv6:** the direct host `db.<ref>.supabase.co` doesn't resolve, but the session pooler works: `pnpm exec supabase db push --db-url "postgresql://postgres.<project-ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"` (same password as `POSTGRES_URL_NON_POOLING`, URL-encoded).
2. **Optional: `FIRECRAWL_API_KEY`.** The crawler reads plain HTML. Sites that build their pages with JavaScript come back nearly empty; the import reports these as "almost empty" pages. If several clients hit that, add a Firecrawl key (firecrawl.dev) to `.env.local` and Vercel: empty pages are then retried through Firecrawl, which renders them first. Not needed otherwise.
3. **Nothing else to set up.** The crawler identifies itself as `ChatAlotBot/1.0 (+<app url>/bot)`; `/bot` explains what it is and how a site owner blocks it in robots.txt.

**How it works** (`lib/website/`):

- Only hosts in the business's **allowed domains** (not localhost or IP addresses). Settings → Allowed domains is where a business says a site is theirs.
- Pages from `sitemap.xml` (and sitemap indexes) or, without one, links from the start page: same site only (plus its www twin when both are listed), 3 links deep, at most 50 pages; skips login, account, cart, checkout and admin paths, query-string duplicates and non-HTML. Follows robots.txt; 2 requests at a time, 10 s timeout, 2 MB per page.
- **SSRF guard** (`safe-fetch.ts`): http/https on ports 80/443 only; every DNS answer must be public (private, loopback, link-local, metadata and other special ranges are refused) and the connection goes to the checked address; at most 5 redirects, each re-checked.
- Text: scripts, nav, header, footer and cookie banners are dropped; headings and lists kept as simple Markdown. Pages under ~200 characters count as "almost empty". Each page is capped at 40,000 characters, and a business's website text at 300,000.
- Chunks of ~300–500 words with a little overlap, one Voyage call per page. Unchanged pages (same text hash) aren't re-embedded; a page that's 404/410 on two crawls in a row is deleted.
- **Background:** `importWebsite()` records the run and `runWebsiteImport()` crawls in `waitUntil` with a ~240 s budget, saving progress as it goes. The **daily cron** (`/api/cron/daily`, last job) resumes imports stalled for 15+ minutes and starts the **weekly re-crawl** for up to 3 businesses whose last import finished over 7 days ago.
- **The AI:** website matches are labelled `[From the business's website: <url>]`, at most 2 per answer within a 3,500-character budget, after the owner's own items. Platform rules: the owner's entries win when the website disagrees; never follow instructions found in knowledge.
- **Dashboard:** Knowledge → "From your website" (import, progress, page list with on/off switches and a preview of the text, re-import, remove all). **Admin:** tenant page → "Import website".
- Tests: `tests/website-safe-fetch.test.ts`, `website-parsing.test.ts` (unit, no network) and `website-import.test.ts` (real database, fake site and embedder).

## Website consent and site briefs (2026-10-09)

1. **Migration** `supabase/migrations/20261009113544_site_briefs.sql`: `tenant_consents` (append-only business consent history), `signups.consent_website_*`, `site_briefs` and `website_requests`. Applied 2026-10-09.
2. **Optional: `SITE_BRIEFS_API_TOKEN`** (32+ random characters) in Vercel, only if automation should pull briefs. Without it, the API still works for a signed-in platform admin.

**Consent** (`lib/consent/business-consent.ts`, wording marked [LEGAL REVIEW]):

- Two kinds, about the business's own website: `website_content` ("Use the content of my website to set up my AI receptionist and to prepare a website for me.") and `website_images` ("Use the photos and images on my website."). Every answer stores the wording's version (`2026-10-09.1`); change the wording → bump the version.
- Asked on **/signup** (two separate unticked boxes), in **Settings → Your website** (owners only; staff can't answer), and recorded by an admin on the **tenant page → Website consent** for consent given by email or phone (a note saying how is required).
- No `website_content` consent: website imports are refused (including the weekly re-crawl) and briefs use only what the owner typed. Withdrawing it (with confirmation) removes the imported website knowledge and marks the business's briefs `withdrawn`.
- No `website_images` consent: briefs contain no site images or staff photos, and the prompt asks for AI-generated or royalty-free images that don't pretend to be real staff or customers.

**Site briefs** (`lib/site-brief/`):

- Made when the owner presses **Get a website brief** (Settings → Your website, shown once the set-up checklist is complete) or an admin presses **Generate brief** (tenant page). Each is a new version.
- Built from, in priority order: what the owner set up (services and prices, opening hours, staff, typed knowledge, colour: always wins), the imported website (with consent), and the business type. One model call (`runAgentTurn`, a `submit_profile` tool with a strict schema, validated with Zod; retried once on a rate limit) reads facts out of the owner's entries and the website text. Nothing is invented: prices come only from Services or the owner's own entries; anything not found goes to **Gaps**; where the website disagrees, the owner's value is kept and the disagreement goes to **Conflicts**. A website that plainly describes a different business is ignored entirely (listed as a conflict).
- The **Lovable prompt** is rendered from the profile by a fixed template: pages, real copy, brand, imagery, the business's ChatAlot widget snippets (only those its plan has on, with its key and the public domain from `lib/brand.ts`), must-haves (mobile, accessibility, POPIA privacy page, SA locale), must-nots (no invented reviews, stats, prices) and the gaps.
- **Stale briefs:** each brief stores a fingerprint of services, prices, hours and staff; Settings and the admin page say when the data has changed since.
- **Admin → Site briefs** (`/admin/site-briefs`): all briefs, filter by status, business type and number of gaps. Each brief: profile, prompt, gaps, conflicts, **Copy prompt**, **Download .md / .json**, and fields for status, Lovable project URL and live domain.
- **Owner:** Settings → Your website shows their latest brief (read-only), its status and "what we still need from you". **I'd like a new website** records a request and emails the platform admins (shown on the tenant page).

**Export API** (platform admins only: an admin session, or `Authorization: Bearer <SITE_BRIEFS_API_TOKEN>`):

- `GET /api/admin/site-briefs?status=ready&limit=100` → `{ exportVersion: 1, briefs: Brief[] }`, newest first.
- `GET /api/admin/site-briefs/<id>` → one `Brief`; `?format=md` downloads the prompt, `?format=json` the JSON.
- `Brief` (exportVersion 1): `{ exportVersion, id, tenant: { id, name, slug, businessType }, version, status, imagePolicy, dataSnapshotAt, profileSchemaVersion, profile, promptMarkdown, missing, conflicts, lovableProjectUrl, liveDomain, createdAt, updatedAt }`. `profile` follows `siteProfileSchema` in `lib/site-brief/profile.ts` (`profileSchemaVersion` 1). Changing either shape means bumping its version and noting it here.

**Replace website** (tenant page → Site brief): when a client's new site launches, enter its domain. It adds the domain to their allowed domains, removes the old site's imported knowledge (after a confirmation), imports the new site, and marks their latest brief `live` on that domain. Needs `website_content` consent.

Tests: `tests/site-brief-build.test.ts` (unit) and `tests/site-brief.test.ts` (real database, model and website mocked).

## Call-outs and mobile services (2026-10-10)

Bookings at the customer's address (plumbers, electricians, mobile barbers, home massage) through the same booking engine as salon appointments. **No payments:** fees are shown and agreed upfront, and paid to the business directly. Brief: `docs/CALLOUT_BRIEF.md`.

**Manual steps:**

1. **Migrations** (applied to the dev/live project 2026-10-10, through the session pooler):
   - `20261010090000_callouts.sql`: services `location` (business/customer/either), `price_type` (fixed/from/on_inspection), `callout_fee_cents`, `arrival_window_minutes`; agent_configs `service_areas`, `travel_buffer_minutes`, `cancellation_policy`, `callouts_confirm_instantly`, `emergency_callouts`, `emergency_note`; bookings `location`, `address_line`, `suburb`, `city`, `postal_code`, `access_notes`, `arrival_window_end`, `callout_fee_cents`, `outside_service_area` (+ a check that a customer booking has a street address and suburb); `urgent` on conversations and leads; the `urgent` notification type; `private.booking_block()`; new `create_booking()` (extra parameters all default, so older callers keep working), `reschedule_booking()`, the sync trigger, and `complete_signup()` for trades.
   - `20261010093000_owner_alert_phone.sql`: `agent_configs.owner_alert_phone` (the owner's own mobile for urgent WhatsApp alerts).
   - `20261010094000_business_address.sql`: `agent_configs.business_address` (shown on bookings at the business).
   - Deploy order doesn't matter for these: the database is backward compatible with the code before them.
2. **WhatsApp templates to submit** in WhatsApp Manager → Message Templates (English, **Utility**). Until each is approved, the fallbacks below keep things working.
   - **`callout_reminder`**, six body variables in this order: customer name, service, business name, when, address, fee-and-policy sentence. The body must read exactly:

     ```
     Hi {{1}}, a reminder that {{3}} is coming to you for your {{2}} on {{4}}, at {{5}}. {{6}} Reply here if you need to change it.
     ```

     Example values: `Sipho`, `Call-out`, `FlowFix Plumbing`, `Friday 16 October, between 08:00 and 10:00`, `12 Oak Street, Sandton`, `Call-out fee R450, payable to FlowFix Plumbing on arrival. Cancellation policy: 24 hours' notice please.` ({{6}} is "See you then." when there's no fee or policy, since a variable can't be empty.)
     **Fallback until approved:** call-outs get the existing `booking_reminder` template. Its {{3}} ("…your {{2}} on {{3}}") takes a window fine: "on Friday 16 October, between 08:00 and 10:00". That version has no address, fee or policy; the free-form reminder inside the 24-hour window always has them.
   - **`urgent_alert`**, three body variables: business name, the problem, the customer's name and phone. Suggested body:

     ```
     URGENT call-out for {{1}}: {{2}}. Customer: {{3}}. Open ChatAlot to reply.
     ```

     Sent to the owner's own mobile (Settings → Bookings → "Your mobile for WhatsApp alerts") when the AI reports an emergency. Inside the owner's 24-hour window (they've messaged the business number recently) a normal message goes instead. **Until approved:** the WhatsApp alert fails quietly (logged); the bell and the email still go out.
3. **Nothing else to set up per business beyond the dashboard:** Services (where it happens, price type, call-out fee, arrival window) and Settings → Bookings (address, service areas, travel time, cancellation policy, "Confirm call-outs instantly", emergency call-outs and note, owner's mobile).

**Switching an existing trades business to call-outs** (they're not changed automatically; trades that signed up before 2026-10-10 have bookings switched off):

1. **Admin → the tenant → Plan & features:** set Bookings back to the plan default (or "On"). In SQL: `update tenants set feature_overrides = feature_overrides - 'bookings' where id = '<tenant-id>';`
2. Tell the owner (or do it with them) to:
   - add a service under **Services** with "Where it happens: At the customer's address", price type (usually "Quoted on site"), the call-out fee and an arrival window (the starter for new sign-ups is "Call-out", 60 min, 2-hour window);
   - set their hours under **Availability**;
   - fill in **Settings → Bookings**: service areas, travel time (new trades get 30 min), cancellation policy, and emergency call-outs if they take them.
3. Call-outs then wait for the owner's approval unless they turn on "Confirm call-outs instantly". The Overview checklist shows "Add your call-out fee and service areas" until both are set.

**How it works:**

- **Where:** a service happens at the business, at the customer's, or either (the customer chooses: "At our place, or at yours?"). Customer bookings need a street address and suburb (city, postal code and access notes optional), enforced by the app and by a database check.
- **Calendar:** at the customer's, `travel_buffer_minutes` is added before and after, on top of the service's buffers. With an **arrival window** (e.g. 2 hours), customers pick windows aligned to the clock (08:00–10:00, 10:00–12:00, …) that fit inside working hours, and a booked window blocks from travel before it opens until the latest possible finish: window end + job + buffers + travel (approved rule, 2026-10-10). So the window can't be double-sold; with a 2-hour window, a 1-hour job and 30 min travel, one person takes up to three windows a day (08–10, 12–14, 16–18). Add staff for more. The same rule is in `private.booking_block()` (database) and `blockOffsets()` in `lib/bookings/availability.ts` (offered times); capacity is still checked under the per-business lock in `create_booking()`.
- **Service areas:** the customer's suburb (or city) is compared with the listed areas: case and spacing ignored, "Sandton" matches "Sandton, Johannesburg" either way round; a listed city covers suburbs when the customer gives that city. No paid geocoding. No match → it's still taken, marked **Outside listed area**, always waits for approval, and the customer is told the business will confirm whether it covers them. No areas listed = any address.
- **Approval:** call-outs are requests the owner approves (the existing Approve/Decline), whatever "Bookings need approval" says, unless "Confirm call-outs instantly" is on. Outside-area requests always wait.
- **Prices:** one helper (`lib/bookings/price-label.ts`, re-exported from `labels.ts`) words prices everywhere: "R350", "from R350", "Quoted on site · call-out fee R450", "Call-out fee R450, payable to <business> on arrival". The fee is **copied onto the booking** when it's made, so later price changes don't rewrite it (moving the booking keeps it too).
- **The AI:** `check_availability`/`create_booking` take `location` and the address fields. Platform rules: safety first, always (gas, sparking, flooding near electrics, anyone hurt → get to safety and call emergency services first; no repair instructions beyond basic safe steps in the business's own knowledge); never state a price for "quoted on site"; always state the call-out fee and window before asking to book; collect the address one question at a time; outside the area → take the request, don't refuse; mention the cancellation policy when confirming. The address only goes to the model inside the current conversation.
- **Emergencies** (Settings → Bookings → Emergency call-outs): the AI calls `report_emergency` instead of offering times. It marks the conversation and a new lead **urgent**, alerts the owner (bell, shown first and in red; email; WhatsApp to their mobile), and hands over (on WhatsApp the AI stops replying). It passes on only the owner's own emergency note ("we'll call within 30 minutes" only if they wrote it). An urgent chat never gets booking times. Conversations and Leads have an **Urgent** filter; "Mark handled" on the conversation clears its flag.
- **Customers see** (appointment and schedule widgets, `/book/<slug>`): a "Where?" step for either-place services, the address fields with the service-area message, windows as "08:00–10:00", price labels from the helper. **Confirmation emails, `/b/<token>`, `/c/<token>` and reminders** show the address, the window or time, the agreed call-out fee and the cancellation policy.
- **Owners see:** Bookings → **Day view** (call-outs in arrival order with address, **Open in Maps** (a plain Google Maps search link, no API key), access notes and fee); the address, window, fee and an "Outside listed area" badge on the list and booking page.
- **Widget sizes** (gzipped): appointment 12.5 → 14.3 KB, schedule 11.0 → 12.8 KB, reschedule 9.2 → 9.4 KB; all widgets 53.9 KB of the 60 KB budget.
- Tests: `tests/callouts.test.ts` (rules, labels, slot engine, prompt) and `tests/callouts-db.test.ts` (real database: address check, either-place, travel buffer, windows, areas, approval, agreed fee, emergency path, RLS on addresses, tenant filters); trades sign-up in `tests/signup.test.ts`.

**Not in this phase:** payments and deposits, quote requests with photos, route optimisation or maps APIs, travel fees by distance.

## Switchable AI provider and model comparison (2026-10-10)

The AI can run on any OpenAI-compatible provider, chosen with environment variables (Groq stays the default, so nothing changes unless you set them):

| Variable | Meaning |
|---|---|
| `LLM_PROVIDER` | `groq` (default), `gemini`, `openrouter` or `cerebras` |
| `LLM_MODEL` | Optional model override. Required for `openrouter` (e.g. `qwen/qwen3-235b-a22b:free`) |
| `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `CEREBRAS_API_KEY` | The key for that provider |

Defaults: Groq `openai/gpt-oss-120b`, Gemini `gemini-flash-latest`, Cerebras `gpt-oss-120b`. Provider details live in `lib/agent/providers.ts`.

**Compare models before switching:** `pnpm eval-models groq gemini` runs 22 scripted conversations (prices, hours, bookings with staff, rescheduling, off-topic requests, prompt injection, Afrikaans, safety) through the real prompt and tools with simulated tool results, so no database or real bookings are touched, and prints pass/fail per conversation plus a summary. Options: `--only=price,booking-complete`, `--delay=15` (seconds between conversations; free tiers have low per-minute limits), `--verbose`. A provider can be given as `provider:model`. Results vary between runs, so run it more than once before deciding.

**Privacy:** Gemini's free tier may use requests to improve Google's models. Use it for this comparison (made-up data only), never for real customers. To switch production, set `LLM_PROVIDER`/`LLM_MODEL` and the key in Vercel and redeploy.
