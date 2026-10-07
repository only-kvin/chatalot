# Setup

Manual steps the platform owner needs to do. Kept up to date as new phases add new services.

## Phase 0 — Foundation

1. **Vercel project**: linked to `cavinmashilangwako-gmailcoms-projects/chatalot`. CLI is already authenticated as you (`vercel whoami`), no login needed.

2. **Supabase project**: a dedicated project was created directly on supabase.com (not through the Vercel Marketplace, since that account's free-tier Marketplace slot was already used by another app). Project ref `bayncbpdxkoakrnidrkk`, region `eu-west-1` (Ireland).
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

   (It must match `reviewRequestText()` in `lib/bookings/rating.ts`, which is also what's sent inside the 24h window.) Then, per business, paste their **Google review link** in Dashboard → Settings → Reviews (Google Business Profile → "Ask for reviews" → copy link). Review requests are off until that link is set.

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
