import { h } from "../shared/dom";
import { emit } from "../shared/events";
import type { FormField } from "../shared/form";
import { registerWidget, type MountContext } from "../shared/loader-contract";
import type { Theme } from "../shared/theme";
import { createShell } from "../booking/shell";
import { createDetails, renderDone, summaryList } from "../booking/steps";
import type { PaymentDue } from "../booking/api";
import { EVENTS_CSS } from "./styles";

// widgets/events.js: a business's upcoming events as poster cards. A card
// opens the event (poster, details, description); "Sign up" asks how many
// tickets, then the business's form; paid tickets end with a pay link.
// Mounted into <div data-chatalot="events">.

type EventsConfig = {
  businessName: string;
  contact: string;
  theme: Theme;
  fields: FormField[];
  copy: { title: string; signUpButton: string; successTitle: string; successMessage: string; emptyMessage: string };
  settings: { showPast: boolean };
  widget?: { status: "draft" | "live" };
};

type EventItem = {
  id: string;
  title: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  posterUrl: string | null;
  priceCents: number | null;
  maxPerSignup: number;
  spotsLeft: number | null;
  closed: null | "past" | "cancelled" | "sold_out" | "signups_closed";
};

type Step = "list" | "event" | "details" | "done";

const TZ = "Africa/Johannesburg";
const CARD_DATE = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const LONG_DATE = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

