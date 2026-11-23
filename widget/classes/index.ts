import { h } from "../shared/dom";
import { emit } from "../shared/events";
import type { FormField } from "../shared/form";
import { registerWidget, type MountContext } from "../shared/loader-contract";
import type { Theme } from "../shared/theme";
import { addDays, localDateISO } from "../../lib/time";
import { createShell } from "../booking/shell";
import { createDetails, renderDone, summaryList } from "../booking/steps";
import type { PaymentDue } from "../booking/api";
import { CLASSES_CSS } from "./styles";

// widgets/classes.js: "Find a Class". A week strip, then the chosen day's
// classes (time, length, class, instructor, place) with a Book button; one
// spot per booking, through the business's form, then "You're booked in"
// or the pay step for paid drop-ins. Optional Class type and Instructor
// filters. Mounted into <div data-chatalot="classes">.

type ClassesConfig = {
  businessName: string;
  contact: string;
  theme: Theme;
  fields: FormField[];
  copy: { title: string; bookButton: string; successTitle: string; successMessage: string; emptyDay: string };
  settings: { showFilters: boolean };
  widget?: { status: "draft" | "live" };
};

type ClassItem = {
  id: string;
  seriesId: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  instructor: { id: string; name: string; avatarUrl: string | null } | null;
  priceCents: number | null;
  spotsLeft: number | null;
  closed: null | "past" | "cancelled" | "full" | "closed";
};

type Step = "timetable" | "details" | "done";

