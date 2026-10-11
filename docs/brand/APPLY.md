# Apply the Bookfront rebrand (instructions for Claude Code)

You are applying a rebrand from **ChatAlot** to **Bookfront** in this repo.
Most of it may already be done: the work lives on branch
`claude/dazzling-volta-j3vtwb` (PR only-kvin/chatalot#2). **Check each item
before changing anything, and only apply what is missing.** Never redo or
"improve" an item that already passes its check.

Read these first: `docs/brand/README.md` (the brand guide) and
`docs/brand/tokens.css` (every token value). They are the source of truth;
if this file and those disagree, they win.

## How to work

1. `git fetch origin && git status`. If you are not on
   `claude/dazzling-volta-j3vtwb` and that branch exists, ask the user whether
   to switch to it (it may already contain everything below).
2. Go through sections A–H in order. For each item run its **Check**. If it
   passes, mark it done and move on. If it fails, apply **Do**, then re-run the
   check.
3. After all sections: run the checks in "Verify everything" at the end.
4. Report a table to the user: item, already applied / applied now / skipped
   (and why).
5. Do not touch anything listed under "Do not change" without asking.

---

## A. Brand files exist

| # | Check | Do if missing |
|---|---|---|
| A1 | `docs/brand/tokens.css`, `docs/brand/README.md` exist | Stop and tell the user: these come from the design handoff commit "Add Bookfront brand handoff" and can't be recreated reliably from here. Ask them to pull the branch. |
| A2 | `ls public/brand/` shows `bookfront-symbol.svg`, `bookfront-symbol-dark.svg`, `bookfront-mark-mono.svg`, `bookfront-wordmark.svg`, `bookfront-wordmark-dark.svg`, `bookfront-lockup.svg`, `bookfront-lockup-dark.svg`, `favicon.svg` | Same as A1: the wordmark is outlined font paths, don't hand-draw it. |

## B. Colour tokens in `app/globals.css`

| # | Check | Do |
|---|---|---|
| B1 | `grep -c "#0e5c4b" app/globals.css` ≥ 5 and `grep -c "#4f46e5\|#6366f1\|#818cf8" app/globals.css` = 0 | Replace the colour variables in `:root` with section 2 of `docs/brand/tokens.css` (keep the `--ease-*`/`--dur-*` lines). |
| B2 | Both dark blocks (`[data-theme="dark"] {` and `[data-theme="system"] {` inside `@media (prefers-color-scheme: dark)`) set `--background: #0c1412` and are identical | Replace both bodies with section 3 of `tokens.css`. Keep them identical. |
| B3 | `@theme inline` contains `--color-tone-won`, `--color-tone-done`, `--color-success`, `--color-warning`, `--shadow-overlay`, `--shadow-modal`, `--radius-lg: 16px` | Merge section 1 of `tokens.css` into the existing `@theme inline` block (don't create a second block). |
| B4 | `:root` defines `--shadow-soft`, `--success`, `--warning`, `--tone-won`, `--tone-won-fg`, `--tone-done`, `--tone-done-fg` (light and both dark blocks) | Add them from `tokens.css`. |

Values (light / dark) for quick reference: background `#f6f7f5`/`#0c1412`,
foreground `#13201c`/`#ecf1ef`, card `#ffffff`/`#131d1a`, primary
`#0e5c4b`/`#5fc7a9`, primary-foreground `#ffffff`/`#06261e`, muted-foreground
`#5a6662`/`#9daaa5`, accent `#e3efea`/`#12302a`, border `#dde3e0`/`#26332f`,
destructive `#c0352b`/`#f07a6e`.

## C. Fonts

| # | Check | Do |
|---|---|---|
| C1 | `app/layout.tsx` imports `Bricolage_Grotesque` and `Instrument_Sans` from `next/font/google`, with variables `--font-bricolage` and `--font-instrument-sans`, both on `<html className>`; `Geist` (sans) is gone; `Geist_Mono` stays | Make it so. Keep `Geist_Mono` with `preload: false`. |
| C2 | In `globals.css` `@theme inline`: `--font-sans: var(--font-instrument-sans), …` and `--font-heading: var(--font-bricolage), var(--font-instrument-sans), …` | Set them. |
| C3 | `@layer base` has `h1, h2 { @apply font-heading; }` | Add it (h3 and below stay Instrument Sans). |

## D. Logo, icons, name

| # | Check | Do |
|---|---|---|
| D1 | `components/brand/symbol.tsx` exports `BrandSymbol` and `BrandLockup` | Create it: inline SVG `viewBox="0 0 32 32"`: `<rect width=32 height=32 rx=8 fill=TILE>`, `<path d="M10 24V15a6 6 0 0 1 12 0v9z" fill=INK>`, `<circle cx=21.5 cy=10.5 r=4.6 fill=TILE>`, `<rect x=6 y=24 width=20 height=3 rx=1.5 fill=INK>`. TILE = `var(--primary)`, INK = `var(--primary-foreground)`; an `onDark` prop forces `#5fc7a9` / `#0c1412`. Lockup = symbol + name in `font-heading`, bold, `tracking-[-0.03em]`, lowercase. |
| D2 | `components/marketing/logo.tsx` uses `BrandLockup` (no `MessageCircleIcon`, no `#6d67f5`) | Swap it; `inverted` maps to `onDark`. |
| D3 | `app/(dashboard)/dashboard/dashboard-nav.tsx` `Brand` uses `BrandSymbol` and `{BRAND_NAME}` (no hard-coded "ChatAlot") | Swap it. Also remove `dark:text-[#a5b4fc]` from the active nav item. |
| D4 | `app/icon.svg` and `app/apple-icon.png` (180×180) exist; `app/favicon.ico` is deleted | Copy `public/brand/favicon.svg` to `app/icon.svg`; render a 180px PNG of the symbol (full-bleed green square, symbol at 80%) to `app/apple-icon.png`; delete `favicon.ico`. |
| D5 | `app/(marketing)/opengraph-image.tsx` has no `#6d67f5`/`rgba(99,102,241` and draws the symbol | Background `#0c1412` with mint/green radial glows; mint symbol SVG; name lowercase in `#ecf1ef`; sub-line `#9daaa5`. |
| D6 | `lib/brand.ts`: `BRAND_NAME = "Bookfront"` | Set it. |
| D7 | User-facing strings use `BRAND_NAME`, not "ChatAlot": `lib/email/send.ts` (FROM name and "Open in …" button), `lib/email/notify-urgent.ts`, `lib/bookings/labels.ts` (system actor), `lib/site-brief/prompt.ts` (widgets heading), `app/(dashboard)/dashboard/settings/settings-form.tsx` (hosted booking page text) | Replace with `BRAND_NAME` imported from `@/lib/brand`. Update `tests/owner-email.test.ts` to expect `` `Open in ${BRAND_NAME}` ``. |

## E. Hard-coded old colours in components

| # | Check | Do |
|---|---|---|
| E1 | `grep -rnE "#(6d67f5\|3f35c4\|4338ca\|5b53f0\|7c76f7)\|indigo-[0-9]+\|rgb\(67_56_202\|99_102_241\|52_199_89" app components lib --include=*.tsx --include=*.ts` returns nothing | Replace: gradient buttons/badges/step numbers → `bg-primary text-primary-foreground shadow-raised`; dashboard KPI/icon tiles (which sit beside other coloured tiles) → `from-[#17785f] to-[#0e5c4b]` + `shadow-[0_6px_14px_-6px_rgb(14_92_75/0.5)]`; progress bars → `bg-primary`; eyebrows on dark sections `text-indigo-300` → `text-[#5fc7a9]`; code blocks `bg-[#0f0f1a] … text-indigo-100` → `bg-[#0c1412] … text-[#d6f0e7]`; dark sections `bg-[#0b0b14]` → `bg-[#0c1412]`; glows `rgb(99_102_241/0.45)` → `rgb(95_199_169/0.2)`, `/0.16` → `rgb(14_92_75/0.1)`, `rgb(52_199_89/x)` → `rgb(14_92_75/…)`; notifications bell indigo → `bg-accent text-accent-foreground`, unread dot `bg-primary`, urgent `bg-destructive`. |
| E2 | `components/ui/button.tsx` default variant is `bg-primary text-primary-foreground shadow-raised` with a darken-on-hover, and the base class uses `rounded-full` | Apply; remove the `rounded-[min(var(--radius-md),…)]` size overrides. |
| E3 | Conversation transcript (`app/(dashboard)/dashboard/conversations/[id]/page.tsx`): owner replies `bg-primary text-primary-foreground`, AI (Kaya) replies `bg-accent text-accent-foreground` | Apply (both used to be green-ish/indigo; they must stay distinct). |
| E4 | Overview: website channel dot is `#1d5fa8` (WhatsApp stays `#25d366`); first `STAFF_COLOURS` entry is `#0e5c4b` | Apply. |
| E5 | `components/marketing/hero-demo.tsx`: sample client `PRIMARY = "#7a2e4a"` (salon berry); the owner's-phone card ring uses `#0e5c4b` | Apply. |
| E6 | `lib/email/send.ts` button background `#0e5c4b` | Apply. |

## F. "Powered by" line (`widget/shared/powered.ts`)

| # | Check | Do |
|---|---|---|
| F1 | It renders a small inline SVG symbol (rect + doorway path + moon circle) before the lowercase brand name, built with `createElementNS` | Apply. Doorway fill `var(--ca-surface, #fff)`, tile/moon `currentColor`. |
| F2 | CSS colour is `var(--ca-muted, #5a6662)`, hover `var(--ca-text, #13201c)`, svg 11px | Apply. The old `#8a8a92` failed WCAG AA; the `--ca-*` fallbacks keep it readable on dark-themed booking widgets. |

## G. Motion (`look-good` rules: calm and quick)

| # | Check | Do |
|---|---|---|
| G1 | `globals.css` `@theme inline` has `--ease-move: cubic-bezier(0.77, 0, 0.175, 1)` and `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`; `:root` has `--dur-press 120ms`, `--dur-fast 180ms`, `--dur-base 240ms`, `--dur-exit 160ms`, `--dur-story 500ms` | Add. Name it `ease-move`, not `ease-in-out` (that would override Tailwind's built-in). |
| G2 | `widget/styles.ts`: `.panel` animation `open .24s var(--drawer)`; `.panel.closing` animation `close .16s var(--ease-out)`; launcher `pop .28s var(--ease-out)` from `scale(.9)`; `.launcher:hover` inside `@media (hover: hover) and (pointer: fine)`; `.msg`/`.msg-action` `up .2s var(--ease-out)`; no `.live::after` ping; no `--spring` | Apply. `--ease-out: cubic-bezier(.23,1,.32,1)`, `--drawer: cubic-bezier(.32,.72,0,1)` in `:host`. |
| G3 | `widget/panel.ts`: `close()` adds class `closing` and hides after a 160ms timer; `open()` clears the timer and the class; launcher toggles via an `isOpen()` helper | Apply (timer, not `animationend`, so it still hides when animations are off). |
| G4 | Reduced motion, chat widget: keeps the blanket `* { animation: none; transition: none }` but adds 150ms `fade` (fill-mode both) for `.launcher, .teaser, .panel, .msg, .msg-action`, `fade-out` for `.panel.closing`, and `transform: none` on button/launcher `:active` | Apply. Reduced = fewer and gentler, not zero. |
| G5 | Booking widget (`widget/booking/styles.ts`): `.day .num` transform transition `.16s cubic-bezier(.23,1,.32,1)` (no spring); reduced-motion block adds `fade .15s` for `.in, .alert, .done .tick, .float-panel` and `transform: none` on pressed `button`, `.slot`, `.day .num`, `.launcher` | Apply. |
| G6 | `components/ui/badge.tsx` uses `transition-[color,background-color,border-color,box-shadow]`, not `transition-all` | Apply. |

## H. Docs

| # | Check | Do |
|---|---|---|
| H1 | `docs/brand/README.md` has a "Status" section listing what's applied and what deliberately still says ChatAlot | Add/update it to match reality after this run. |

---

## Do not change (ask the user first)

- `lib/legal.ts` operator and the `/privacy`, `/data-deletion` page titles. Meta links to them from the WhatsApp app; they must change together with the Meta app's name.
- `window.ChatAlot`, the `ChatAlotBot` user agent, `data-chatalot`, ICS `PRODID`, `chatalot.vercel.app`: client sites and site owners depend on them.
- The default client widget colour `#4f46e5` (in `app/api/widget/config/route.ts`, `lib/widgets/config.ts`, `dashboard/widget/page.tsx`, `lib/site-brief/generate.ts`): it's the client's colour; changing it restyles live widgets.
- Anything under `node_modules`, generated `.next`, or the gitignored `public/widget.js` / `public/widgets/`.

## Not built yet (only if the user asks)

The design canvas also has new **layouts** (Step 3). These are new work, not
part of the rebrand above; don't start them unasked. Summary, if asked:

- **Home:** centred headline "Someone's always at the front desk.", photo with three timed cards (21:47 question answered, 21:49 booked, Fri 10:00 reminder sent), problem section, feature tour, dark Kaya section, business types, how it works, pricing teaser, FAQ.
- **Pricing:** Starter / Growth / Pro + per-team-member price, monthly/annual toggle, prices as `R[___]`, comparison table.
- **Kaya page:** one evening at a salon told as moments (21:47, 21:49, Fri 09:00 reminder, handover to a person), plus "What Kaya won't do".
- **Dashboard:** phone-first Overview (Kaya overnight card, Today list, New leads), Bookings day view with staff columns, Leads with detail panel, Conversations with Take over / Hand back, Settings.
- **AI name:** "Kaya" (from *ikhaya*, home). Voice: short, ends with a next step, never invents prices/times, asks consent before saving details (POPIA).

## Verify everything

Run all of these; all must pass before you report done:

```bash
pnpm run lint                      # 0 errors (delete public/widget.js and public/widgets/ first if present)
npx tsc --noEmit                   # only PageProps/LayoutProps/RouteContext errors are acceptable (Next generates them on build)
pnpm run build:widget              # widgets total under the 60 KB budget
npx vitest run                     # 405 tests pass; files needing Supabase may fail to start without .env.local
pnpm run build                     # needs .env.local (or placeholder NEXT_PUBLIC_SUPABASE_URL etc.)
grep -rnE "#(6d67f5|3f35c4|4338ca|5b53f0|7c76f7)|indigo-[0-9]+|99_102_241" app components lib --include=*.tsx --include=*.ts   # no output
```

Then open the app (`pnpm dev`) and look at `/`, `/pricing`, `/login`, and the
dashboard in light and dark (theme switcher in the sidebar). Expect: green
pill buttons, the doorway-and-moon logo, Bricolage headings, no indigo
anywhere. Open the chat widget on `/widget-demo.html`: it opens in about a
quarter second, closes slightly faster, and the "Powered by" line shows the
grey symbol.

Commit with a clear message, push to the same branch, and tell the user
what was already there versus what you changed.