const rand = (cents: number) => `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const when = (e: EventItem) => `${LONG_DATE.format(new Date(e.startsAt))}, ${TIME.format(new Date(e.startsAt))}${e.endsAt ? `–${TIME.format(new Date(e.endsAt))}` : ""}`;
const price = (e: EventItem) => (e.priceCents ? `${rand(e.priceCents)} per ticket` : "Free");
const CLOSED_LABEL: Record<NonNullable<EventItem["closed"]>, string> = {
  past: "Past event",
  cancelled: "Cancelled",
  sold_out: "Sold out",
  signups_closed: "Sign-ups closed",
};

// Preview (data-preview): two sample events when the business has none yet.
function sampleEvents(): EventItem[] {
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    return new Date(`${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00+02:00`).toISOString();
  };
  return [
    { id: "sample-1", title: "Open day", summary: "Come and meet the team. Free mini sessions all morning.", description: "Sample event for previewing the layout.\n\nThe business adds its own events, with posters, in its Bookfront dashboard.", startsAt: at(7, 9), endsAt: at(7, 13), location: "At our place", posterUrl: null, priceCents: null, maxPerSignup: 4, spotsLeft: null, closed: null },
    { id: "sample-2", title: "Evening workshop", summary: "A hands-on session in a small group.", description: "Sample event for previewing the layout.", startsAt: at(14, 18), endsAt: at(14, 20), location: "Studio 2", posterUrl: null, priceCents: 25000, maxPerSignup: 2, spotsLeft: 6, closed: null },
  ];
}

const SAMPLE_CONFIG: EventsConfig = {
  businessName: "Your business",
  contact: "",
  theme: { primary: "#4f46e5", surface: "#ffffff", text: "#18181b", radius: 20, font: "system", mode: "light" },
  fields: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "email", label: "Email", type: "email", required: false },
  ],
  copy: { title: "Upcoming events", signUpButton: "Sign up", successTitle: "You're signed up!", successMessage: "See you there!", emptyMessage: "No events coming up right now." },
  settings: { showPast: false },
};

function mountEvents(host: HTMLElement, ctx: MountContext): void {
  const shell = createShell(host, ctx, "events", EVENTS_CSS);
  const details = createDetails(shell);
  let config: EventsConfig | null = null;
  let events: EventItem[] = [];
  let usingSample = false;
  let step: Step = "list";
  let current: EventItem | null = null;
  let quantity = 1;
  let fatal: string | null = null;
  let alert: string | null = null;
  let submitting = false;
  let result: { payment: PaymentDue | null; payAtEvent: boolean; email: string } | null = null;
  const params = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ key: ctx.key, ...(ctx.widgetId ? { id: ctx.widgetId } : {}), ...extra });

  function go(next: Step) {
    step = next;
    alert = null;
    render();
    emit(host, { widget: "events", action: "step", step: next });
    shell.focusFirst("h2, h3");
  }

  function open(e: EventItem) {
    current = e;
    quantity = 1;
    go("event");
  }

  function startSignUp() {
    if (!config || !current) return;
    details.start(config.fields);
    go("details");
    shell.focusFirst("input, select, textarea");
  }

  async function loadEvents() {
    const res = await fetch(`${ctx.apiOrigin}/api/public/events?${params()}`).catch(() => null);
    const list = res?.ok ? ((await res.json()) as { events: EventItem[] }).events : null;
    if (!list && !ctx.preview) throw new Error("events");
    usingSample = ctx.preview && !list?.length;
    events = usingSample ? sampleEvents() : (list ?? []);
  }

  async function submit() {
    if (submitting || !current || !config) return;
    const problem = details.check();
    if (problem) {
      alert = problem;
      return render();
    }
    // Preview: show the confirmation without sending anything.
    if (ctx.preview) {
      result = { payment: null, payAtEvent: Boolean(current.priceCents), email: details.email() };
      return go("done");
    }
    submitting = true;
    alert = null;
    render();
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/public/events/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: ctx.key, widgetId: ctx.widgetId, eventId: current.id, quantity, ...details.payload() }),
      });
      const json = await res.json().catch(() => ({}));
      submitting = false;
      if (res.ok && json.ok) {
        result = { payment: json.payment ?? null, payAtEvent: Boolean(json.payAtEvent), email: details.email() };
        go("done");
        emit(host, { widget: "events", action: "submitted" });
        shell.announce(result.payment ? "Pay to secure your tickets" : config.copy.successTitle);
        return;
      }
      alert = `${typeof json.error === "string" ? json.error : "We couldn't sign you up."}${config.contact ? ` You can also contact ${config.businessName} on ${config.contact}.` : ""}`;
      // Spots may have changed: refresh what's shown.
      if (json.reason === "sold_out" || json.reason === "closed") {
        await loadEvents().catch(() => undefined);
        current = events.find((e) => e.id === current?.id) ?? current;
        quantity = Math.min(quantity, Math.max(1, current.spotsLeft ?? quantity));
      }
    } catch {
      submitting = false;
      alert = "We couldn't reach the sign-up system. Check your connection and try again.";
    }
    render();
    shell.announce(alert ?? "");
  }

  // ---- screens ----
  function header(title: string, back?: () => void) {
    return h(
      "div",
      { class: "head" },
      h(
        "div",
        { class: "title-row" },
        back ? shell.button("back", "←", back, "back", { "aria-label": "Back" }) : null,
        h("h2", { id: `${shell.id}-title`, tabindex: -1 }, title),
      ),
    );
  }

  function poster(e: EventItem, cls: string) {
    if (e.posterUrl) return h("img", { class: cls, src: e.posterUrl, alt: "", loading: "lazy" });
    // No poster: a coloured panel with the date, so cards still line up.
    const d = new Date(e.startsAt);
    return h(
      "div",
      { class: `${cls} placeholder`, "aria-hidden": "true" },
      h("span", { class: "ph-day" }, new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, day: "numeric" }).format(d)),
      h("span", { class: "ph-month" }, new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, month: "short" }).format(d)),
    );
  }

  function listScreen(): Node[] {
    const cfg = config!;
    if (!events.length) return [header(cfg.copy.title), h("p", { class: "note muted" }, cfg.copy.emptyMessage)];
    return [
      header(cfg.copy.title),
      h(
        "ul",
        { class: "event-grid" },
        events.map((e) => {
          const card = h(
            "button",
            { type: "button", class: `event-card${e.closed ? " is-closed" : ""}`, "data-k": `ev-${e.id}`, "aria-label": `${e.title}, ${when(e)}` },
            poster(e, "card-poster"),
            h(
              "div",
              { class: "card-body" },
              h("div", { class: "card-date" }, `${CARD_DATE.format(new Date(e.startsAt))} · ${TIME.format(new Date(e.startsAt))}`),
              h("div", { class: "card-title" }, e.title),
              e.summary ? h("div", { class: "card-summary" }, e.summary) : null,
              h(
                "div",
                { class: "card-meta" },
                h("span", {}, e.priceCents ? rand(e.priceCents) : "Free"),
                e.closed
                  ? h("span", { class: "tag" }, CLOSED_LABEL[e.closed])
                  : e.spotsLeft !== null && e.spotsLeft <= 10
                    ? h("span", { class: "tag soft" }, `${e.spotsLeft} spot${e.spotsLeft === 1 ? "" : "s"} left`)
                    : null,
              ),
            ),
          );
          card.addEventListener("click", () => open(e));
          return h("li", {}, card);
        }),
      ),
    ];
  }

  function eventScreen(): Node[] {
    const e = current!;
    const cfg = config!;
    const most = Math.max(1, Math.min(e.maxPerSignup, e.spotsLeft ?? e.maxPerSignup));
    const qty =
      most > 1
        ? h(
            "label",
            { class: "qty" },
            h("span", {}, "Tickets"),
            (() => {
              const sel = h(
                "select",
                { "data-k": "qty" },
                Array.from({ length: most }, (_, i) => h("option", { value: String(i + 1), selected: i + 1 === quantity }, String(i + 1))),
              );
              sel.addEventListener("change", () => {
                quantity = Number(sel.value);
                render();
              });
              return sel;
            })(),
          )
        : null;
    const total = e.priceCents ? h("span", { class: "total" }, `Total ${rand(e.priceCents * quantity)}`) : null;
    return [
      header(e.title, () => go("list")),
      poster(e, "detail-poster"),
      summaryList([
        ["When", when(e)],
        ["Where", e.location || null],
        ["Price", price(e)],
        ["Spots", e.closed ? CLOSED_LABEL[e.closed] : e.spotsLeft !== null ? `${e.spotsLeft} left` : null],
      ]),
      e.description ? h("div", { class: "description" }, e.description.split(/\n\s*\n/).map((p) => h("p", {}, p))) : null,
      alert ? h("div", { class: "alert", role: "alert" }, alert) : null,
      e.closed
        ? h("p", { class: "note muted" }, e.closed === "past" ? "This event has already happened." : `${CLOSED_LABEL[e.closed]}.`)
        : h("div", { class: "signup-row" }, qty, total, shell.button("primary", cfg.copy.signUpButton, startSignUp, "signup")),
    ].filter((n): n is HTMLElement => n !== null);
  }

  function detailsScreen(): Node[] {
    const e = current!;
    const cfg = config!;
    return [
      header("Your details", () => go("event")),
      summaryList([
        ["Event", e.title],
        ["When", when(e)],
        ["Tickets", String(quantity)],
        ["Total", e.priceCents ? rand(e.priceCents * quantity) : "Free"],
      ]),
      alert ? h("div", { class: "alert", role: "alert" }, alert) : null,
      details.render({ businessName: cfg.businessName, confirmLabel: e.priceCents ? `${cfg.copy.signUpButton} and pay` : cfg.copy.signUpButton, submitting, onSubmit: submit, noun: "sign-up" }),
    ].filter((n): n is HTMLElement => n !== null);
  }

  function doneScreen(): Node[] {
    const e = current!;
    const cfg = config!;
    const r = result!;
    const message = [
      cfg.copy.successMessage,
      r.payAtEvent && e.priceCents ? `Please pay ${rand(e.priceCents * quantity)} at the event.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return renderDone(shell, {
      pending: false,
      title: cfg.copy.successTitle,
      message,
      email: ctx.preview ? "" : r.email,
      summary: summaryList([
        ["Event", e.title],
        ["When", when(e)],
        ["Where", e.location || null],
        ["Tickets", String(quantity)],
      ]),
      calendar: { uid: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt ?? e.startsAt, ref: "" },
      again: { label: "See other events", onClick: () => go("list") },
      pay: r.payment,
      tickets: true,
    });
  }

  function render() {
    if (fatal) return shell.paint(() => [h("p", { class: "note" }, fatal)]);
    if (!config) return shell.paint(() => [h("p", { class: "muted note" }, "Loading…")]);
    shell.paint(
      () => (step === "list" ? listScreen() : step === "event" ? eventScreen() : step === "details" ? detailsScreen() : doneScreen()),
      { done: step === "done" },
    );
  }

  render();
  (async () => {
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/widget/config?${params({ widget: "events" })}`).catch(() => null);
      if (res?.ok) config = (await res.json()) as EventsConfig;
      else if (ctx.preview) config = SAMPLE_CONFIG;
      else throw new Error("config");
      await loadEvents();
      shell.applyTheme(config.theme, config.copy.title);
      shell.setNotice(
        ctx.preview
          ? usingSample
            ? "Preview with sample events. This widget isn't set up yet: the business adds its events (with posters) in its Bookfront dashboard, or its onboarding specialist can help. Nothing here is sent."
            : "Preview: the business's real events, but nothing here is sent."
          : config.widget?.status === "draft"
            ? "Test widget (Draft): sign-ups are switched off until it's made Live."
            : null,
      );
      render();
      emit(host, { widget: "events", action: "view" });
    } catch {
      fatal = "Events aren't available right now. Please contact the business directly.";
      render();
    }
  })();
}

registerWidget("events", mountEvents);
