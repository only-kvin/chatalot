import { localDateISO, formatLocalTime } from "../../lib/time";
import { h } from "../shared/dom";
import { emit } from "../shared/events";
import { registerWidget, type MountContext } from "../shared/loader-contract";
import type { Theme } from "../shared/theme";
import { createApi } from "../booking/api";
import { dayLong } from "../booking/calendar";
import { createPicker } from "../booking/picker";
import { createShell } from "../booking/shell";
import { renderDone, summaryList } from "../booking/steps";

// widgets/reschedule.js: the "change time" picker on a customer's manage
// page (/b/<token>), which ChatAlot hosts. Same picker as the booking
// widgets, for the booking's own service and person; the signed token is
// what authorises the move.
//
// <div data-chatalot="reschedule" data-token data-service data-starts-at
//      data-service-name data-business>

// The manage page is ChatAlot's, not the business's site: a neutral look.
const NEUTRAL: Theme = { primary: "#18181b", surface: "#ffffff", text: "#18181b", radius: 16, font: "system", mode: "light" };

function mountReschedule(host: HTMLElement, ctx: MountContext): void {
  const d = host.dataset;
  const token = d.token ?? "";
  const currentStart = d.startsAt ?? "";
  const api = createApi(ctx.apiOrigin, ctx.key);
  const shell = createShell(host, ctx, "reschedule");
  shell.applyTheme(NEUTRAL, "Change time");

  let chosen: { date: string; time: string } | null = null;
  let alert: string | null = null;
  let moving = false;
  let moved: { startsAt: string; endsAt: string } | null = null;

  const current = currentStart ? { date: localDateISO(new Date(currentStart)), time: formatLocalTime(currentStart) } : null;
  const picker = createPicker({
    shell,
    // The booking's own slot counts as free for moving it (see the API).
    fetch: (q) => api.availability({ ...q, token }),
    rerender: render,
    hideTime: (date, time) => date === current?.date && time === current?.time,
    onChoose(date, time) {
      chosen = { date, time };
      alert = null;
      render();
      shell.announce(`Move to ${dayLong(date)} at ${time}? Confirm below.`);
      shell.focusFirst('[data-k="confirm"]');
    },
  });

  async function confirm() {
    if (!chosen || moving) return;
    moving = true;
    render();
    const res = await api.reschedule(token, chosen.date, chosen.time);
    moving = false;
    if (res.ok) {
      moved = res;
      render();
      emit(host, { widget: "reschedule", action: "submitted" });
      shell.announce("Your booking has been moved.");
      shell.focusFirst("h2");
      return;
    }
    if (res.slotTaken) {
      const { date, time } = chosen;
      const nearest = await picker.refreshAfterTaken(date, time);
      alert = `Sorry, ${time} was just taken.${nearest.length ? " These are the nearest free times:" : ""}`;
    } else {
      alert = res.error;
    }
    chosen = null;
    render();
    shell.announce(alert);
  }

  function render() {
    if (moved) {
      const m = moved;
      return shell.paint(
        () =>
          renderDone(shell, {
          pending: false,
          title: "Your booking has been moved",
          message: "We've emailed you the new details.",
          email: "",
          summary: summaryList([
            ["Service", d.serviceName],
            ["When", `${dayLong(localDateISO(new Date(m.startsAt)))} at ${formatLocalTime(m.startsAt)}`],
          ]),
          calendar: { uid: token.slice(0, 16), title: `${d.serviceName ?? "Appointment"} at ${d.business ?? ""}`, startsAt: m.startsAt, endsAt: m.endsAt, ref: "" },
          again: null,
        }),
        { done: true },
      );
    }
    shell.paint(() => [
      h("div", { class: "head" }, h("h2", { id: `${shell.id}-title`, tabindex: -1 }, "Choose a new time"), picker.viewToggle()),
      current ? h("p", { class: "muted note" }, `Now: ${dayLong(current.date)} at ${current.time}`) : null,
      ...picker.render(alert),
      chosen
        ? h(
            "div",
            { class: "fields" },
            summaryList([["New time", `${dayLong(chosen.date)} at ${chosen.time}`]]),
            shell.button("primary", moving ? "Moving…" : "Move my booking", confirm, "confirm", { disabled: moving }),
          )
        : null,
    ]);
  }

  // Anyone's free times: moving keeps the same person if they're free then,
  // otherwise gives it to whoever is (as in the dashboard).
  picker.setQuery(d.service ?? "", "");
  render();
  picker.load();
}

registerWidget("reschedule", mountReschedule);