const TZ = "Africa/Johannesburg";
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, ...o });
const TIME = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
const DAY_HEAD = fmt({ weekday: "long", day: "numeric", month: "long" });
const MONTH = fmt({ month: "long", year: "numeric" });
const WEEKDAY = fmt({ weekday: "short" });
const noon = (d: string) => new Date(`${d}T12:00:00+02:00`);
const rand = (c: number) => `R${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const minutes = (c: ClassItem) => (c.endsAt ? Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60_000) : null);
const CLOSED: Record<NonNullable<ClassItem["closed"]>, string> = { past: "Finished", cancelled: "Cancelled", full: "Full", closed: "Closed" };

// Preview (data-preview) with no classes yet: a believable sample week.
function sampleClasses(from: string): ClassItem[] {
  const out: ClassItem[] = [];
  const plan: [number, string, string, number, number | null][] = [
    [6, "Morning Flow", "Sarah", 60, null],
    [12, "Lunchtime HIIT", "Pete", 45, 8000],
    [18, "Beginners Yoga", "Sarah", 60, 12000],
  ];
  for (let i = 0; i < 14; i++) {
    const day = addDays(from, i);
    if (noon(day).getUTCDay() === 0) continue;
    for (const [hour, title, who, len, price] of plan) {
      const startsAt = new Date(`${day}T${String(hour).padStart(2, "0")}:30:00+02:00`).toISOString();
      out.push({
        id: `sample-${day}-${hour}`,
        seriesId: title,
        title,
        description: "Sample class for previewing the layout. The business adds its own timetable in its Bookfront dashboard.",
        startsAt,
        endsAt: new Date(new Date(startsAt).getTime() + len * 60_000).toISOString(),
        location: "Studio 1",
        instructor: { id: who, name: who, avatarUrl: null },
        priceCents: price,
        spotsLeft: (hour + i) % 4 === 0 ? 2 : 10,
        closed: null,
      });
    }
  }
  return out;
}

const SAMPLE_CONFIG: ClassesConfig = {
  businessName: "Your business",
  contact: "",
  theme: { primary: "#4f46e5", surface: "#ffffff", text: "#18181b", radius: 20, font: "system", mode: "light" },
  fields: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "email", label: "Email", type: "email", required: false },
  ],
  copy: { title: "Find a class", bookButton: "Book", successTitle: "You're booked in!", successMessage: "See you in class.", emptyDay: "No classes on this day." },
  settings: { showFilters: true },
};

function mountClasses(host: HTMLElement, ctx: MountContext): void {
  const shell = createShell(host, ctx, "classes", CLASSES_CSS);
  const details = createDetails(shell);
  const today = localDateISO(new Date());
  let config: ClassesConfig | null = null;
  let weekFrom = today;
  let day = today;
  let step: Step = "timetable";
  let usingSample = false;
  let fatal: string | null = null;
  let alert: string | null = null;
  let submitting = false;
  let current: ClassItem | null = null;
  let result: { payment: PaymentDue | null; payAtClass: boolean; email: string } | null = null;
  let typeFilter = "";
  let staffFilter = "";
  const open = new Set<string>();
  // Classes by SA date; a missing date means "not loaded yet".
  const byDay = new Map<string, ClassItem[]>();
  const loading = new Set<string>();
  const params = (extra: Record<string, string> = {}) => new URLSearchParams({ key: ctx.key, ...(ctx.widgetId ? { id: ctx.widgetId } : {}), ...extra });

  async function loadWeek(from: string) {
    const to = addDays(from, 6);
    if (loading.has(from) || byDay.has(from)) return;
    loading.add(from);
    try {
      let list: ClassItem[] | null = null;
      if (!usingSample) {
        const res = await fetch(`${ctx.apiOrigin}/api/public/classes?${params({ from, to })}`).catch(() => null);
        list = res?.ok ? ((await res.json()) as { classes: ClassItem[] }).classes : null;
        if (!list && !ctx.preview) throw new Error("classes");
      }
      // Preview of a business with no timetable yet: sample classes.
      if (ctx.preview && (usingSample || (from === today && !list?.length))) {
        usingSample = true;
        list = sampleClasses(today);
      }
      for (let d = from; d <= to; d = addDays(d, 1)) byDay.set(d, []);
      for (const c of list ?? []) {
        const d = localDateISO(new Date(c.startsAt));
        if (byDay.has(d)) byDay.get(d)!.push(c);
      }
    } finally {
      loading.delete(from);
    }
    render();
  }

  function setWeek(from: string) {
    weekFrom = from < today ? today : from;
    day = weekFrom;
    render();
    loadWeek(weekFrom).catch(onFail);
    loadWeek(addDays(weekFrom, 7)).catch(() => undefined);
  }

  function onFail() {
    fatal = "The class timetable isn't available right now. Please contact the business directly.";
    render();
  }

  function book(c: ClassItem) {
    if (!config) return;
    current = c;
    details.start(config.fields);
    step = "details";
    alert = null;
    render();
    shell.focusFirst("input, select, textarea");
  }

  async function submit() {
    if (submitting || !current || !config) return;
    const problem = details.check();
    if (problem) {
      alert = problem;
      return render();
    }
    if (ctx.preview) {
      result = { payment: null, payAtClass: Boolean(current.priceCents), email: "" };
      step = "done";
      return render();
    }
    submitting = true;
    alert = null;
    render();
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/public/events/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: ctx.key, widget: "classes", widgetId: ctx.widgetId, eventId: current.id, quantity: 1, ...details.payload() }),
      });
      const json = await res.json().catch(() => ({}));
      submitting = false;
      if (res.ok && json.ok) {
        result = { payment: json.payment ?? null, payAtClass: Boolean(json.payAtEvent), email: details.email() };
        step = "done";
        render();
        emit(host, { widget: "classes", action: "submitted" });
        shell.announce(result.payment ? "Pay to secure your spot" : config.copy.successTitle);
        shell.focusFirst("h2");
        return;
      }
      alert = `${typeof json.error === "string" ? json.error : "We couldn't book you in."}${config.contact ? ` You can also contact ${config.businessName} on ${config.contact}.` : ""}`;
      // Spots may have gone: reload this week.
      byDay.delete(weekFrom);
      loadWeek(weekFrom).catch(() => undefined);
    } catch {
      submitting = false;
      alert = "We couldn't reach the booking system. Check your connection and try again.";
    }
    render();
  }

  // ---- screens ----
  function allLoaded(): ClassItem[] {
    return [...byDay.values()].flat();
  }

  function filters(): HTMLElement | null {
    if (!config?.settings.showFilters) return null;
    const list = allLoaded();
    const types = [...new Set(list.map((c) => c.title))].sort();
    const people = [...new Map(list.filter((c) => c.instructor).map((c) => [c.instructor!.id, c.instructor!.name])).entries()];
    if (types.length < 2 && people.length < 2) return null;
    const select = (label: string, value: string, options: [string, string][], onChange: (v: string) => void, key: string) => {
      const el = h(
        "select",
        { "aria-label": label, "data-k": key },
        h("option", { value: "" }, label),
        options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)),
      );
      el.addEventListener("change", () => onChange(el.value));
      return el;
    };
    return h(
      "div",
      { class: "filters" },
      types.length > 1 ? select("Class type", typeFilter, types.map((t) => [t, t]), (v) => ((typeFilter = v), render()), "ftype") : null,
      people.length > 1 ? select("Instructor", staffFilter, people, (v) => ((staffFilter = v), render()), "fstaff") : null,
    );
  }

  function strip(): HTMLElement {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
    return h(
      "div",
      { class: "strip" },
      shell.button("arrow", "‹", () => setWeek(addDays(weekFrom, -7)), "wprev", { "aria-label": "Previous week", disabled: weekFrom <= today }),
      h(
        "div",
        { class: "days week", role: "radiogroup", "aria-label": "Choose a day" },
        days.map((d) => {
          const has = (byDay.get(d) ?? []).some((c) => !c.closed);
          const b = h(
            "button",
            {
              type: "button",
              class: `day${d === today ? " today" : ""}${has ? " free" : ""}`,
              role: "radio",
              "aria-checked": d === day ? "true" : "false",
              "aria-label": DAY_HEAD.format(noon(d)),
              "data-k": `day-${d}`,
            },
            h("span", { class: "dow", "aria-hidden": "true" }, d === today ? "Today" : WEEKDAY.format(noon(d))),
            h("span", { class: "num", "aria-hidden": "true" }, String(Number(d.slice(8)))),
          );
          b.addEventListener("click", () => ((day = d), render()));
          return b;
        }),
      ),
      shell.button("arrow", "›", () => setWeek(addDays(weekFrom, 7)), "wnext", { "aria-label": "Next week" }),
    );
  }

  function avatar(c: ClassItem) {
    const p = c.instructor;
    if (!p) return null;
    if (p.avatarUrl) return h("img", { class: "avatar", src: p.avatarUrl, alt: "" });
    return h("span", { class: "avatar", "aria-hidden": "true" }, p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase());
  }

  function row(c: ClassItem): HTMLElement {
    const isOpen = open.has(c.id);
    const len = minutes(c);
    const meta = c.closed ? CLOSED[c.closed] : [c.priceCents ? rand(c.priceCents) : "Free", c.spotsLeft !== null && c.spotsLeft <= 5 ? `${c.spotsLeft} left` : null].filter(Boolean).join(" · ");
    return h(
      "li",
      { class: `class-row${c.closed ? " is-closed" : ""}` },
      h("div", { class: "when" }, h("strong", {}, TIME.format(new Date(c.startsAt))), len ? h("span", {}, `${len} min`) : null),
      h(
        "div",
        { class: "what" },
        h("div", { class: "class-title" }, c.title),
        c.instructor ? h("div", { class: "who" }, avatar(c), h("span", {}, c.instructor.name)) : null,
        c.description
          ? shell.button("details", isOpen ? "Hide details ▴" : "Show details ▾", () => (isOpen ? open.delete(c.id) : open.add(c.id), render()), `det-${c.id}`, {
              "aria-expanded": isOpen ? "true" : "false",
            })
          : null,
        isOpen ? h("p", { class: "desc" }, c.description) : null,
      ),
      h("div", { class: "where" }, c.location || ""),
      h(
        "div",
        { class: "act" },
        c.closed ? h("span", { class: "tag" }, meta) : shell.button("book", config!.copy.bookButton, () => book(c), `book-${c.id}`, { "aria-label": `${config!.copy.bookButton} ${c.title} at ${TIME.format(new Date(c.startsAt))}` }),
        c.closed ? null : h("span", { class: "price" }, meta),
      ),
    );
  }

  function timetable(): Node[] {
    const cfg = config!;
    const list = (byDay.get(day) ?? []).filter((c) => (!typeFilter || c.title === typeFilter) && (!staffFilter || c.instructor?.id === staffFilter));
    return [
      h("div", { class: "head" }, h("h2", { id: `${shell.id}-title`, tabindex: -1 }, cfg.copy.title), filters()),
      h(
        "div",
        { class: "cal-bar" },
        h("strong", {}, MONTH.format(noon(day))),
        shell.button("pill", "Today", () => setWeek(today), "today", { disabled: weekFrom === today && day === today }),
      ),
      strip(),
      h("div", { class: "day-head" }, h("strong", {}, DAY_HEAD.format(noon(day))), h("span", { class: "muted" }, "Times are South African time.")),
      !byDay.has(day)
        ? h("div", { class: "slot-grid", "aria-hidden": "true" }, [0, 1, 2].map(() => h("div", { class: "shimmer" })))
        : list.length
          ? h("ul", { class: "class-list" }, list.map(row))
          : h("p", { class: "note muted" }, typeFilter || staffFilter ? "No classes match on this day." : cfg.copy.emptyDay),
    ];
  }

  function detailsScreen(): Node[] {
    const c = current!;
    const cfg = config!;
    return [
      h("div", { class: "head" }, h("div", { class: "title-row" }, shell.button("back", "←", () => ((step = "timetable"), (alert = null), render()), "back", { "aria-label": "Back" }), h("h2", { tabindex: -1 }, "Your details"))),
      summaryList([
        ["Class", c.title],
        ["When", `${DAY_HEAD.format(new Date(c.startsAt))}, ${TIME.format(new Date(c.startsAt))}`],
        ["With", c.instructor?.name ?? null],
        ["Where", c.location || null],
        ["Price", c.priceCents ? rand(c.priceCents) : "Free"],
      ]),
      alert ? h("div", { class: "alert", role: "alert" }, alert) : null,
      details.render({ businessName: cfg.businessName, confirmLabel: c.priceCents ? `${cfg.copy.bookButton} and pay` : cfg.copy.bookButton, submitting, onSubmit: submit }),
    ].filter((n): n is HTMLElement => n !== null);
  }

  function doneScreen(): Node[] {
    const c = current!;
    const cfg = config!;
    const r = result!;
    return renderDone(shell, {
      pending: false,
      title: cfg.copy.successTitle,
      message: [cfg.copy.successMessage, r.payAtClass && c.priceCents ? `Please pay ${rand(c.priceCents)} at the class.` : ""].filter(Boolean).join(" "),
      email: r.email,
      summary: summaryList([
        ["Class", c.title],
        ["When", `${DAY_HEAD.format(new Date(c.startsAt))}, ${TIME.format(new Date(c.startsAt))}`],
        ["With", c.instructor?.name ?? null],
        ["Where", c.location || null],
      ]),
      calendar: { uid: c.id, title: c.title, startsAt: c.startsAt, endsAt: c.endsAt ?? c.startsAt, ref: "" },
      again: { label: "Book another class", onClick: () => ((step = "timetable"), byDay.delete(weekFrom), loadWeek(weekFrom).catch(() => undefined), render()) },
      pay: r.payment,
      held: "spot",
    });
  }

  function render() {
    if (fatal) return shell.paint(() => [h("p", { class: "note" }, fatal)]);
    if (!config) return shell.paint(() => [h("p", { class: "muted note" }, "Loading…")]);
    shell.paint(() => (step === "timetable" ? timetable() : step === "details" ? detailsScreen() : doneScreen()), { done: step === "done" });
  }

  render();
  (async () => {
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/widget/config?${params({ widget: "classes" })}`).catch(() => null);
      if (res?.ok) config = (await res.json()) as ClassesConfig;
      else if (ctx.preview) config = SAMPLE_CONFIG;
      else throw new Error("config");
      shell.applyTheme(config.theme, config.copy.title);
      await loadWeek(weekFrom);
      shell.setNotice(
        ctx.preview
          ? usingSample
            ? "Preview with a sample timetable. This widget isn't set up yet: the business adds its classes in its Bookfront dashboard (Classes), or its onboarding specialist can help. Nothing here is booked."
            : "Preview: the business's real timetable, but nothing here is booked."
          : config.widget?.status === "draft"
            ? "Test widget (Draft): bookings are switched off until it's made Live."
            : null,
      );
      // Open on the first day this week with a class.
      const first = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i)).find((d) => (byDay.get(d) ?? []).some((c) => !c.closed));
      if (first) day = first;
      render();
      loadWeek(addDays(weekFrom, 7)).catch(() => undefined);
      emit(host, { widget: "classes", action: "view" });
    } catch {
      onFail();
    }
  })();
}

registerWidget("classes", mountClasses);
