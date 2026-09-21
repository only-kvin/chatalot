@AGENTS.md

# PROJECT SPEC

## Product

A multi-tenant SaaS that gives small South African service businesses (salons, clinics, trades, gyms) an AI receptionist on:

- their website, via a floating chat widget installed with one `<script>` tag, and
- their WhatsApp number, via the Meta WhatsApp Cloud API.

The AI answers questions from each business's own knowledge base, captures leads (name, phone, what they want), and notifies the owner. I (the platform owner) manage all clients from one admin dashboard. All clients share one codebase, one deployment and one database.

## Tech stack (do not substitute without asking)

- Next.js 15+ (App Router) + TypeScript (strict), deployed on Vercel
- Supabase: Postgres, Auth, Row Level Security, pgvector, Storage
- Anthropic SDK `@anthropic-ai/sdk`. Default model `claude-haiku-4-5-20251001`; optional premium model `claude-sonnet-5`, chosen per tenant in `agent_configs.model`
  - **Temporary deviation (approved 2026-09-21):** Anthropic has no free API tier, so `lib/agent/model.ts` currently calls Groq (`openai/gpt-oss-120b`, free tier) instead, behind a provider-neutral interface (`runAgentTurn`) that the rest of `lib/agent/` doesn't know about. Swap `model.ts`'s internals back to `@anthropic-ai/sdk` once `ANTHROPIC_API_KEY` has billing set up — see `docs/SETUP.md`.
- Embeddings: Voyage AI (`voyage-3.5-lite`, 1024 dims) behind an `embed()` interface so it can be swapped
- Tailwind CSS + shadcn/ui for the dashboard
- Widget: vanilla TypeScript bundled with esbuild into a single `public/widget.js` (no React), rendered in a Shadow DOM, target < 30 KB gzipped
- Upstash Redis for rate limiting; Resend for email; Zod for validation; Vitest for tests
- Background work: `waitUntil` from `@vercel/functions` (keep an interface so Inngest can replace it later)

## Repo layout

```
/app
  /(dashboard)/dashboard/...     client dashboard (conversations, leads, knowledge, widget settings)
  /(admin)/admin/...             super-admin (tenants, usage)
  /api/chat/route.ts             widget chat endpoint (SSE streaming)
  /api/widget/config/route.ts    public widget config by key
  /api/whatsapp/webhook/route.ts Meta webhook (GET verify + POST messages)
/lib
  /agent/                        engine.ts, prompt.ts, tools.ts, retrieval.ts
  /channels/                     web.ts, whatsapp.ts (send/receive helpers)
  /db/                           supabase clients (server, service-role, browser), typed queries
  /security/                     rate-limit.ts, origin-check.ts, crypto.ts, meta-signature.ts
/widget                          widget source (TS) + esbuild config -> /public/widget.js
/supabase/migrations             SQL migrations incl. RLS policies
/tests                           vitest tests
```

## Data model (every table except tenants has `tenant_id uuid not null` + RLS)

- `tenants` (id, name, slug, plan, status, public_widget_key unique, allowed_domains text[], created_at)
- `tenant_members` (tenant_id, user_id -> auth.users, role: owner|staff). Separate `platform_admins(user_id)` table for me.
- `agent_configs` (tenant_id unique, business_name, tone, greeting, system_prompt_extra, lead_fields jsonb, handoff_contact, model, daily_message_cap)
- `widget_settings` (tenant_id unique, primary_color, position: bottom-right|bottom-left, avatar_url, launcher_text, teaser_text, quick_replies jsonb, whatsapp_link)
- `knowledge_items` (id, tenant_id, type: faq|service|policy|info, title, content, updated_at)
- `knowledge_chunks` (id, tenant_id, item_id, content, embedding vector(1024)) + ivfflat/hnsw index + `match_chunks(tenant_id, query_embedding, k)` SQL function
- `channels` (id, tenant_id, type: web|whatsapp, wa_phone_number_id unique, wa_access_token_encrypted, status)
- `contacts` (id, tenant_id, name, phone, email, consent_at)
- `conversations` (id, tenant_id, channel, external_id, contact_id, status: ai|human|closed, last_message_at) unique(tenant_id, channel, external_id)
- `messages` (id, conversation_id, tenant_id, role: user|assistant|tool, content, tokens_in, tokens_out, created_at)
- `leads` (id, tenant_id, conversation_id, contact_id, name, phone, email, interest, summary, status: new|contacted|booked|won|lost, source, created_at)
- `processed_events` (provider_message_id primary key) for webhook de-duplication
- View `usage_daily` (tenant_id, day, messages, tokens_in, tokens_out)

RLS: dashboard users can only access rows where `tenant_id` is in their `tenant_members`; platform admins can access all. The widget and WhatsApp webhook never use the anon key — they call API routes that use the service-role client and resolve the tenant server-side.

## Agent engine (`lib/agent/engine.ts`)

`runAgent({ tenantId, conversationId, userMessage, channel })`:

