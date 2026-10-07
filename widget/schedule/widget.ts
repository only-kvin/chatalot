import { bookingIcs } from "../../lib/bookings/ics";
import { addDays, localDateISO } from "../../lib/time";
import { h } from "../shared/dom";
import { emit } from "../shared/events";
import { renderForm, type RenderedForm } from "../shared/form";
import type { MountContext } from "../shared/loader-contract";
import { loadFont, themeCss } from "../shared/theme";
import { createApi, type ScheduleConfig, type Service, type Staff } from "./api";
import {
  addMonths,
  dayLong,
  dayNumber,
  dayShort,
  groupSlots,
  monthGrid,
  monthLabel,
  nearestAvailable,
  weekDays,
  weekStart,
  type Slot,
} from "./calendar";
import { SCHEDULE_CSS } from "./styles";

// The schedule widget: pick a day on a week strip (or the month), pick a
// time, fill in the business's form, confirm. Rendered from state on every
// change, inside a Shadow DOM so the host site's CSS can't touch it.

type Step = "pick" | "details" | "done";

let instances = 0;

function price(cents: number | null): string | null {
  if (cents === null) return null;
  return `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export function mountSchedule(host: HTMLElement, ctx: MountContext): void {
  const api = createApi(ctx.apiOrigin, ctx.key);
  const id = `ca-schedule-${++instances}`;
  const shadow = host.attachShadow({ mode: "open" });
  const style = h("style", {}, SCHEDULE_CSS);
  const themeStyle = h("style");
  // Announcements for screen readers live outside the re-rendered card.
  const live = h("div", { class: "sr", "aria-live": "polite" });
  const card = h("section", { class: "card", "aria-labelledby": `${id}-title` });
  shadow.append(style, themeStyle, live);

  let panel: HTMLElement | null = null;
  let launcher: HTMLButtonElement | null = null;
  if (ctx.mode === "float") {
    launcher = h("button", { class: "launcher", "aria-expanded": "false" }, "Book now");
    panel = h("div", { class: "float-panel", role: "dialog", "aria-modal": "false", hidden: true }, card);
    shadow.append(launcher, panel);
  } else {
    shadow.append(card);
  }

  // ---- state ----
  let config: ScheduleConfig | null = null;
  let services: Service[] = [];
  let staff: Staff[] = [];
  let serviceId = "";
  let staffId = "";
  let view: "week" | "month" = "week";
  const today = localDateISO(new Date());
  let monday = weekStart(today);
  let monthCursor = `${today.slice(0, 7)}-01`;
  let selectedDate: string | null = null;
  let selectedTime: string | null = null;
  let step: Step = "pick";
  let fatal: string | null = null;
  let loadError = false;
  let alert: string | null = null;
  let nearest: string[] = [];
  let result: { status: "confirmed" | "pending"; ref: string; startsAt: string; endsAt: string; email: string } | null = null;
  // Slots per service/staff/day; a missing entry means "not loaded yet".
  const cache = new Map<string, Slot[]>();
  const inflight = new Set<string>();
  // Details step: built once per visit to it so typing survives re-renders.
  let form: RenderedForm | null = null;
  let consent: HTMLInputElement | null = null;
  let trap: HTMLInputElement | null = null;
  let idempotencyKey = "";
  let detailsShownAt = 0;
  let submitting = false;

  const cacheKey = (date: string) => `${serviceId}|${staffId}|${date}`;
  const slotsFor = (date: string) => cache.get(cacheKey(date));
  const hasFree = (date: string) => slotsFor(date)?.some((s) => s.available) ?? false;
  const service = () => services.find((s) => s.id === serviceId) ?? null;
  const staffName = (sid: string) => staff.find((p) => p.id === sid)?.name ?? null;
  const announce = (text: string) => {
    live.textContent = "";
    // Cleared first so a repeated message is still read out. Not
    // requestAnimationFrame: browsers pause it in background tabs.
    setTimeout(() => (live.textContent = text), 50);
  };
  const contactLine = () => (config?.contact ? ` You can also contact ${config.businessName} on ${config.contact}.` : "");

  async function ensure(from: string, to: string) {
    const start = from < today ? today : from;
    if (start > to) return;
    const dates: string[] = [];
    for (let d = start; d <= to; d = addDays(d, 1)) dates.push(d);
    if (dates.every((d) => cache.has(cacheKey(d)))) return;
    const rangeKey = `${cacheKey(start)}..${to}`;
    if (inflight.has(rangeKey)) return;
    inflight.add(rangeKey);
    const forService = serviceId;
    const forStaff = staffId;
    try {
      const res = await api.availability({ service: forService, staff: forStaff, from: start, to });
      for (const day of res.days) cache.set(`${forService}|${forStaff}|${day.date}`, day.slots);
      loadError = false;
    } catch {
      loadError = true;
    } finally {
      inflight.delete(rangeKey);
    }
    render();
  }


  // Loads what the current view shows, then the week after (so "next" is instant).
  async function loadVisible() {
    if (view === "week") {
      const days = weekDays(monday);
      await ensure(days[0], days[6]);
      if (step === "pick" && !selectedDate) {
        const first = days.find((d) => d >= today && hasFree(d));
        if (first) {
          selectedDate = first;
          render();
        }
      }
      const next = weekDays(addDays(monday, 7));
      ensure(next[0], next[6]);
    } else {
      const grid = monthGrid(monthCursor);
      await ensure(grid[0], grid[41]);
    }
  }


  // ---- actions ----
  function goWeek(delta: number) {
    const next = addDays(monday, 7 * delta);
    if (weekDays(next)[6] < today) return;
    monday = next;
    selectedDate = null;
    selectedTime = null;
    render();
    loadVisible();
    announce(`Week of ${dayLong(monday)}`);
  }

  function selectDate(date: string) {
    selectedDate = date;
    selectedTime = null;
    nearest = [];
    if (view === "month") {
      view = "week";
      monday = weekStart(date);
      loadVisible();
    }
    render();
    const free = slotsFor(date)?.filter((s) => s.available).length ?? 0;
    announce(`${dayLong(date)}: ${free} time${free === 1 ? "" : "s"} available`);
  }

  function chooseTime(time: string) {
    selectedTime = time;
    step = "details";
    alert = null;
    nearest = [];
    form = renderForm(config!.fields, id);
    consent = h("input", { type: "checkbox", id: `${id}-consent`, required: true });
    trap = h("input", { type: "text", name: "website", tabindex: -1, autocomplete: "off" });
    idempotencyKey = crypto.randomUUID();
    detailsShownAt = Date.now();
    render();
    emit(host, { widget: "schedule", action: "step", step: "details" });
    announce(`Booking ${service()?.name} on ${dayLong(selectedDate!)} at ${time}. Enter your details.`);
    (card.querySelector("input, select, textarea") as HTMLElement | null)?.focus();
  }

  function backToTimes() {
    step = "pick";
    alert = null;
    render();
    (card.querySelector('[data-k="slot"]:not(:disabled)') as HTMLElement | null)?.focus();
  }

  async function submit() {
    if (submitting || !form || !consent || !selectedDate || !selectedTime) return;
    const problem = form.check();
    if (problem) {
      alert = problem;
      render();
      return;
    }
    if (!consent.checked) {
      alert = "Please agree to us saving your details for this booking.";
      render();
      consent.focus();
      return;
    }
    submitting = true;
    alert = null;
    render();
    const res = await api.book({
      serviceId,
      staffId: staffId || null,
      date: selectedDate,
      time: selectedTime,
      answers: form.values(),
      consent: true,
      idempotencyKey,
      website: trap?.value ?? "",
      elapsedMs: Date.now() - detailsShownAt,
    });
    submitting = false;
    if (res.ok) {
      result = { ...res, email: String(form.values().email ?? "") };
      step = "done";
      render();
      emit(host, { widget: "schedule", action: "submitted" });
      announce(res.status === "pending" ? config!.copy.requestedTitle : config!.copy.successTitle);
      (card.querySelector("h2") as HTMLElement | null)?.focus();
      return;
    }
    if (res.slotTaken) {
      // Refresh that day and offer the nearest free times.
      const taken = selectedTime;
      cache.delete(cacheKey(selectedDate));
      await ensure(selectedDate, selectedDate);
      nearest = nearestAvailable(slotsFor(selectedDate) ?? [], taken);
      step = "pick";
      selectedTime = null;
      alert = `Sorry, ${taken} was just taken.${nearest.length ? " These are the nearest free times:" : " Please pick another time."}`;
      render();
      announce(alert);
      return;
    }
    alert = `${res.error}${contactLine()}`;
    render();
    announce(alert);
  }

  function reset() {
    step = "pick";
    selectedTime = null;
    result = null;
    alert = null;
    nearest = [];
    cache.clear();
    render();
    loadVisible();
  }

  // ---- rendering ----
  function header() {
    return h(
      "div",
      { class: "head" },
      h(
        "div",
        {},
        h("h2", { id: `${id}-title`, tabindex: -1 }, config!.copy.title),
        config!.businessName ? h("p", { class: "muted" }, config!.businessName) : null,
      ),
      step === "pick"
        ? button("ghost", view === "week" ? "Full month" : "Week view", () => {
            view = view === "week" ? "month" : "week";
            if (view === "month") monthCursor = `${(selectedDate ?? monday).slice(0, 7)}-01`;
            render();
            loadVisible();
          }, "view")
        : null,
    );
  }

  function button(cls: string, label: string, onClick: () => void, key?: string, attrs: Record<string, string | boolean | number> = {}) {
    const b = h("button", { type: "button", class: cls, "data-k": key, ...attrs }, label);
    b.addEventListener("click", onClick);
    return b;
  }

  function pickers() {
    const showStaff = config!.settings.allowStaffChoice && staff.length > 0;
    if (services.length < 2 && !showStaff) return null;
    const svcSelect = h(
      "select",
      { id: `${id}-service`, "data-k": "service" },
      services.map((s) => {
        const o = h("option", { value: s.id }, [s.name, `${s.durationMinutes} min`, price(s.priceCents)].filter(Boolean).join(" · "));
        o.selected = s.id === serviceId;
        return o;
      }),
    );
    svcSelect.addEventListener("change", () => {
      serviceId = svcSelect.value;
      if (staffId && !service()?.staffIds.includes(staffId)) staffId = "";
      selectedDate = null;
      selectedTime = null;
      render();
      loadVisible();
    });
    const offering = staff.filter((p) => service()?.staffIds.includes(p.id));
    let staffSelect: HTMLSelectElement | null = null;
    if (showStaff && offering.length > 0) {
      staffSelect = h(
        "select",
        { id: `${id}-staff`, "data-k": "staff" },
        h("option", { value: "" }, "Anyone available"),
        offering.map((p) => {
          const o = h("option", { value: p.id }, p.role ? `${p.name} · ${p.role}` : p.name);
          o.selected = p.id === staffId;
          return o;
        }),
      );
      staffSelect.addEventListener("change", () => {
        staffId = staffSelect!.value;
        selectedDate = null;
        selectedTime = null;
        render();
        loadVisible();
      });
    }
    return h(
      "div",
      { class: "pickers" },
      services.length > 1 ? h("label", { for: `${id}-service` }, "Service", svcSelect) : null,
      staffSelect ? h("label", { for: `${id}-staff` }, "With", staffSelect) : null,
    );
  }

  function dayButton(date: string, opts: { other?: boolean } = {}) {
    const loaded = slotsFor(date) !== undefined;
    const past = date < today;
    const disabled = past || (loaded && !hasFree(date));
    const selected = date === selectedDate;
    const b = h(
      "button",
      {
        type: "button",
        class: `day${date === today ? " today" : ""}${opts.other ? " other" : ""}${!loaded && !past ? " skeleton" : ""}`,
        role: "radio",
        "aria-checked": selected ? "true" : "false",
        "aria-label": `${dayLong(date)}${disabled ? ", no times" : ""}`,
        disabled: disabled || (!loaded && !past),
        tabindex: selected ? 0 : -1,
        "data-k": `day-${date}`,
        "data-date": date,
      },
      h("span", { class: "dow", "aria-hidden": "true" }, dayShort(date)),
      h("span", { class: "num", "aria-hidden": "true" }, dayNumber(date)),
    );
    b.addEventListener("click", () => selectDate(date));
    return b;
  }

  // Arrow keys move between days (and into the next/previous week).
  function onDayKeys(e: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const days = Array.from(card.querySelectorAll<HTMLButtonElement>(".days .day:not(:disabled)"));
    if (!days.length) return;
    const current = days.findIndex((d) => d === shadow.activeElement);
    e.preventDefault();
    let target: HTMLButtonElement | undefined;
    if (e.key === "Home") target = days[0];
    else if (e.key === "End") target = days[days.length - 1];
    else target = days[current + (e.key === "ArrowRight" ? 1 : -1)];
    if (target) {
      selectDate(target.dataset.date!);
      (card.querySelector(`[data-k="day-${target.dataset.date}"]`) as HTMLElement | null)?.focus();
    } else if (view === "week") {
      goWeek(e.key === "ArrowRight" ? 1 : -1);
    }
  }

  function weekStrip() {
    const days = weekDays(monday);
    const group = h(
      "div",
      { class: "days", role: "radiogroup", "aria-label": "Choose a day" },
      days.map((d) => dayButton(d)),
    );
    // Without a selected day, the first open day takes the tab stop.
    if (!group.querySelector('[tabindex="0"]')) group.querySelector<HTMLElement>(".day:not(:disabled)")?.setAttribute("tabindex", "0");
    group.addEventListener("keydown", onDayKeys);
    const strip = h(
      "div",
      { class: "week" },
      button("arrow", "‹", () => goWeek(-1), "prev", { "aria-label": "Previous week", disabled: monday <= weekStart(today) }),
      group,
      button("arrow", "›", () => goWeek(1), "next", { "aria-label": "Next week" }),
    );
    let startX = 0;
    strip.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
    strip.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) goWeek(dx < 0 ? 1 : -1);
    });
    return strip;
  }

  function monthView() {
    const grid = monthGrid(monthCursor);
    const month = monthCursor.slice(0, 7);
    const group = h(
      "div",
      { class: "days", role: "radiogroup", "aria-label": "Choose a day" },
      grid.map((d) => (d.slice(0, 7) === month ? dayButton(d) : h("span", { class: "day blank", "aria-hidden": "true" }))),
    );
    if (!group.querySelector('[tabindex="0"]')) group.querySelector<HTMLElement>(".day:not(:disabled)")?.setAttribute("tabindex", "0");
    group.addEventListener("keydown", onDayKeys);
    const move = (n: number) => {
      monthCursor = addMonths(monthCursor, n);
      render();
      loadVisible();
      announce(monthLabel(monthCursor));
    };
    return h(
      "div",
      { class: "month" },
      h(
        "div",
        { class: "month-head" },
        button("arrow", "‹", () => move(-1), "mprev", { "aria-label": "Previous month", disabled: month <= today.slice(0, 7) }),
        h("span", {}, monthLabel(monthCursor)),
        button("arrow", "›", () => move(1), "mnext", { "aria-label": "Next month" }),
      ),
      group,
    );
  }

  function slotList() {
    if (!selectedDate) {
      const anyLoaded = weekDays(monday).some((d) => slotsFor(d) !== undefined);
      const anyFree = weekDays(monday).some((d) => hasFree(d));
      if (anyLoaded && !anyFree) return h("p", { class: "muted note" }, "No times this week. Try the next week.");
      return null;
    }
    const slots = slotsFor(selectedDate);
    if (!slots) return h("p", { class: "muted note" }, "Loading times…");
    const groups = groupSlots(slots);
    return h(
      "div",
      { class: "slots", role: "group", "aria-label": `Times on ${dayLong(selectedDate)}` },
      nearest.length
        ? h(
            "div",
            {},
            h("h3", {}, "Nearest free times"),
            h("div", { class: "slot-grid" }, nearest.map((t) => button("slot", t, () => chooseTime(t), "slot"))),
          )
        : null,
      groups.map((g) =>
        h(
          "div",
          {},
          h("h3", {}, g.label),
          h(
            "div",
            { class: "slot-grid" },
            g.slots.map((s) =>
              button("slot", s.time, () => chooseTime(s.time), "slot", {
                disabled: !s.available,
                "aria-label": `${s.time}${s.available ? "" : ", booked"}`,
              }),
            ),
          ),
        ),
      ),
    );
  }

  function summary(extra: [string, string | null][] = []) {
    const svc = service();
    const rows: [string, string | null][] = [
      ["Service", svc?.name ?? null],
      ["With", staffId ? staffName(staffId) : null],
      ["When", selectedDate && selectedTime ? `${dayLong(selectedDate)} at ${selectedTime}` : null],
      ["Duration", svc ? `${svc.durationMinutes} min` : null],
      ["Price", svc ? price(svc.priceCents) : null],
      ...extra,
    ];
    return h(
      "dl",
      { class: "summary" },
      rows.filter(([, v]) => v).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v!)]),
    );
  }

  function details() {
    const consentRow = h(
      "label",
      { class: "check", for: `${id}-consent` },
      consent!,
      h("span", {}, `I agree to ${config!.businessName || "the business"} saving my details to manage this booking.`),
    );
    const formEl = h(
      "form",
      { novalidate: true },
      h("div", { class: "fields" }, form!.element, consentRow),
      h("div", { class: "trap", "aria-hidden": "true" }, h("label", {}, "Leave this empty", trap!)),
    );
    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      submit();
    });
    const confirm = h("button", { type: "submit", class: "primary", disabled: submitting }, submitting ? "Booking…" : config!.copy.confirmButton);
    formEl.append(confirm);
    return [button("link", "← Change time", backToTimes, "back"), summary(), formEl];
  }

  function done() {
    const r = result!;
    const pending = r.status === "pending";
    const svc = service();
    let calendar: HTMLElement | null = null;
    if (!pending && r.startsAt) {
      const ics = bookingIcs({
        uid: r.ref || idempotencyKey,
        title: `${svc?.name ?? "Appointment"} at ${config!.businessName}`,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        description: r.ref ? `Reference ${r.ref}` : undefined,
      });
      calendar = h(
        "a",
        { class: "ghost", href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), download: "booking.ics" },
        "Add to calendar",
      );
    }
    const message = pending ? config!.copy.requestedMessage : config!.copy.successMessage;
    const emailedTo = typeof result!.email === "string" && result!.email ? result!.email : null;
    return [
      h("div", { class: "tick", "aria-hidden": "true" }, pending ? "…" : "✓"),
      h("h2", { tabindex: -1 }, pending ? config!.copy.requestedTitle : config!.copy.successTitle),
      message ? h("p", { class: "note" }, message) : null,
      emailedTo ? h("p", { class: "note muted" }, `We've emailed the details to ${emailedTo}.`) : null,
      summary([["Reference", r.ref || null]]),
      h("div", { class: "actions" }, calendar, button("ghost", "Book another", reset, "again")),
    ];
  }

  function render() {
    const active = shadow.activeElement as HTMLElement | null;
    const focusKey = active?.dataset?.k;
    themeStyle.textContent = config ? themeCss(config.theme) : "";
    card.className = `card${step === "done" ? " done" : ""}`;
    const body: (Node | null)[] = [];

    if (fatal) {
      body.push(h("p", { class: "note" }, fatal));
    } else if (!config) {
      body.push(h("p", { class: "muted note" }, "Loading…"));
    } else if (step === "done") {
      body.push(...done());
    } else {
      body.push(header());
      if (step === "pick") {
        body.push(pickers(), view === "week" ? weekStrip() : monthView());
        if (loadError) {
          body.push(
            h("div", { class: "alert", role: "alert" }, `We couldn't load the available times.${contactLine()}`),
            button("ghost", "Try again", () => {
              loadError = false;
              render();
              loadVisible();
            }, "retry"),
          );
        }
        if (alert) body.push(h("div", { class: "alert", role: "alert" }, alert));
        if (view === "week") body.push(slotList());
      } else {
        if (alert) body.push(h("div", { class: "alert", role: "alert" }, alert));
        body.push(...details());
      }
    }
    // The details form keeps its inputs (and what was typed) across renders.
    card.replaceChildren(...body.filter((n): n is Node => n !== null));
    // Re-inserting nodes drops focus: put it back on the same element (form
    // fields persist), or its re-created twin.
    if (active?.isConnected) active.focus();
    else if (focusKey) (card.querySelector(`[data-k="${focusKey}"]`) as HTMLElement | null)?.focus();
  }

  // ---- floating mode ----
  if (launcher && panel) {
    const toggle = (open: boolean) => {
      panel!.hidden = !open;
      launcher!.setAttribute("aria-expanded", String(open));
      // After the panel is shown, or the browser won't move focus into it.
      if (open) setTimeout(() => (card.querySelector("h2") as HTMLElement | null)?.focus(), 0);
      else launcher!.focus();
    };
    launcher.addEventListener("click", () => toggle(panel!.hidden));
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") toggle(false);
    });
  }

  // ---- start ----
  render();
  (async () => {
    try {
      const [cfg, catalogue] = await Promise.all([api.config(), api.services()]);
      config = cfg;
      services = catalogue.services;
      staff = catalogue.staff;
      loadFont(cfg.theme.font);
      if (launcher) launcher.textContent = cfg.copy.title;
      if (!services.length) {
        fatal = `Online booking isn't available right now.${cfg.contact ? ` Please contact ${cfg.businessName} on ${cfg.contact}.` : ""}`;
        render();
        return;
      }
      serviceId = services[0].id;
      render();
      emit(host, { widget: "schedule", action: "view" });
      await loadVisible();
    } catch {
      fatal = "Online booking isn't available right now. Please contact the business directly.";
      render();
    }
  })();
}
