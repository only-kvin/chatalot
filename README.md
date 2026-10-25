# Bookfront

An AI receptionist for small South African service businesses: salons, clinics, trades and gyms.

Each business gets an assistant that answers customers on **their website** (a one-line chat widget) and on **WhatsApp**. It answers from that business's own knowledge base, takes bookings, captures leads and alerts the owner. One codebase, one deployment and one database serve every business (multi-tenant SaaS).

**Live:** [chatalot.vercel.app](https://chatalot.vercel.app)

## What it does

- **Website chat widget.** Installed with a single `<script>` tag. Vanilla TypeScript in a Shadow DOM, bundled with esbuild to one small file. Streams replies over SSE, keeps history across reloads, and is keyboard- and screen-reader-accessible.
- **WhatsApp channel.** Meta WhatsApp Cloud API webhook with signature verification, de-duplication, background processing, the 24-hour messaging window, and human takeover ("human", "STOP").
- **Agent engine.** Retrieval-augmented answers (pgvector + Voyage embeddings), a layered system prompt (platform rules, tenant settings, retrieved knowledge), and tools for saving leads, handing off to a human, checking availability and creating bookings. Every tool call is scoped to the current tenant.
- **Business dashboard.** Inbox and conversations, leads with CSV export, customers, a bookings calendar, services, staff, availability, a knowledge editor and widget settings with a live preview.
- **Platform admin.** Tenant management, widget keys, suspension, and usage and cost reporting.

## Engineering highlights

- **Tenant isolation.** Postgres Row Level Security on every table. Server queries also filter by `tenant_id` explicitly, and tests check that one tenant can't read another tenant's rows.
- **Abuse protection.** Origin allow-lists per tenant, Upstash rate limits per session, IP and tenant daily cap, and Zod validation at every API boundary.
- **Secrets handled properly.** WhatsApp access tokens are encrypted at rest, and Meta webhooks are HMAC-verified. All credentials live in environment variables, and CI scans every push for leaked keys.
- **Swappable providers.** The LLM sits behind a provider-neutral `runAgentTurn` interface, and embeddings behind `embed()`. Background work runs through a `waitUntil` wrapper.
- **POPIA-aware.** The assistant asks for consent before it saves personal details, and there are public privacy and data-deletion pages.

## Stack

Next.js (App Router) · TypeScript (strict) · Supabase (Postgres, Auth, RLS, pgvector, Storage) · Tailwind CSS + shadcn/ui · Upstash Redis · Resend · Zod · Vitest · Vercel

## Running it locally

```bash
pnpm install
cp .env.example .env.local   # fill in your own keys; never commit this file
pnpm dev
```

Full setup (Supabase project, Meta app, Vercel env vars, seeding a demo tenant) is in [`docs/SETUP.md`](docs/SETUP.md). Run tests with `pnpm test`.

## Repo layout

```
app/              routes: marketing, dashboard, admin, API (chat, widget config, WhatsApp webhook)
lib/agent/        engine, prompt assembly, tools, retrieval, model adapter
lib/security/     rate limiting, origin check, encryption, Meta signature verification
widget/           widget source -> public/widget.js
supabase/         migrations, including RLS policies
tests/            Vitest suites
```