1. Load `agent_configs`, last 10 messages, and top 6 knowledge chunks by similarity (plus always-included items of type `info`: hours, address, contact).
2. Build the system prompt in three layers: platform rules (constant, in `prompt.ts`), tenant layer, retrieved knowledge. Use prompt caching (`cache_control`) on the platform + tenant layers.
3. Platform rules must say: you are the receptionist for `{business_name}` only; answer only from the provided knowledge; never invent prices, availability or policies; refuse unrelated tasks (general knowledge, coding, essays) politely and steer back to the business — this is required by WhatsApp's policy on general-purpose AI; keep replies under ~80 words; ask for name + phone naturally once the visitor shows interest; ask consent before saving details (POPIA); offer a human handoff when asked or unsure.
4. Tools: `save_lead(name, phone, email?, interest, summary)`, `request_human(reason)`. Execute tool calls in a loop (max 3 iterations), always scoped to the current tenant.
5. Enforce `max_tokens: 400`, a 20s timeout, and a friendly fallback reply containing `handoff_contact` on any error.
6. Persist user/assistant messages with token counts. Return a stream for web, full text for WhatsApp.

## Widget (`/widget` -> `public/widget.js`)

- Installed with `<script src="https://<domain>/widget.js" data-key="pk_..." async></script>`.
- Fetches `/api/widget/config?key=` then renders a floating launcher (position/colour/avatar from config) and an optional teaser bubble.
- Click toggles a chat panel (380x600 desktop, full-screen on mobile < 640px) with header, messages, input, close button, quick-reply chips, optional "Chat on WhatsApp" button.
- Session id in localStorage; history restored on reload.
- Streams replies via SSE from `POST /api/chat`.
- Exposes `window.AIReceptionist = { open, close, sendMessage }`.
- Accessible: focus trap in panel, Esc closes, aria labels, respects `prefers-reduced-motion`.
- Include `/public/widget-demo.html` that loads the widget for local testing.

## Chat API security

- Validate body with Zod; look up tenant by `public_widget_key`; reject if tenant inactive.
- Check `Origin` header against `allowed_domains` (allow localhost in development).
- Rate limit: 20 messages / 10 min per session, 60 / 10 min per IP, plus tenant `daily_message_cap`.
- CORS headers only for allowed origins.

## WhatsApp (`/api/whatsapp/webhook`)

- GET: respond to Meta's `hub.challenge` when `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`.
- POST: verify `X-Hub-Signature-256` with `META_APP_SECRET`; return 200 immediately; process in `waitUntil`.
- Map `metadata.phone_number_id` -> `channels` -> tenant. De-duplicate via `processed_events`.
- Conversation keyed by customer phone (`external_id`). If conversation status is `human`, don't run the AI.
- Send replies with the Graph API `/{phone_number_id}/messages` (text type, one message per reply). Track the 24-hour window from the customer's last inbound message; outside it only templates may be sent (implement a `sendTemplate` helper, unused in v1).
- Keywords "human", "agent" set status to `human` and notify the owner; "STOP" pauses the AI.

## Dashboards

- Client dashboard: Conversations (list + transcript, "take over" toggle), Leads (table, status dropdown, CSV export), Knowledge (CRUD items; re-embed on save), Widget (settings with live preview + copy-snippet button), Settings (business info, allowed domains).
- Admin (`platform_admins` only): Tenants (create/edit, generate widget key, suspend), Usage (messages + estimated cost per tenant per month).

## Build phases (stop after each)

- **Phase 0 – Foundation**: Next.js scaffold, Supabase migrations + RLS, auth (email magic link), platform admin can create a tenant, seed script creating "Demo Salon" with sample knowledge. Test: tenant A user cannot read tenant B rows.
- **Phase 1 – Website widget MVP**: agent engine, retrieval, `/api/chat` streaming, widget bundle + demo page, knowledge editor, rate limiting + origin check.
- **Phase 2 – Leads + dashboard**: `save_lead` + `request_human` tools, Resend email to owner on new lead, leads + conversations pages, usage view.
- **Phase 3 – WhatsApp**: webhook, signature verification, background processing, send helper, human takeover, channel setup form in admin.
- **Phase 4 – Bookings (later)**: services, availability rules, `check_availability`/`create_booking` tools, reminder templates.
- **Phase 5 – Lead-generation CRM (future, do not build unless asked)**: pipeline board, lead magnets, multi-source capture, opt-in WhatsApp follow-ups, reporting.

## Environment variables (`.env.example`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `ENCRYPTION_KEY`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `NEXT_PUBLIC_APP_URL`

Note: the Supabase Vercel Marketplace integration actually injects `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` under Supabase's newer API-key naming (functionally equivalent to the anon/service-role names above). Code targets the real injected names; see `.env.example` for the authoritative list.

## Conventions

- TypeScript strict, no `any`. Zod at every API boundary.
- Every DB query in server code filters by `tenant_id` explicitly, even with RLS.
- Small, focused files; explain non-obvious code with short comments.
- Write Vitest tests for: RLS isolation, origin check, rate limiting, Meta signature verification, prompt assembly, tool execution scoping.
- Keep a `docs/SETUP.md` updated with every manual step I must do (Supabase project, Meta app, Vercel env vars).
