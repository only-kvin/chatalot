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

## Later phases (not yet configured)

- `RESEND_API_KEY` — Phase 2, lead email notifications
- `ENCRYPTION_KEY` — Phase 3, encrypting stored WhatsApp access tokens
- Meta developer app + WhatsApp Cloud API + Business verification — Phase 3 (`META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`)
