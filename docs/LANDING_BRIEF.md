# Landing Site: Build Brief

Build ChatAlot's public marketing site, so that visiting the domain shows the product instead of a sign-in form. Signed-in staff still go straight to their dashboard. Work in phases and stop after each one for review.

Before writing code, read `CLAUDE.md`, `AGENTS.md` (this Next.js version differs from your training data: read the relevant guide in `node_modules/next/dist/docs/` first) and `lib/plans.ts`.

## What we're borrowing, and what we're not

The information architecture is inspired by mindbodyonline.com: a top bar with mega menus (Features, Business type, Resources, Pricing), a "Staff sign in" link and a "Get a demo" button, and one page per business type.

**Do not copy** Mindbody's copy, taglines, layouts, imagery, icons or brand. Everything visual follows ChatAlot's own design system (below), and every line of copy is written fresh for ChatAlot.

## Ground rules

- **Brand in one place.** Read the product name, domain and tagline from a single `lib/brand.ts` (`BRAND_NAME = "ChatAlot"`). The product may be renamed, so never hard-code the name in pages or copy.
- **Only claim what exists.** Every feature on the site must exist in the app today (list below). No invented statistics, customer counts, testimonials, client logos, awards or "as seen in". Where proof is needed later, leave a clearly marked placeholder such as `[CUSTOMER QUOTE]` and keep it out of production builds.
- **No invented prices.** Plan names and features come from `lib/plans.ts`. Prices live in one config (`lib/pricing.ts`) with `null` meaning "Contact us". Do not fill in amounts.
- **Our look.** Geist, the indigo tokens in `app/globals.css`, Card `lift`, gradient buttons, the status chips and skeletons from the dashboard redesign. Public pages stay in light theme (as the app already does), with dark sections allowed for the hero and video.
- **Locale.** South African English, ZAR, 24-hour time. Copy should still read naturally for any small business, so the site can scale beyond South Africa later.
- **Fast and accessible.** Static rendering for marketing pages. LCP under 2.5s on mobile. No layout shift from fonts or video. Keyboard-usable mega menus with Esc to close. Every animation respects `prefers-reduced-motion`.

## Routes

Put all marketing pages in a new `app/(marketing)/` route group with its own layout (header and footer). Don't touch the `(dashboard)`, `(admin)`, `(auth)` or widget routes.

| Route | Page |
|---|---|
| `/` | Home. Signed-in users with a tenant still redirect to `/dashboard`, as today. |
| `/features` and `/features/[slug]` | Feature overview, plus one page per feature group |
| `/for/[type]` | One page per business type, generated from a data file |
| `/pricing` | Plans from `lib/plans.ts`, prices from `lib/pricing.ts` |
| `/resources` | Setup guides, FAQ, demo video, privacy and POPIA |
| `/demo` | "Get a demo" form |
| `/signup` | Start a free trial (phase 4) |
| `/login` | Existing staff sign-in, restyled to match (keep its logic) |
| `/terms` | Terms of Service page, with copy marked `[LEGAL REVIEW]` |

Also add metadata per page, an Open Graph image, `sitemap.ts`, `robots.ts` and Organization/SoftwareApplication structured data.

## Navigation

**Top bar:** logo · Features ▾ · Business type ▾ · Resources ▾ · Pricing · *(right side)* Staff sign in · **Get a demo** (primary button). On mobile, everything goes into a full-screen menu.

**Features ▾** is grouped by outcome, and lists only what exists:

