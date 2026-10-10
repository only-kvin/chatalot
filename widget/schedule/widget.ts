import { h } from "../shared/dom";
import { emit } from "../shared/events";
import type { MountContext } from "../shared/loader-contract";
import { createApi, price, type BaseConfig, type Service, type Staff } from "../booking/api";
import { dayLong } from "../booking/calendar";
import { createPicker } from "../booking/picker";
import { createShell } from "../booking/shell";
import { createDetails, renderDone, summaryList } from "../booking/steps";
import { createWhere } from "../booking/where";
import { timeRangeLabel } from "../../lib/bookings/price-label";

// The schedule widget: date first. Pick a day on the month calendar, a
// time, fill in the business's form, confirm. Service and person are chosen
// at the top, since the times depend on them.

type ScheduleConfig = BaseConfig & { settings: { allowStaffChoice: boolean } };
type Step = "pick" | "details" | "done";

export function mountSchedule(host: HTMLElement, ctx: MountContext): void {
  const api = createApi(ctx.apiOrigin, ctx.key);
  const shell = createShell(host, ctx, "schedule");
  const details = createDetails(shell);
  const where = createWhere(shell);

  let config: ScheduleConfig | null = null;
  let services: Service[] = [];
  let staff: Staff[] = [];
  let serviceId = "";
  let staffId = "";
  let step: Step = "pick";
  let fatal: string | null = null;
  let alert: string | null = null;
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

  const service = () => services.find((s) => s.id === serviceId) ?? null;
  const atCustomer = () => where.location(service()) === "customer";
  const whenLabel = (c: { date: string; time: string; end?: string }) =>
    c.end ? `${dayLong(c.date)}, between ${c.time} and ${c.end}` : `${dayLong(c.date)} at ${c.time}`;
  const contactLine = () => (config?.contact ? ` You can also contact ${config.businessName} on ${config.contact}.` : "");

  const picker = createPicker({
    shell,
    fetch: api.availability,
    rerender: render,
    contactLine,
    onChoose(date, time, end) {
      chosen = { date, time, end };
      step = "details";
      alert = null;
      details.start(config!.fields);
      render();
      emit(host, { widget: "schedule", action: "step", step: "details" });
      shell.announce(`Booking ${service()?.name} on ${whenLabel({ date, time, end })}. Enter your details.`);
      shell.focusFirst("input, select, textarea");
    },
  });

  function useQuery() {
    // A service done at either place starts at the business; the customer
    // can switch to "At your place".
    if (where.needsChoice(service()) && !where.location(service())) where.choose("business");
    picker.setQuery(serviceId, staffId, where.location(service()));
    render();
    picker.load();
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
    const res = await api.book("schedule", {
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
      step = "done";
      render();
      emit(host, { widget: "schedule", action: "submitted" });
      shell.announce(res.status === "pending" ? config!.copy.requestedTitle : config!.copy.successTitle);
      shell.focusFirst("h2");
      return;
    }
    if (res.slotTaken) {
      const { date, time, end } = chosen;
      const nearest = await picker.refreshAfterTaken(date, time);
      step = "pick";
      chosen = null;
      alert = `Sorry, ${timeRangeLabel(time, end)} was just taken.${nearest.length ? " These are the nearest free times:" : " Please pick another time."}`;
      render();
      shell.announce(alert);
      return;
    }
    alert = `${res.error}${contactLine()}`;
    render();
    shell.announce(alert);
  }

  function pickers() {
    const showStaff = config!.settings.allowStaffChoice && staff.length > 0;
    const choosePlace = where.needsChoice(service());
    if (services.length < 2 && !showStaff && !choosePlace) return null;
    const svcSelect = h(
      "select",
      { id: `${shell.id}-service`, "data-k": "service" },
      services.map((s) => {
        const o = h("option", { value: s.id }, [s.name, `${s.durationMinutes} min`, price(s)].filter(Boolean).join(" · "));
        o.selected = s.id === serviceId;
        return o;
      }),
    );
    svcSelect.addEventListener("change", () => {
      serviceId = svcSelect.value;
      where.reset();
      if (staffId && !service()?.staffIds.includes(staffId)) staffId = "";
      useQuery();
    });
    const offering = staff.filter((p) => service()?.staffIds.includes(p.id));
    let staffSelect: HTMLSelectElement | null = null;
    if (showStaff && offering.length > 0) {
      staffSelect = h(
        "select",
        { id: `${shell.id}-staff`, "data-k": "staff" },
        h("option", { value: "" }, "Anyone available"),
        offering.map((p) => {
          const o = h("option", { value: p.id }, p.role ? `${p.name} · ${p.role}` : p.name);
          o.selected = p.id === staffId;
          return o;
        }),
      );
      staffSelect.addEventListener("change", () => {
        staffId = staffSelect!.value;
        useQuery();
      });
    }
    let placeSelect: HTMLSelectElement | null = null;
    if (choosePlace) {
      placeSelect = h(
        "select",
        { id: `${shell.id}-where`, "data-k": "where" },
        h("option", { value: "business", selected: !atCustomer() }, `At ${config!.businessName || "our place"}`),
        h("option", { value: "customer", selected: atCustomer() }, "At your place"),
      );
      placeSelect.addEventListener("change", () => {
        where.choose(placeSelect!.value === "customer" ? "customer" : "business");
        useQuery();
      });
    }
    return h(
      "div",
      { class: "pickers" },
      services.length > 1 ? h("label", { for: `${shell.id}-service` }, "Service", svcSelect) : null,
      placeSelect ? h("label", { for: `${shell.id}-where` }, "Where?", placeSelect) : null,
      staffSelect ? h("label", { for: `${shell.id}-staff` }, "With", staffSelect) : null,
    );
  }

  function summary(extra: [string, string | null][] = []) {
    const svc = service();
    return summaryList([
      ["Service", svc?.name],
      ["With", result?.staffName ?? (staffId ? staff.find((p) => p.id === staffId)?.name : null)],
      ["When", chosen ? whenLabel(chosen) : null],
      ["Duration", svc ? `${svc.durationMinutes} min` : null],
      ["Price", svc ? price(svc, atCustomer()) : null],
      ...where.rows(svc, config?.businessName ?? "", result?.calloutFeeCents),
      ...extra,
    ]);
  }

  function header() {
    return h(
      "div",
      { class: "head" },
      h(
        "div",
        {},
        h("h2", { id: `${shell.id}-title`, tabindex: -1 }, config!.copy.title),
        config!.businessName ? h("p", { class: "muted" }, config!.businessName) : null,
      ),
    );
  }

  function render() {
    if (fatal) return shell.paint(() => [h("p", { class: "note" }, fatal)]);
    if (!config) return shell.paint(() => [h("p", { class: "muted note" }, "Loading…")]);
    const cfg = config;
    if (step === "done") {
      const r = result!;
      const pending = r.status === "pending";
      return shell.paint(
        () =>
          renderDone(shell, {
          pending,
          title: pending ? cfg.copy.requestedTitle : cfg.copy.successTitle,
          message: [
            pending ? cfg.copy.requestedMessage : cfg.copy.successMessage,
            r.outsideArea ? "Your suburb isn't in our listed areas, so we'll confirm whether we can come." : "",
          ]
            .filter(Boolean)
            .join(" "),
          email: r.email,
          summary: summary([["Reference", r.ref || null]]),
          calendar: { uid: r.ref, title: `${service()?.name ?? "Appointment"} at ${cfg.businessName}`, startsAt: r.startsAt, endsAt: r.endsAt, ref: r.ref },
          again: {
            label: "Book another",
            onClick: () => {
              step = "pick";
              chosen = null;
              result = null;
              alert = null;
              picker.clear();
              render();
              picker.load();
            },
          },
        }),
        { done: true },
      );
    }
    if (step === "pick") return shell.paint(() => [header(), pickers(), ...picker.render(alert)]);
    shell.paint(() => [
      header(),
      alert ? h("div", { class: "alert", role: "alert" }, alert) : null,
      shell.button("link", "← Change time", () => {
        step = "pick";
        alert = null;
        render();
        shell.focusFirst('[data-k="slot"]:not(:disabled)');
      }, "back"),
      summary(),
      where.renderAddress(service()),
      details.render({ businessName: cfg.businessName, confirmLabel: cfg.copy.confirmButton, submitting, onSubmit: submit }),
    ]);
  }

  render();
  (async () => {
    try {
      const [cfg, catalogue] = await Promise.all([api.config<ScheduleConfig>("schedule"), api.services()]);
      config = cfg;
      services = catalogue.services;
      staff = catalogue.staff;
      where.setBusiness(catalogue.business);
      shell.applyTheme(cfg.theme, cfg.copy.title);
      if (!services.length) {
        fatal = `Online booking isn't available right now.${cfg.contact ? ` Please contact ${cfg.businessName} on ${cfg.contact}.` : ""}`;
        render();
        return;
      }
      serviceId = services[0].id;
      emit(host, { widget: "schedule", action: "view" });
      useQuery();
    } catch {
      fatal = "Online booking isn't available right now. Please contact the business directly.";
      render();
    }
  })();
}
