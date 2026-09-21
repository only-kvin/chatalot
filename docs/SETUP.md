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

## Later phases (not yet configured)

Nothing outstanding for Phase 4 (bookings) yet.