| Group | Items (what's real in the app) |
|---|---|
| Never miss a customer | AI receptionist on your website · WhatsApp replies · Human takeover when it matters |
| Fill your calendar | Online booking with staff, services and hours · Booking links the AI sends · Reminders that cut no-shows · Rescheduling by link |
| Grow and keep clients | Lead capture with owner alerts · Review requests and low-score alerts · Customer records with POPIA consent history · Daily summary for the owner |
| Your website, upgraded | Branded widgets: schedule, appointment, contact, registration · Hosted booking page · One-line install |

Leave out (not built yet): payments, marketing campaigns, a client marketplace, financing, multi-location, a branded mobile app. Don't add a "coming soon" section unless I ask.

**Business type ▾** is driven by `lib/marketing/business-types.ts`:

- **Beauty:** hair salon, barbershop, nail salon, lash salon, hair removal
- **Wellness:** day spa, hotel spa, massage, med spa, physiotherapy, chiropractic, wellness centre
- **Fitness:** gym, personal training, yoga, pilates, group training, martial arts, dance studio, sports facility
- **Trades and home services:** plumbers, electricians, handymen, cleaners, pest control
- **Clinics and professional services:** dental practice, optometrist, vet, consultants

Each group has an "All …" page. Each type has its own entry with: name, slug, headline, the three problems it has (e.g. a plumber missing calls while on a job), a sample conversation for the hero chat animation, and the features to show. **Trades show call-out booking** (request a call-out, arrival windows, call-out fee upfront, service areas, urgent jobs) rather than salon-style appointments. This changed after the first build: see `docs/CALLOUT_BRIEF.md`. Leave out "Enterprise / multi-location" until it exists.

**Resources ▾:** Getting started guide · Installing the widget · Connecting WhatsApp · FAQ · Watch the demo · Privacy and POPIA.

## Home page sections

1. **Hero.** One strong, original headline about never missing a customer (write 3 options for me to choose from; don't reuse any competitor's line). Short supporting line, **Get a demo** and **Start free trial** buttons, and the hero animation (see Motion).
2. **The problem.** Missed messages after hours, no-shows, and leads lost in WhatsApp, shown as three small animated moments.
3. **Feature tour.** The four feature groups, each with a product visual and a link to its page.
4. **The film.** The 45s ad (see Video).
5. **Business types.** Cards for each group, linking to `/for/...`.
6. **How it works.** Three steps: we set up your knowledge, add one line to your site, connect WhatsApp.
7. **Pricing teaser.** Plan names and what's in them, linking to `/pricing`.
8. **Trust.** POPIA consent records, your data stays yours, human takeover. No fake logos or numbers.
9. **FAQ** (accordion), then a closing call to action.
10. **Footer.** Product, business types, resources, legal (Privacy, Data deletion, Terms), "Staff sign in".

## Our own chatbot (dogfooding)

The site uses ChatAlot's own widget, set up exactly as a customer would set it up:

- Create a platform tenant called **"ChatAlot"** with a knowledge base about the product: features, who it's for, setup, POPIA, how pricing works. Add its domains to `allowed_domains`.
- Load it with the normal `<script src="/widget.js" data-key="…">` in the marketing layout only. The key comes from an env var, `NEXT_PUBLIC_MARKETING_WIDGET_KEY`.
- Its AI answers only about ChatAlot, captures leads ("I'd like a demo") into that tenant's Leads, and can use `send_booking_link` to book a demo through the appointment widget. "Demo call" is a 30-minute service with a real availability schedule.
- Add a seed script for this tenant's knowledge and service, and steps in `docs/SETUP.md`.

## Video

- Copy the rendered films from `../chatalot-ad/out/` into `public/video/`: `ad-45-landscape.mp4` and `ad-45-portrait.mp4`. Also export a still frame from each as a poster image.
- Home section 4 shows the landscape film (portrait on phones), with a play button, sound off until the visitor presses play, and no autoplay with sound.
- Lazy-load the video below the fold, with `preload="none"` and the poster image, so it never slows the first load.

## Motion

Use the dashboard's existing motion language (spring easing, lift on hover, staggered entrances, shimmer skeletons). If a library is needed, pick one and say why before adding it.

- **Hero animation:** a phone and a browser side by side (stacked on mobile). A visitor's question appears, the AI types and answers, and a booking card snaps into a calendar. Reuse the widget's real styles so it looks like the product. On `/for/[type]` pages the conversation comes from that type's data.
- **Scroll reveals:** sections fade and slide up gently once, staggered by about 40ms. No parallax that moves text.
- **Feature visuals:** small looping product moments (a review's stars landing, a lead card arriving, the "Take over" tap), built in HTML/CSS, not GIFs.
- With reduced motion on, show the final state of each animation with no movement.

## Sign in and sign up

- **Staff sign in** goes to the existing `/login` (email magic link). Restyle it to match the site, keep its behaviour, and keep the `next` return path.
- **Get a demo** (`/demo`): name, business, business type, phone, email, message, and a POPIA consent checkbox. Use Zod validation, rate limiting (Upstash, like the public widget APIs) and a honeypot field. The request saves as a lead in the ChatAlot tenant and emails the platform admins.
- **Start free trial** (`/signup`, phase 4): self-serve sign-up. Email (magic link to verify), business name and business type creates a tenant on the `trial` plan with the person as `owner`. Feature defaults come from the business type (e.g. trades start with bookings hidden). Then:
  - A short onboarding checklist on the dashboard Overview: add knowledge, set hours, install the widget, test a chat.
  - Rate limiting and bot protection on sign-up. One trial per email.
  - The platform admins get an email for each new sign-up.
  - Just before the trial starts, ask the two website consents (website content, and website images): separate, unticked checkboxes. They're stored in `tenant_consents` as described in `docs/WEBSITE_IMPORT_BRIEF.md`, Phase 2.
  - Tests: sign-up creates exactly one tenant and membership, RLS still isolates it, and a second sign-up with the same email is refused.

## Phases (stop after each)

1. **Shell:** `(marketing)` layout, header with mega menus (desktop and mobile), footer, `lib/brand.ts`, `/` routing (signed-out visitors see the landing page), restyled `/login`, `/terms` placeholder, metadata, sitemap and robots.
2. **Home page:** all sections, hero animation, video, our own chatbot (with the platform tenant seed), `/demo` form.
3. **Detail pages:** `/features/[slug]`, `/for/[type]` from data, `/pricing`, `/resources` with the first guides and FAQ.
4. **Self-serve sign-up and onboarding,** with tests.

After each phase: typecheck, lint, tests, a Lighthouse check of the home page on mobile, and screenshots of the new pages at 390px and 1440px wide.

## Decisions I still need to make (ask, don't assume)

- The final product name and domain (the site reads both from `lib/brand.ts`).
- Prices per plan, or "Contact us".
- Which of the three hero headlines to use.
- Whether trials need my approval before the tenant goes live, or start immediately.
