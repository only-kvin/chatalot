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

2. **`CRON_SECRET`**: generate one (see `.env.example`) and set it in Vercel's Environment Variables. Vercel Cron automatically sends it as `Authorization: Bearer <CRON_SECRET>` to routes listed in `vercel.json` — no extra wiring needed once the env var is set and the project is deployed. The reminder cron (`/api/cron/send-booking-reminders`) runs once daily there (06:00 UTC) — **Vercel's Hobby plan only allows daily cron schedules**, an hourly one fails the whole deploy outright. The route compensates by checking a 48h lookahead window instead of a narrow "~24h out" one, so a booking still gets a reminder attempt on each of the 1-2 daily runs before it happens, even with only one run a day. Upgrading to Pro would unlock finer-grained schedules if that's ever wanted.

3. **WhatsApp reminder template**: create and get approval for a **Utility** template named `booking_reminder` (English) in WhatsApp Manager → Message Templates, with three body variables in this order: customer name, service, date and time (e.g. "Hi {{1}}, a reminder of your {{2}} on {{3}}. Reply here if you need to change it."). How reminders go out (see `lib/bookings/reminders.ts`): a customer who replied STOP is skipped; one who messaged in the last 24 hours gets a normal WhatsApp message (works before the template is approved); otherwise the template is used. When none of that works, the booking history shows "Reminder not sent: <why>" and the owner gets one bell alert to call the customer. The daily run retries unsent reminders until the appointment is within the window.

   **STOP / START**: a customer replying STOP (or UNSUBSCRIBE / OPT OUT) is opted out of every message ChatAlot starts — reminders, booking notices from the dashboard, and later review requests and win-back — and the AI is paused for that chat. START (or SUBSCRIBE) undoes both. Both are confirmed to the customer. Opted-out customers are marked on the Customers page.

4. Once services and weekly availability are set up per-tenant (`/dashboard/services`, `/dashboard/availability`), the agent can offer real booking slots — test via `public/widget-demo.html` or a WhatsApp conversation by asking to book something.

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
