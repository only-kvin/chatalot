import { addDays, localDateISO } from "../../lib/time";
import { h } from "../shared/dom";
import type { AvailabilityQuery } from "./api";
import {
  addMonths,
  dayLong,
  dayNumber,
  dayShort,
  groupSlots,
  monthGrid,
  monthLabel,
  nearestAvailable,
  type Slot,
} from "./calendar";
import type { Shell } from "./shell";
import { timeRangeLabel, type BookingLocation } from "../../lib/bookings/price-label";

// The date-and-time picker shared by every booking widget: a strip of seven
// days (or, switched, a month calendar; days with free times have a dot),
// and the chosen day's times grouped Morning / Afternoon / Evening, with
// booked times shown disabled. Owns its own availability cache; the widget
// around it decides what happens when a time is chosen.

export type Picker = {
  // Which service (and optionally person) to show times for. Resets the
  // chosen day when it changes.
  setQuery: (serviceId: string, staffId: string, location?: BookingLocation) => void;
  load: () => Promise<void>;
  // The days and times, plus any loading error or alert above them.
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
  // end: the window's end, for arrival windows.
  onChoose: (date: string, time: string, end?: string) => void;
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
  let location: BookingLocation | undefined;
  // Week view (the default) shows seven days from weekFrom; month view a grid.
  let view: "week" | "month" = "week";
  let weekFrom = today;
  let month = thisMonth;
  let selectedDate: string | null = null;
  let loadError = false;
  let nearest: string[] = [];
  // The day whose times last played their entrance; re-renders for other
  // reasons (e.g. the next page finishing loading) don't replay it.
  let animated: string | null = null;
  // Slots per service/staff/day; a missing entry means "not loaded yet".
  const cache = new Map<string, Slot[]>();
  const inflight = new Set<string>();

  const cacheKey = (date: string) => `${serviceId}|${staffId}|${location ?? ""}|${date}`;
  const slotsFor = (date: string) => {
    const slots = cache.get(cacheKey(date));
    return slots && opts.hideTime ? slots.filter((s) => !opts.hideTime!(date, s.time)) : slots;
  };
  const hasFree = (date: string) => slotsFor(date)?.some((s) => s.available) ?? false;
  // The days of a month (the 1st given), in order.
  const daysOf = (first: string) => monthGrid(first).filter((d) => d.slice(0, 7) === first.slice(0, 7));
  const weekOf = (from: string) => Array.from({ length: 7 }, (_, i) => addDays(from, i));
  // The days on show now.
  const visible = () => (view === "week" ? weekOf(weekFrom) : daysOf(month));

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
    const forLocation = location;
    try {
      const res = await opts.fetch({ service: forService, staff: forStaff, from: start, to, location: forLocation });
      for (const day of res.days) cache.set(`${forService}|${forStaff}|${forLocation ?? ""}|${day.date}`, day.slots);
      loadError = false;
    } catch {
      loadError = true;
    } finally {
      inflight.delete(rangeKey);
    }
    opts.rerender();
  }

  // Loads the days on show and picks the first free one, then quietly loads
  // the next page so "›" is instant.
  async function load() {
    const days = visible();
    await ensure(days[0], days[days.length - 1]);
    if (!selectedDate || !days.includes(selectedDate)) {
      const first = days.find((d) => d >= today && hasFree(d));
      if (first) {
        selectedDate = first;
        opts.rerender();
      }
    }
    const next = view === "week" ? weekOf(addDays(weekFrom, 7)) : daysOf(addMonths(month, 1));
    ensure(next[0], next[next.length - 1]);
  }

  function show(changes: () => void, announce?: string) {
    changes();
    nearest = [];
    opts.rerender();
    load();
    if (announce) shell.announce(announce);
  }

  // A week or a month back or forward.
  function page(delta: number) {
    if (view === "week") {
      const next = addDays(weekFrom, delta * 7);
      if (next < today) return;
      show(() => ((weekFrom = next), (selectedDate = null)), `${dayLong(next)} to ${dayLong(addDays(next, 6))}`);
    } else {
      const next = addMonths(month, delta);
      if (next < thisMonth) return;
      show(() => ((month = next), (selectedDate = null)), monthLabel(next));
    }
  }

  function setView(next: "week" | "month") {
    const anchor = selectedDate ?? (view === "week" ? weekFrom : today);
    show(() => {
      view = next;
      if (next === "month") month = `${anchor.slice(0, 7)}-01`;
      else weekFrom = anchor < today ? today : anchor;
    }, next === "month" ? "Month view" : "Week view");
  }

  // Straight to a day, e.g. "Next available".
  function jumpTo(date: string) {
    show(() => {
      if (view === "week") weekFrom = date;
      else month = `${date.slice(0, 7)}-01`;
      selectedDate = date;
    }, dayLong(date));
  }

  function selectDate(date: string) {
    selectedDate = date;
    nearest = [];
    opts.rerender();
    const free = slotsFor(date)?.filter((s) => s.available).length ?? 0;
    shell.announce(`${dayLong(date)}: ${free} time${free === 1 ? "" : "s"} available`);
  }

  function dayButton(date: string, label?: string) {
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
      label ? h("span", { class: "dow", "aria-hidden": "true" }, label) : null,
      h("span", { class: "num", "aria-hidden": "true" }, dayNumber(date)),
    );
    b.addEventListener("click", () => selectDate(date));
    return b;
  }

  // Arrow keys move a day (left/right) or, on the month, a week (up/down) to
  // the nearest open day; past the edge they turn the page.
  function onDayKeys(e: KeyboardEvent) {
    const moves: Record<string, number> = view === "month" ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } : { ArrowLeft: -1, ArrowRight: 1 };
    const step = moves[e.key];
    if (step === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const days = visible();
    const open = days.filter((d) => d >= today && hasFree(d));
    if (!open.length) return;
    let target: string | undefined;
    if (e.key === "Home") target = open[0];
    else if (e.key === "End") target = open[open.length - 1];
    else {
      for (let d = addDays(selectedDate ?? open[0], step); days.includes(d); d = addDays(d, step > 0 ? 1 : -1)) {
        if (open.includes(d)) {
          target = d;
          break;
        }
      }
      if (!target) return page(step > 0 ? 1 : -1);
    }
    selectDate(target);
    shell.focusFirst(`[data-k="day-${target}"]`);
  }

  function dayGroup(label: string, children: Node[], cls: string) {
    const days = h("div", { class: cls, role: "radiogroup", "aria-label": label }, children);
    // Without a selected day, the first open day takes the tab stop.
    if (!days.querySelector('[tabindex="0"]')) days.querySelector<HTMLElement>(".day:not(:disabled)")?.setAttribute("tabindex", "0");
    days.addEventListener("keydown", onDayKeys);
    return days;
  }

  // Swipe sideways to turn the page.
  function swipeable(el: HTMLElement) {
    let startX = 0;
    el.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
    el.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) page(dx < 0 ? 1 : -1);
    });
    return el;
  }

  // The month, "Today", and the week/month switch.
  function bar() {
    return h(
      "div",
      { class: "cal-bar" },
      h("strong", {}, monthLabel(view === "week" ? (selectedDate ?? weekFrom) : month)),
      shell.button("pill", "Today", () => show(() => ((view = "week"), (weekFrom = today), (selectedDate = null))), "today", {
        disabled: view === "week" && weekFrom === today,
      }),
      shell.button("pill toggle", view === "week" ? "Month view" : "Week view", () => setView(view === "week" ? "month" : "week"), "view", {
        "aria-pressed": view === "month" ? "true" : "false",
      }),
    );
  }

  function strip() {
    const days = weekOf(weekFrom);
    return swipeable(
      h(
        "div",
        { class: "strip" },
        shell.button("arrow", "‹", () => page(-1), "wprev", { "aria-label": "Previous week", disabled: weekFrom <= today }),
        dayGroup(
          `Choose a day, ${dayLong(days[0])} to ${dayLong(days[6])}`,
          days.map((d) => dayButton(d, d === today ? "Today" : dayShort(d))),
          "days week",
        ),
        shell.button("arrow", "›", () => page(1), "wnext", { "aria-label": "Next week" }),
      ),
    );
  }

  function calendar() {
    const inMonth = month.slice(0, 7);
    // Most months need five weeks, not six: drop a sixth week that's all next month.
    const grid = monthGrid(month);
    const cells = grid[35].slice(0, 7) === inMonth ? grid : grid.slice(0, 35);
    return swipeable(
      h(
        "div",
        { class: "cal" },
        h(
          "div",
          { class: "cal-head" },
          shell.button("arrow", "‹", () => page(-1), "mprev", { "aria-label": "Previous month", disabled: month <= thisMonth }),
          h("span", { "aria-live": "off" }, monthLabel(month)),
          shell.button("arrow", "›", () => page(1), "mnext", { "aria-label": "Next month" }),
        ),
        h("div", { class: "dows", "aria-hidden": "true" }, DOWS.map((d) => h("span", {}, d.slice(0, 2)))),
        dayGroup(
          `Choose a day in ${monthLabel(month)}`,
          cells.map((d) => (d.slice(0, 7) === inMonth ? dayButton(d) : h("span", { class: "day blank", "aria-hidden": "true" }))),
          "days",
        ),
      ),
    );
  }

  // The first free day after the ones on show, from what's already loaded.
  function nextFreeAfter(last: string): string | null {
    for (let d = addDays(last, 1), i = 0; i < 31; d = addDays(d, 1), i++) {
      if (slotsFor(d) === undefined) return null;
      if (hasFree(d)) return d;
    }
    return null;
  }

  function times() {
    const days = visible();
    if (!selectedDate) {
      const loaded = days.filter((d) => d >= today).every((d) => slotsFor(d) !== undefined);
      if (loaded && !days.some(hasFree)) {
        const next = nextFreeAfter(days[days.length - 1]);
        return h(
          "div",
          { class: "times" },
          h("span", { class: "chip none" }, view === "week" ? "No appointments this week" : `No times left in ${monthLabel(month).split(" ")[0]}`),
          next
            ? h("div", { class: "next" }, h("span", { class: "muted" }, "Next available:"), shell.button("pill", dayLong(next), () => jumpTo(next), "nextfree"))
            : shell.button("pill", view === "week" ? "Next week" : "Next month", () => page(1), "nextpage"),
        );
      }
      // Still loading: placeholders shaped like the times that will appear.
      return h("div", { class: "times", "aria-hidden": "true" }, h("div", { class: "slot-grid" }, [0, 1, 2, 3, 4, 5].map(() => h("div", { class: "shimmer" }))));
    }
    const slots = slotsFor(selectedDate);
    const date = selectedDate;
    const endOf = (t: string) => slots?.find((s) => s.time === t)?.end;
    // Window labels are wider than times.
    const grid = slots?.some((s) => s.end) ? "slot-grid wide" : "slot-grid";
    const choose = (t: string) => opts.onChoose(date, t, endOf(t));
    const freeCount = slots?.filter((s) => s.available).length ?? 0;
    const animate = slots !== undefined && animated !== `${cacheKey(date)}|${nearest.join()}`;
    if (animate) animated = `${cacheKey(date)}|${nearest.join()}`;
    let i = 0;
    // Arrival windows read "08:00–10:00".
    const slotButton = (time: string, available = true) =>
      shell.button(animate ? "slot in" : "slot", timeRangeLabel(time, endOf(time)), () => choose(time), "slot", {
        disabled: !available,
        "aria-label": `${endOf(time) ? `Between ${time} and ${endOf(time)}` : time}${available ? "" : ", booked"}`,
        style: animate ? `--i:${i++}` : false,
      });
    return h(
      "div",
      { class: "times" },
      h(
        "div",
        { class: "times-head" },
        h("strong", {}, `Available ${dayLong(date)}`),
        slots ? h("span", { class: "chip" }, `${freeCount} free`) : null,
      ),
      !slots
        ? h("div", { class: "slot-grid", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("div", { class: "shimmer" })))
        : h(
            "div",
            { class: "slots", role: "group", "aria-label": `Times on ${dayLong(date)}` },
            nearest.length
              ? h("div", {}, h("h3", {}, "Nearest free times"), h("div", { class: grid }, nearest.map((t) => slotButton(t))))
              : null,
            groupSlots(slots).map((g) =>
              h("div", {}, h("h3", {}, g.label), h("div", { class: grid }, g.slots.map((s) => slotButton(s.time, s.available)))),
            ),
          ),
    );
  }

  return {
    setQuery(nextService, nextStaff, nextLocation) {
      if (nextService === serviceId && nextStaff === staffId && nextLocation === location) return;
      serviceId = nextService;
      staffId = nextStaff;
      location = nextLocation;
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
      nodes.push(h("div", { class: "picker" }, bar(), view === "week" ? strip() : calendar(), times()));
      return nodes;
    },
    async refreshAfterTaken(date, time) {
      cache.delete(cacheKey(date));
      await ensure(date, date);
      month = `${date.slice(0, 7)}-01`;
      if (!weekOf(weekFrom).includes(date)) weekFrom = date;
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
