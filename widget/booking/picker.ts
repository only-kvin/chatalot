import { addDays, localDateISO } from "../../lib/time";
import { h } from "../shared/dom";
import type { AvailabilityQuery } from "./api";
import {
  addMonths,
  dayLong,
  dayNumber,
  groupSlots,
  monthGrid,
  monthLabel,
  nearestAvailable,
  type Slot,
} from "./calendar";
import type { Shell } from "./shell";

// The date-and-time picker shared by every booking widget: a month calendar
// (days with free times marked with a dot), and the chosen day's times
// grouped Morning / Afternoon / Evening, with booked times shown disabled.
// Side by side on wide widgets, stacked on narrow ones. Owns its own
// availability cache; the widget around it decides what happens when a
// time is chosen.

export type Picker = {
  // Which service (and optionally person) to show times for. Resets the
  // chosen day when it changes.
  setQuery: (serviceId: string, staffId: string) => void;
  load: () => Promise<void>;
  // The calendar and times, plus any loading error or alert above them.
  render: (alert: string | null) => Node[];
  // After "that time was just taken": reload the day and offer the nearest
  // free times; returns them.
  refreshAfterTaken: (date: string, time: string) => Promise<string[]>;
  clear: () => void;
};

const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function createPicker(opts: {
  shell: Shell;
  fetch: (q: AvailabilityQuery) => Promise<{ days: { date: string; slots: Slot[] }[] }>;
  onChoose: (date: string, time: string) => void;
  rerender: () => void;
  // Times not to offer (e.g. the booking's own current time when moving it).
  hideTime?: (date: string, time: string) => boolean;
  // Added to error messages, e.g. " You can also call us on …".
  contactLine?: () => string;
}): Picker {
  const { shell } = opts;
  const today = localDateISO(new Date());
  const thisMonth = `${today.slice(0, 7)}-01`;
  let serviceId = "";
  let staffId = "";
  let month = thisMonth;
  let selectedDate: string | null = null;
  let loadError = false;
  let nearest: string[] = [];
  // The day whose times last played their entrance; re-renders for other
  // reasons (e.g. next month finishing loading) don't replay it.
  let animated: string | null = null;
  // Slots per service/staff/day; a missing entry means "not loaded yet".
  const cache = new Map<string, Slot[]>();
  const inflight = new Set<string>();

  const cacheKey = (date: string) => `${serviceId}|${staffId}|${date}`;
  const slotsFor = (date: string) => {
    const slots = cache.get(cacheKey(date));
    return slots && opts.hideTime ? slots.filter((s) => !opts.hideTime!(date, s.time)) : slots;
  };
  const hasFree = (date: string) => slotsFor(date)?.some((s) => s.available) ?? false;
  // The days of a month (the 1st given), in order.
  const daysOf = (first: string) => monthGrid(first).filter((d) => d.slice(0, 7) === first.slice(0, 7));

  async function ensure(from: string, to: string) {
    const start = from < today ? today : from;
    if (start > to || !serviceId) return;
    const dates: string[] = [];
    for (let d = start; d <= to; d = addDays(d, 1)) dates.push(d);
    if (dates.every((d) => cache.has(cacheKey(d)))) return;
    const rangeKey = `${cacheKey(start)}..${to}`;
    if (inflight.has(rangeKey)) return;
    inflight.add(rangeKey);
    const forService = serviceId;
    const forStaff = staffId;
    try {
      const res = await opts.fetch({ service: forService, staff: forStaff, from: start, to });
      for (const day of res.days) cache.set(`${forService}|${forStaff}|${day.date}`, day.slots);
      loadError = false;
    } catch {
      loadError = true;
    } finally {
      inflight.delete(rangeKey);
    }
    opts.rerender();
  }

  // Loads the month on show and picks its first free day, then quietly loads
  // the next month so "›" is instant.
  async function load() {
    const days = daysOf(month);
    await ensure(days[0], days[days.length - 1]);
    if (!selectedDate || selectedDate.slice(0, 7) !== month.slice(0, 7)) {
      const first = days.find((d) => d >= today && hasFree(d));
      if (first) {
        selectedDate = first;
        opts.rerender();
      }
    }
    const next = daysOf(addMonths(month, 1));
    ensure(next[0], next[next.length - 1]);
  }

  function goMonth(delta: number) {
    const next = addMonths(month, delta);
    if (next < thisMonth) return;
    month = next;
    selectedDate = null;
    nearest = [];
    opts.rerender();
    load();
    shell.announce(monthLabel(month));
  }

  function selectDate(date: string) {
    selectedDate = date;
    nearest = [];
    opts.rerender();
    const free = slotsFor(date)?.filter((s) => s.available).length ?? 0;
    shell.announce(`${dayLong(date)}: ${free} time${free === 1 ? "" : "s"} available`);
  }

  function dayButton(date: string) {
    const loaded = slotsFor(date) !== undefined;
    const past = date < today;
    const free = loaded && hasFree(date);
    const disabled = past || (loaded && !free);
    const selected = date === selectedDate;
    const b = h(
      "button",
      {
        type: "button",
        class: `day${date === today ? " today" : ""}${free ? " free" : ""}${!loaded && !past ? " skeleton" : ""}`,
        role: "radio",
        "aria-checked": selected ? "true" : "false",
        "aria-label": `${dayLong(date)}${disabled ? ", no times" : ""}`,
        disabled: disabled || (!loaded && !past),
        tabindex: selected ? 0 : -1,
        "data-k": `day-${date}`,
        "data-date": date,
      },
      h("span", { class: "num", "aria-hidden": "true" }, dayNumber(date)),
    );
    b.addEventListener("click", () => selectDate(date));
    return b;
  }

  // Arrow keys move a day (left/right) or a week (up/down) to the nearest
  // open day; past the month's edge they turn the page.
  function onDayKeys(e: KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const open = daysOf(month).filter((d) => d >= today && hasFree(d));
    if (!open.length) return;
    let target: string | undefined;
    if (e.key === "Home") target = open[0];
    else if (e.key === "End") target = open[open.length - 1];
    else {
      const from = selectedDate ?? open[0];
      for (let d = addDays(from, step!); d.slice(0, 7) === month.slice(0, 7); d = addDays(d, step! > 0 ? 1 : -1)) {
        if (open.includes(d)) {
          target = d;
          break;
        }
      }
      if (!target) return goMonth(step! > 0 ? 1 : -1);
    }
    selectDate(target);
    shell.focusFirst(`[data-k="day-${target}"]`);
  }

  function calendar() {
    const inMonth = month.slice(0, 7);
    // Most months need five weeks, not six: drop a sixth week that's all next month.
    const grid = monthGrid(month);
    const cells = grid[35].slice(0, 7) === inMonth ? grid : grid.slice(0, 35);
    const days = h(
      "div",
      { class: "days", role: "radiogroup", "aria-label": `Choose a day in ${monthLabel(month)}` },
      cells.map((d) => (d.slice(0, 7) === inMonth ? dayButton(d) : h("span", { class: "day blank", "aria-hidden": "true" }))),
    );
    // Without a selected day, the first open day takes the tab stop.
    if (!days.querySelector('[tabindex="0"]')) days.querySelector<HTMLElement>(".day:not(:disabled)")?.setAttribute("tabindex", "0");
    days.addEventListener("keydown", onDayKeys);

    const cal = h(
      "div",
      { class: "cal" },
      h(
        "div",
        { class: "cal-head" },
        shell.button("arrow", "‹", () => goMonth(-1), "mprev", { "aria-label": "Previous month", disabled: month <= thisMonth }),
        h("span", { "aria-live": "off" }, monthLabel(month)),
        shell.button("arrow", "›", () => goMonth(1), "mnext", { "aria-label": "Next month" }),
      ),
      h("div", { class: "dows", "aria-hidden": "true" }, DOWS.map((d) => h("span", {}, d.slice(0, 2)))),
      days,
    );
    // Swipe sideways to change month.
    let startX = 0;
    cal.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
    cal.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) goMonth(dx < 0 ? 1 : -1);
    });
    return cal;
  }

  function times() {
    const days = daysOf(month);
    if (!selectedDate) {
      const loaded = days.filter((d) => d >= today).every((d) => slotsFor(d) !== undefined);
      if (loaded && !days.some(hasFree)) {
        return h(
          "div",
          { class: "times" },
          h("p", { class: "muted note" }, `No times left in ${monthLabel(month).split(" ")[0]}.`),
          shell.button("ghost", "Try next month", () => goMonth(1), "nextmonth"),
        );
      }
      // Still loading: placeholders shaped like the times that will appear.
      return h("div", { class: "times", "aria-hidden": "true" }, h("div", { class: "slot-grid" }, [0, 1, 2, 3, 4, 5].map(() => h("div", { class: "shimmer" }))));
    }
    const slots = slotsFor(selectedDate);
    const date = selectedDate;
    const choose = (t: string) => opts.onChoose(date, t);
    const freeCount = slots?.filter((s) => s.available).length ?? 0;
    const animate = slots !== undefined && animated !== `${cacheKey(date)}|${nearest.join()}`;
    if (animate) animated = `${cacheKey(date)}|${nearest.join()}`;
    let i = 0;
    const slotButton = (time: string, available = true) =>
      shell.button(animate ? "slot in" : "slot", time, () => choose(time), "slot", {
        disabled: !available,
        "aria-label": `${time}${available ? "" : ", booked"}`,
        style: animate ? `--i:${i++}` : false,
      });
    return h(
      "div",
      { class: "times" },
      h(
        "div",
        { class: "times-head" },
        h("strong", {}, dayLong(date)),
        slots ? h("span", { class: "chip" }, `${freeCount} free`) : null,
      ),
      !slots
        ? h("div", { class: "slot-grid", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("div", { class: "shimmer" })))
        : h(
            "div",
            { class: "slots", role: "group", "aria-label": `Times on ${dayLong(date)}` },
            nearest.length
              ? h("div", {}, h("h3", {}, "Nearest free times"), h("div", { class: "slot-grid" }, nearest.map((t) => slotButton(t))))
              : null,
            groupSlots(slots).map((g) =>
              h("div", {}, h("h3", {}, g.label), h("div", { class: "slot-grid" }, g.slots.map((s) => slotButton(s.time, s.available)))),
            ),
          ),
    );
  }

  return {
    setQuery(nextService, nextStaff) {
      if (nextService === serviceId && nextStaff === staffId) return;
      serviceId = nextService;
      staffId = nextStaff;
      selectedDate = null;
      nearest = [];
    },
    load,
    render(alert) {
      const nodes: Node[] = [];
      if (loadError) {
        nodes.push(
          h("div", { class: "alert", role: "alert" }, `We couldn't load the available times.${opts.contactLine?.() ?? ""}`),
          shell.button("ghost", "Try again", () => {
            loadError = false;
            opts.rerender();
            load();
          }, "retry"),
        );
      }
      if (alert) nodes.push(h("div", { class: "alert", role: "alert" }, alert));
      nodes.push(h("div", { class: "picker" }, calendar(), times()));
      return nodes;
    },
    async refreshAfterTaken(date, time) {
      cache.delete(cacheKey(date));
      await ensure(date, date);
      month = `${date.slice(0, 7)}-01`;
      selectedDate = date;
      nearest = nearestAvailable(slotsFor(date) ?? [], time);
      return nearest;
    },
    clear() {
      cache.clear();
      selectedDate = null;
      nearest = [];
    },
  };
}
