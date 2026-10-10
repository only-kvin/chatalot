import { h } from "../shared/dom";
import { emit } from "../shared/events";
import type { MountContext } from "../shared/loader-contract";
import { createApi, price, type BaseConfig, type Service, type Staff } from "../booking/api";
import { dayLong } from "../booking/calendar";
import { createPicker } from "../booking/picker";
import { createShell } from "../booking/shell";
import { createDetails, renderDone, summaryList } from "../booking/steps";
import { createWhere } from "../booking/where";
import { timeRangeLabel, type BookingLocation } from "../../lib/bookings/price-label";
import { APPOINTMENT_CSS } from "../booking/styles";
import { filterServices, groupServices, needsStaffStep, previousStep, SEARCH_FROM, STEP_LABEL, stepsFor, type Step } from "./flow";

// The appointment widget: service first (a menu of treatments), then who,
// then when, then the customer's details. Everything happens inside the
// widget; going back keeps what was chosen and typed.

type AppointmentConfig = BaseConfig & {
  copy: BaseConfig["copy"] & { nextSteps: string };
  settings: { allowAnyStaff: boolean; groupByCategory: boolean };
};

// "" = anyone free; otherwise a staff id.
const ANY = "";

export function mountAppointment(host: HTMLElement, ctx: MountContext): void {
  const api = createApi(ctx.apiOrigin, ctx.key);
  const shell = createShell(host, ctx, "appointment", APPOINTMENT_CSS);
  const details = createDetails(shell);
  const where = createWhere(shell);

  let config: AppointmentConfig | null = null;
  let services: Service[] = [];
  let staff: Staff[] = [];
  let step: Step = "service";
  let done = false;
  let fatal: string | null = null;
  let alert: string | null = null;
  let query = "";
  let serviceId = "";
  let staffId = ANY;
  let chosen: { date: string; time: string; end?: string } | null = null;
  let submitting = false;
  let result: {
    status: "confirmed" | "pending";
    ref: string;
    startsAt: string;
    endsAt: string;
    staffName: string | null;
    email: string;
    calloutFeeCents?: number | null;
    outsideArea?: boolean;
  } | null = null;
  // The details form is built once and kept when going back and forth.
  let detailsFor: string | null = null;

  const service = () => services.find((s) => s.id === serviceId) ?? null;
  const offering = () => staff.filter((p) => service()?.staffIds.includes(p.id));
  // Before a service is picked, assume the "who" step whenever the business
  // has a choice of staff, so "Step 1 of N" doesn't change under them.
  const steps = () => stepsFor(needsStaffStep(serviceId ? offering().length : staff.length), where.needsChoice(service()));
  const atCustomer = () => where.location(service()) === "customer";
  const whenLabel = (c: { date: string; time: string; end?: string }) =>
    c.end ? `${dayLong(c.date)}, between ${c.time} and ${c.end}` : `${dayLong(c.date)} at ${c.time}`;
  const contactLine = () => (config?.contact ? ` You can also contact ${config.businessName} on ${config.contact}.` : "");
  const personName = () => (staffId ? staff.find((p) => p.id === staffId)?.name : null);

  const picker = createPicker({
    shell,
    fetch: api.availability,
    rerender: render,
    contactLine,
    onChoose(date, time, end) {
      chosen = { date, time, end };
      alert = null;
      // Keep what they'd typed if they come back to the same form.
      if (detailsFor === null) details.start(config!.fields);
      detailsFor = `${serviceId}|${staffId}`;
      go("details");
      shell.announce(`${service()?.name} on ${whenLabel({ date, time, end })}. Enter your details.`);
      shell.focusFirst("input, select, textarea");
    },
  });

  function go(next: Step) {
    step = next;
    if (next === "time") {
      picker.setQuery(serviceId, staffId, where.location(service()));
      picker.load();
    }
    render();
    emit(host, { widget: "appointment", action: "step", step: next });
    if (next !== "details") shell.focusFirst("h2");
  }

  function back() {
    const prev = previousStep(steps(), step);
    if (!prev) return;
    alert = null;
    go(prev);
  }

  function chooseService(id: string) {
    serviceId = id;
    const people = offering();
    // One person (or none): no choice to make.
    staffId = people.length === 1 ? people[0].id : config!.settings.allowAnyStaff || people.length === 0 ? ANY : people[0].id;
    chosen = null;
    where.reset();
    go(where.needsChoice(service()) ? "where" : needsStaffStep(people.length) ? "staff" : "time");
    shell.announce(`${service()?.name} chosen.`);
  }

  function chooseWhere(l: BookingLocation) {
    where.choose(l);
    chosen = null;
    go(needsStaffStep(offering().length) ? "staff" : "time");
    shell.announce(l === "customer" ? "At your place." : "At our place.");
  }

  function chooseStaff(id: string) {
    staffId = id;
    chosen = null;
    go("time");
    shell.announce(id ? `${personName()} chosen.` : "Anyone available.");
  }

  async function submit() {
    if (submitting || !chosen) return;
    const problem = where.check(service()) ?? details.check();
    if (problem) {
      alert = problem;
      render();
      return;
    }
    submitting = true;
    alert = null;
    render();
    const res = await api.book("appointment", {
      serviceId,
      staffId: staffId || null,
      date: chosen.date,
      time: chosen.time,
      ...where.payload(service()),
      ...details.payload(),
    });
    submitting = false;
    if (res.ok) {
      result = { ...res, email: details.email() };
      done = true;
      render();
      emit(host, { widget: "appointment", action: "submitted" });
      shell.announce(res.status === "pending" ? config!.copy.requestedTitle : config!.copy.successTitle);
      shell.focusFirst("h2");
      return;
    }
    if (res.slotTaken) {
      const { date, time, end } = chosen;
      const nearest = await picker.refreshAfterTaken(date, time);
      chosen = null;
      alert = `Sorry, ${timeRangeLabel(time, end)} was just taken.${nearest.length ? " These are the nearest free times:" : " Please pick another time."}`;
      step = "time";
      render();
      shell.announce(alert);
      return;
    }
    alert = `${res.error}${contactLine()}`;
    render();
    shell.announce(alert);
  }

  // ---- screens ----
  function header() {
    const list = steps();
    const index = list.indexOf(step);
    const prev = previousStep(list, step);
    return h(
      "div",
      { class: "head" },
      h(
        "div",
        {},
        h(
          "div",
          { class: "title-row" },
          prev ? shell.button("back", "←", back, "back", { "aria-label": `Back to ${STEP_LABEL[prev].toLowerCase()}` }) : null,
          h("h2", { id: `${shell.id}-title`, tabindex: -1 }, config!.copy.title),
        ),
        h(
          "div",
          { class: "stepper" },
          h(
            "ol",
            { "aria-hidden": "true" },
            list.map((s, i) => h("li", { class: i < index ? "done" : "", "aria-current": s === step ? "step" : null })),
          ),
          h("span", {}, `Step ${index + 1} of ${list.length}: ${STEP_LABEL[step]}`),
        ),
      ),
    );
  }

  function serviceStep(): Node[] {
    const nodes: Node[] = [];
    if (services.length >= SEARCH_FROM) {
      const search = h("input", {
        type: "search",
        class: "search",
        placeholder: "Search services",
        "aria-label": "Search services",
        value: query,
        "data-k": "search",
      });
      search.addEventListener("input", () => {
        query = search.value;
        render();
      });
      nodes.push(search);
    }
    const shown = filterServices(services, query);
    if (!shown.length) nodes.push(h("p", { class: "empty" }, "No services match that search."));
    for (const group of groupServices(shown, config!.settings.groupByCategory)) {
      nodes.push(
        h(
          "div",
          { class: "group" },
          group.category ? h("h3", {}, group.category) : null,
          h(
            "ul",
            { class: "list" },
            group.services.map((s) =>
              h(
                "li",
                { class: "item" },
                h(
                  "div",
                  { class: "body" },
                  h("div", { class: "name" }, s.name),
                  s.description ? h("div", { class: "desc" }, s.description) : null,
                  h(
                    "div",
                    { class: "meta" },
                    [`${s.durationMinutes} min`, s.location === "customer" ? "We come to you" : s.location === "either" ? "Here or at yours" : null, price(s)]
                      .filter(Boolean)
                      .join(" · "),
                  ),
                ),
                shell.button("pick", "Book", () => chooseService(s.id), `svc-${s.id}`, { "aria-label": `Book ${s.name}` }),
              ),
            ),
          ),
        ),
      );
    }
    return nodes;
  }

  function avatar(p: Staff | null) {
    if (p?.avatarUrl) return h("img", { class: "avatar", src: p.avatarUrl, alt: "" });
    const initials = p ? p.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : "★";
    return h("span", { class: "avatar", "aria-hidden": "true" }, initials);
  }

  function staffStep(): Node[] {
    const rows: Node[] = [];
    if (config!.settings.allowAnyStaff) {
      rows.push(
        h(
          "li",
          { class: "item" },
          avatar(null),
          h("div", { class: "body" }, h("div", { class: "name" }, "Any available"), h("div", { class: "desc" }, "The first person free at the time you pick")),
          shell.button("pick", "Select", () => chooseStaff(ANY), "staff-any", { "aria-label": "Select anyone available" }),
        ),
      );
    }
    for (const p of offering()) {
      rows.push(
        h(
          "li",
          { class: "item" },
          avatar(p),
          h("div", { class: "body" }, h("div", { class: "name" }, p.name), p.role ? h("div", { class: "desc" }, p.role) : null),
          shell.button("pick", "Select", () => chooseStaff(p.id), `staff-${p.id}`, { "aria-label": `Select ${p.name}` }),
        ),
      );
    }
    return [h("p", { class: "muted note" }, `Who would you like for your ${service()?.name}?`), h("ul", { class: "list" }, rows)];
  }

  function summary(extra: [string, string | null][] = []) {
    const svc = service();
    return summaryList([
      ["Service", svc?.name],
      // Once booked, who it actually went to.
      ["With", result?.staffName ?? personName() ?? (offering().length > 1 ? "Anyone available" : null)],
      ["When", chosen ? whenLabel(chosen) : null],
      ["Duration", svc ? `${svc.durationMinutes} min` : null],
      ["Price", svc ? price(svc, atCustomer()) : null],
      ...where.rows(svc, config?.businessName ?? "", result?.calloutFeeCents),
      ...extra,
    ]);
  }

  function render() {
    if (fatal) return shell.paint(() => [h("p", { class: "note" }, fatal)]);
    if (!config) return shell.paint(() => [h("p", { class: "muted note" }, "Loading…")]);
    const cfg = config;
    if (done) {
      const r = result!;
      const pending = r.status === "pending";
      const message = [
        pending ? cfg.copy.requestedMessage : cfg.copy.successMessage,
        r.outsideArea ? "Your suburb isn't in our listed areas, so we'll confirm whether we can come." : "",
        pending ? "" : cfg.copy.nextSteps,
      ]
        .filter(Boolean)
        .join(" ");
      return shell.paint(
        () =>
          renderDone(shell, {
          pending,
          title: pending ? cfg.copy.requestedTitle : cfg.copy.successTitle,
          message,
          email: r.email,
          summary: summary([["Reference", r.ref || null]]),
          calendar: { uid: r.ref, title: `${service()?.name ?? "Appointment"} at ${cfg.businessName}`, startsAt: r.startsAt, endsAt: r.endsAt, ref: r.ref },
          again: {
            label: "Book something else",
            onClick: () => {
              done = false;
              result = null;
              chosen = null;
              detailsFor = null;
              alert = null;
              where.reset();
              picker.clear();
              go("service");
            },
          },
        }),
        { done: true },
      );
    }
    shell.paint(() => {
      const nodes: (Node | null)[] = [header()];
      if (step === "service") nodes.push(...serviceStep());
      else if (step === "where") nodes.push(...where.renderChoice({ businessName: cfg.businessName, onChoose: chooseWhere }));
      else if (step === "staff") nodes.push(...staffStep());
      else if (step === "time") {
        nodes.push(
          summaryList([["Service", service()?.name], ["Where", atCustomer() ? "At your place" : null], ["With", personName()]]),
          ...picker.render(alert),
        );
      }
      else {
        nodes.push(
          alert ? h("div", { class: "alert", role: "alert" }, alert) : null,
          summary(),
          where.renderAddress(service()),
          details.render({ businessName: cfg.businessName, confirmLabel: cfg.copy.confirmButton, submitting, onSubmit: submit }),
        );
      }
      return nodes;
    });
  }

  render();
  (async () => {
    try {
      const [cfg, catalogue] = await Promise.all([api.config<AppointmentConfig>("appointment"), api.services()]);
      config = cfg;
      services = catalogue.services;
      staff = catalogue.staff;
      where.setBusiness(catalogue.business);
      shell.applyTheme(cfg.theme, cfg.copy.title);
      if (!services.length) {
        fatal = `Online booking isn't available right now.${cfg.contact ? ` Please contact ${cfg.businessName} on ${cfg.contact}.` : ""}`;
      }
      render();
      emit(host, { widget: "appointment", action: "view" });
      // A link from the AI (or a page) can open on one service:
      // data-service on the box, or ?ca_service= in the page address.
      const preset = host.dataset.service || new URLSearchParams(location.search).get("ca_service");
      if (preset && services.some((s) => s.id === preset)) chooseService(preset);
    } catch {
      fatal = "Online booking isn't available right now. Please contact the business directly.";
      render();
    }
  })();
}
