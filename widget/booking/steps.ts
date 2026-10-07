import { bookingIcs } from "../../lib/bookings/ics";
import { h } from "../shared/dom";
import { renderForm, type FormField, type RenderedForm } from "../shared/form";
import type { Shell } from "./shell";

// The steps after a time is chosen, shared by every booking widget: the
// customer's details (the business's form + consent + spam trap) and the
// confirmation.

export function summaryList(rows: [string, string | null | undefined][]): HTMLElement {
  return h(
    "dl",
    { class: "summary" },
    rows.filter(([, v]) => v).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v!)]),
  );
}

export type Details = {
  // Builds a fresh form; call when the details step opens.
  start: (fields: FormField[]) => void;
  render: (o: { businessName: string; confirmLabel: string; submitting: boolean; onSubmit: () => void }) => HTMLElement;
  // The first problem (and focuses it), or null.
  check: () => string | null;
  payload: () => {
    answers: Record<string, string | boolean>;
    consent: true;
    idempotencyKey: string;
    website: string;
    elapsedMs: number;
  };
  email: () => string;
};

export function createDetails(shell: Shell): Details {
  // Built once per visit to the step, so what's typed survives re-renders.
  let form: RenderedForm | null = null;
  let consent: HTMLInputElement | null = null;
  let trap: HTMLInputElement | null = null;
  let idempotencyKey = "";
  let shownAt = 0;

  return {
    start(fields) {
      form = renderForm(fields, shell.id);
      consent = h("input", { type: "checkbox", id: `${shell.id}-consent`, required: true });
      trap = h("input", { type: "text", name: "website", tabindex: -1, autocomplete: "off" });
      idempotencyKey = crypto.randomUUID();
      shownAt = Date.now();
    },
    render({ businessName, confirmLabel, submitting, onSubmit }) {
      const consentRow = h(
        "label",
        { class: "check", for: `${shell.id}-consent` },
        consent!,
        h("span", {}, `I agree to ${businessName || "the business"} saving my details to manage this booking.`),
      );
      const formEl = h(
        "form",
        { novalidate: true },
        h("div", { class: "fields" }, form!.element, consentRow),
        h("div", { class: "trap", "aria-hidden": "true" }, h("label", {}, "Leave this empty", trap!)),
        h("button", { type: "submit", class: "primary", disabled: submitting }, submitting ? "Booking…" : confirmLabel),
      );
      formEl.addEventListener("submit", (e) => {
        e.preventDefault();
        onSubmit();
      });
      return formEl;
    },
    check() {
      const problem = form!.check();
      if (problem) return problem;
      if (!consent!.checked) {
        consent!.focus();
        return "Please agree to us saving your details for this booking.";
      }
      return null;
    },
    payload() {
      return {
        answers: form!.values(),
        consent: true,
        idempotencyKey,
        website: trap?.value ?? "",
        elapsedMs: Date.now() - shownAt,
      };
    },
    email() {
      return String(form?.values().email ?? "");
    },
  };
}

// The confirmation: what happened, the reference, and add-to-calendar
// (only once it's actually confirmed).
export function renderDone(
  shell: Shell,
  o: {
    pending: boolean;
    title: string;
    message: string;
    email: string;
    summary: HTMLElement;
    calendar: { uid: string; title: string; startsAt: string; endsAt: string; ref: string } | null;
    again: { label: string; onClick: () => void } | null;
  },
): Node[] {
  let calendarLink: HTMLElement | null = null;
  if (!o.pending && o.calendar?.startsAt) {
    const ics = bookingIcs({
      uid: o.calendar.uid,
      title: o.calendar.title,
      startsAt: o.calendar.startsAt,
      endsAt: o.calendar.endsAt,
      description: o.calendar.ref ? `Reference ${o.calendar.ref}` : undefined,
    });
    calendarLink = h(
      "a",
      { class: "ghost", href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), download: "booking.ics" },
      "Add to calendar",
    );
  }
  return [
    h("div", { class: "tick", "aria-hidden": "true" }, o.pending ? "…" : "✓"),
    h("h2", { tabindex: -1 }, o.title),
    o.message ? h("p", { class: "note" }, o.message) : null,
    o.email ? h("p", { class: "note muted" }, `We've emailed the details to ${o.email}.`) : null,
    o.summary,
    h(
      "div",
      { class: "actions" },
      calendarLink,
      o.again ? shell.button("ghost", o.again.label, o.again.onClick, "again") : null,
    ),
  ].filter((n): n is HTMLElement => n !== null);
}
