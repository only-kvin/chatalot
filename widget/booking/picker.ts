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
  weekDays,
  weekStart,
  type Slot,
} from "./calendar";
import type { Shell } from "./shell";

// The date-and-time picker shared by every booking widget: a week strip of
// day circles (or the whole month), then the day's times grouped Morning /
// Afternoon / Evening, with booked times shown disabled. Owns its own
// availability cache; the widget around it decides what happens when a
// time is chosen.

export type Picker = {
  // Which service (and optionally person) to show times for. Resets the
  // chosen day when it changes.
  setQuery: (serviceId: string, staffId: string) => void;
  load: () => Promise<void>;
  // The "Full month" / "Week view" toggle, for the widget's header.
  viewToggle: () => HTMLElement;
  // The strip or month, any loading error, and the times for the chosen day.
  render: (alert: string | null) => Node[];
  // After "that time was just taken": reload the day and offer the nearest
  // free times; returns them.
  refreshAfterTaken: (date: string, time: string) => Promise<string[]>;
  clear: () => void;
};

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
  let serviceId = "";
  let staffId = "";
  let view: "week" | "month" = "week";
  let monday = weekStart(today);
  let monthCursor = `${today.slice(0, 7)}-01`;
  let selectedDate: string | null = null;
  let loadError = false;
  let nearest: string[] = [];
  // Slots per service/staff/day; a missing entry means "not loaded yet".
  const cache = new Map<string, Slot[]>();
  const inflight = new Set<string>();

  const cacheKey = (date: string) => `${serviceId}|${staffId}|${date}`;
  const slotsFor = (date: string) => {
    const slots = cache.get(cacheKey(date));
    return slots && opts.hideTime ? slots.filter((s) => !opts.hideTime!(date, s.time)) : slots;
  };
  const hasFree = (date: string) => slotsFor(date)?.some((s) => s.available) ?? false;

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

  // Loads what the current view shows, then the week after (so "next" is instant).
  async function load() {
    if (view === "week") {
      const days = weekDays(monday);
      await ensure(days[0], days[6]);
      if (!selectedDate) {
        const first = days.find((d) => d >= today && hasFree(d));
        if (first) {
          selectedDate = first;
          opts.rerender();
        }
      }
      const next = weekDays(addDays(monday, 7));
      ensure(next[0], next[6]);
    } else {
      const grid = monthGrid(monthCursor);
      await ensure(grid[0], grid[41]);
    }
  }

  function goWeek(delta: number) {
    const next = addDays(monday, 7 * delta);
    if (weekDays(next)[6] < today) return;
    monday = next;
    selectedDate = null;
    nearest = [];
    opts.rerender();
    load();
    shell.announce(`Week of ${dayLong(monday)}`);
  }

  function selectDate(date: string) {
    selectedDate = date;
    nearest = [];
    if (view === "month") {
      view = "week";
      monday = weekStart(date);
      load();
    }
    opts.rerender();
    const free = slotsFor(date)?.filter((s) => s.available).length ?? 0;
    shell.announce(`${dayLong(date)}: ${free} time${free === 1 ? "" : "s"} available`);
  }

  function dayButton(date: string) {
    const loaded = slotsFor(date) !== undefined;
    const past = date < today;
    const disabled = past || (loaded && !hasFree(date));
    const selected = date === selectedDate;
    const b = h(
      "button",
      {
        type: "button",
        class: `day${date === today ? " today" : ""}${!loaded && !past ? " skeleton" : ""}`,
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
    const days = Array.from(shell.card.querySelectorAll<HTMLButtonElement>(".days .day:not(:disabled)"));
    if (!days.length) return;
    const current = days.findIndex((d) => d === shell.shadow.activeElement);
    e.preventDefault();
    let target: HTMLButtonElement | undefined;
    if (e.key === "Home") target = days[0];
    else if (e.key === "End") target = days[days.length - 1];
    else target = days[current + (e.key === "ArrowRight" ? 1 : -1)];
    if (target) {
      selectDate(target.dataset.date!);
      shell.focusFirst(`[data-k="day-${target.dataset.date}"]`);
    } else if (view === "week") {
      goWeek(e.key === "ArrowRight" ? 1 : -1);
    }
  }

  function dayGroup(days: Node[]) {
    const group = h("div", { class: "days", role: "radiogroup", "aria-label": "Choose a day" }, days);
    // Without a selected day, the first open day takes the tab stop.
    if (!group.querySelector('[tabindex="0"]')) group.querySelector<HTMLElement>(".day:not(:disabled)")?.setAttribute("tabindex", "0");
    group.addEventListener("keydown", onDayKeys);
    return group;
  }

  function weekStrip() {
    const strip = h(
      "div",
      { class: "week" },
      shell.button("arrow", "‹", () => goWeek(-1), "prev", { "aria-label": "Previous week", disabled: monday <= weekStart(today) }),
      dayGroup(weekDays(monday).map(dayButton)),
      shell.button("arrow", "›", () => goWeek(1), "next", { "aria-label": "Next week" }),
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
    const month = monthCursor.slice(0, 7);
    const move = (n: number) => {
      monthCursor = addMonths(monthCursor, n);
      opts.rerender();
      load();
      shell.announce(monthLabel(monthCursor));
    };
    return h(
      "div",
      { class: "month" },
      h(
        "div",
        { class: "month-head" },
        shell.button("arrow", "‹", () => move(-1), "mprev", { "aria-label": "Previous month", disabled: month <= today.slice(0, 7) }),
        h("span", {}, monthLabel(monthCursor)),
        shell.button("arrow", "›", () => move(1), "mnext", { "aria-label": "Next month" }),
      ),
      dayGroup(
        monthGrid(monthCursor).map((d) => (d.slice(0, 7) === month ? dayButton(d) : h("span", { class: "day blank", "aria-hidden": "true" }))),
      ),
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
    const date = selectedDate;
    const choose = (t: string) => opts.onChoose(date, t);
    return h(
      "div",
      { class: "slots", role: "group", "aria-label": `Times on ${dayLong(date)}` },
      nearest.length
        ? h(
            "div",
            {},
            h("h3", {}, "Nearest free times"),
            h("div", { class: "slot-grid" }, nearest.map((t) => shell.button("slot", t, () => choose(t), "slot"))),
          )
        : null,
      groupSlots(slots).map((g) =>
        h(
          "div",
          {},
          h("h3", {}, g.label),
          h(
            "div",
            { class: "slot-grid" },
            g.slots.map((s) =>
              shell.button("slot", s.time, () => choose(s.time), "slot", {
                disabled: !s.available,
                "aria-label": `${s.time}${s.available ? "" : ", booked"}`,
              }),
            ),
          ),
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
    viewToggle() {
      return shell.button("ghost", view === "week" ? "Full month" : "Week view", () => {
        view = view === "week" ? "month" : "week";
        if (view === "month") monthCursor = `${(selectedDate ?? monday).slice(0, 7)}-01`;
        opts.rerender();
        load();
      }, "view");
    },
    render(alert) {
      const nodes: (Node | null)[] = [view === "week" ? weekStrip() : monthView()];
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
      if (view === "week") nodes.push(slotList());
      return nodes.filter((n): n is Node => n !== null);
    },
    async refreshAfterTaken(date, time) {
      cache.delete(cacheKey(date));
      await ensure(date, date);
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
