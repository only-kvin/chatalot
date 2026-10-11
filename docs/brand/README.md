# Bookfront brand handoff

Design source: Claude Design canvas **"Bookfront Brand Directions"** (private;
ask the owner for access). Rows on the canvas: brand directions → logo
options → **Step 2 design system** → **Step 3 key screens**.

Chosen mix: colour and type from direction A ("Counter"), soft-square
surfaces with pill controls (A + B), the centred editorial hero (B), summary-card
dashboard (A), coloured-header widget (A), logo option 4 (the crescent-cut
door). The AI front desk is called **Kaya**.

## Status

Applied in the app: tokens (light, dark, system), fonts, the logo
(`components/brand/symbol.tsx`), favicon and Apple icon, the link-preview
image, buttons, the "Powered by" line and the brand name (`lib/brand.ts`).

Deliberately still "ChatAlot", to change only when you decide:

- `lib/legal.ts` and the `/privacy` and `/data-deletion` page titles. Meta
  links to these from the WhatsApp app, so the operator name should match the
  Meta app's name. Change both together.
- Technical names client sites rely on: `window.ChatAlot`, the
  `ChatAlotBot` crawler user agent (site owners may block it by name), the
  `data-chatalot` widget attribute, the calendar `PRODID`, and the
  `chatalot.vercel.app` domain.
- The default widget colour `#4f46e5` for businesses that never picked one.
  It is the client's colour, not ours, so changing it would restyle live
  widgets.

Not yet built: the Step 3 screens' new layouts (marketing pages, Kaya page,
dashboard redesign). The rebrand restyles the existing screens.

## Files

| File | What it is |
|---|---|
| `docs/brand/tokens.css` | Every token as CSS variables (light, dark, reduced motion) plus the Tailwind v4 `@theme` additions. Uses the variable names `app/globals.css` already has, so it drops in. |
| `public/brand/bookfront-symbol.svg` | Symbol, green tile (light backgrounds) |
| `public/brand/bookfront-symbol-dark.svg` | Symbol, mint tile (dark backgrounds) |
| `public/brand/bookfront-mark-mono.svg` | One-colour mark, transparent, real moon cut-out (print, stamps) |
| `public/brand/bookfront-wordmark.svg` / `-dark.svg` | Wordmark only, outlined (no font needed) |
| `public/brand/bookfront-lockup.svg` / `-dark.svg` | Symbol + wordmark, outlined |
| `public/brand/favicon.svg` | Favicon source; move to `app/icon.svg` when rebranding |

Still to export when the rebrand ships: PNG sizes 16–1024, `favicon.ico`, and
a 180 px Apple touch icon (`app/apple-icon.png`). Rasterise from `favicon.svg`.

## Fonts

Both are free for commercial use (SIL Open Font License) and come from Google
Fonts through `next/font`, so there is nothing to download or license:

```tsx
// app/layout.tsx: replace Geist with these
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
// <html className={`${bricolage.variable} ${instrument.variable}`}>
```

- **Headings:** Bricolage Grotesque 700 (display 750), tracking −2% to −3%. Use `font-heading`.
- **Body and UI:** Instrument Sans 400/600. Body text is never smaller than 16 px on phones.
- **Numbers:** add `tabular-nums` to times, prices and counts. Times are 24-hour; currency is `R 1 250,00`.

## Applying the tokens

1. Merge section 1 of `tokens.css` into the `@theme inline` block in `app/globals.css`.
2. Replace the colour variables in `:root` with section 2.
3. Replace **both** dark blocks (`[data-theme="dark"]` and the `system` one in the media query) with section 3. Keep them identical.
4. Swap the fonts as above.
5. Component touch-ups the tokens can't do on their own:
   - Buttons, chips, segmented controls and chat inputs: `rounded-full`. Cards: `rounded-lg`. Dialogs and sheets: `rounded-xl`.
   - Filter chips use ink (`bg-foreground text-background`) when on, not green. Green appears once per screen.
   - Status chips always show a dot, ring, tick, cross or strike with the label. Leads: new → `tone-new`, contacted → `tone-warn`, booked → `tone-ok`, won → `tone-won`, lost → `tone-gray`. Bookings: pending → `tone-warn` (ring), confirmed → `tone-ok`, completed → `tone-done` (tick), cancelled → `tone-gray` + line-through, no-show → `tone-bad` (cross).
   - Tap targets are at least 44 px; compact 36 px controls only in desktop tables.

## Motion

Calm and quick: motion explains a change and never decorates. UI motion stays
under 300 ms, exits are about ⅔ of the entry time, and only `transform` and `opacity` animate.

| Element | Time (in / out) | Easing | Movement | Reduced motion |
|---|---|---|---|---|
| Button, chip press | 120 | `--ease-out` | scale 0.97 | colour only |
| Hover (mouse only, `@media (hover: hover) and (pointer: fine)`) | 180 | ease | colour, shadow | same |
| Menu, select, popover | 180 / 120 | `--ease-out` | fade + scale 0.97 from its trigger | fade |
| Dialog | 240 / 160 | `--ease-out` | fade + scale 0.96, centred | fade |
| Widget panel | 240 / 160 | `--ease-drawer` | from launcher corner, 8 px + 0.96 | fade |
| Toast | 240 / 160 | `--ease-out` | rise 16 px; transitions, not keyframes | fade |
| New chat message | 200 | `--ease-out` | rise 6 px + fade | fade |
| Tab / segment indicator | 180 | `--ease-move` | slides | jumps |
| Launcher, first load | 280 | `--ease-out` | scale 0.9 + fade, once | fade |
| Skeleton | 1.4 s loop | linear | shimmer, shown after 300 ms | static |
| Live dot | 1.8 s loop | ease-out | dashboard "On" badge only | static |

Never animate keyboard shortcuts, typing, table sorting/filtering, or anything
an owner does 100+ times a day. `--ease-spring` is for one moment only: the
booking-confirmed tick. `--ease-move` is named so to avoid overriding Tailwind's
built-in `ease-in-out`.

## Logo

- Symbol: an open doorway on a counter, its top bitten into a crescent moon ("open, even after hours"). The moon always bites top-right.
- Clear space: ⅓ of the symbol's width on every side. Minimum: symbol 16 px, lockup 96 px wide.
- Colours: green or mint tile, ink one-colour, grey in "Powered by". Never recolour, stretch, outline or capitalise.

## Widgets (on clients' sites)

- All accents come from the client's colour (`--accent` in the widget). Bookfront chrome is neutral: white surfaces, #F6F7F5 message area, #C9D2CE borders.
- Our brand appears only as the grey "Powered by [symbol] bookfront" line (#5A6662).
- The client names their assistant (e.g. Amara's "Ama"); "Kaya" is our name in marketing and the dashboard.

## Voice (Kaya)

Short (two sentences in chat, under 80 words); always end with a next step;
never invent prices, times or policies; ask before saving details (POPIA);
the owner is the hero; calm, plain error messages. South African English,
24-hour time, ZAR. Do/don't examples are on the canvas ("DS · AI front desk + voice").

## Placeholders to fill before launch

Plan prices and seat price (`R[___]`), included seats on Pro, conversation
limits, annual discount, VAT wording, sending email domain, trial terms, and a
trademark/domain check for "Kaya" and the final product name.
