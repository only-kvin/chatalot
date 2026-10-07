import { h } from "../shared/dom";
import { emit } from "../shared/events";
import { renderForm, type FormField, type RenderedForm } from "../shared/form";
import { registerWidget, type MountContext } from "../shared/loader-contract";
import type { Theme } from "../shared/theme";
import { createShell } from "../booking/shell";

// widgets/registration.js: sign up as a customer, no password. The
// business's own fields, a required "booking notifications" consent, an
// optional (unticked) marketing one, a spam trap. Afterwards always "check
// your email" (whether or not they were already a customer), and
// optionally a "Book now" link. Mounted into <div data-chatalot="registration">.

type RegistrationConfig = {
  businessName: string;
  contact: string;
  theme: Theme;
  fields: FormField[];
  copy: { title: string; submitButton: string; successTitle: string; successMessage: string; bookingUrl: string; bookLinkLabel: string };
  settings: { offerMarketing: boolean };
};

function mountRegistration(host: HTMLElement, ctx: MountContext): void {
  const shell = createShell(host, ctx, "registration");
  let config: RegistrationConfig | null = null;
  let fatal: string | null = null;
  let alert: string | null = null;
  let sending = false;
  let done = false;
  let form: RenderedForm | null = null;
  const notifications = h("input", { type: "checkbox", id: `${shell.id}-notifications`, required: true });
  const marketing = h("input", { type: "checkbox", id: `${shell.id}-marketing` });
  const trap = h("input", { type: "text", name: "website", tabindex: -1, autocomplete: "off" });
  let shownAt = 0;

  async function submit() {
    if (sending || !form || !config) return;
    const problem = form.check();
    if (problem) {
      alert = problem;
      render();
      return;
    }
    if (!notifications.checked) {
      alert = "Please agree to receive booking notifications to sign up.";
      render();
      notifications.focus();
      return;
    }
    sending = true;
    alert = null;
    render();
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/public/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ctx.key,
          answers: form.values(),
          notifications: true,
          marketing: marketing.checked,
          website: trap.value,
          elapsedMs: Date.now() - shownAt,
        }),
      });
      const json = await res.json().catch(() => ({}));
      sending = false;
      if (res.ok && json.ok) {
        done = true;
        render();
        emit(host, { widget: "registration", action: "submitted" });
        shell.announce(config.copy.successTitle);
        shell.focusFirst("h2");
        return;
      }
      alert = typeof json.error === "string" ? json.error : "We couldn't sign you up. Please try again.";
    } catch {
      sending = false;
      alert = "We couldn't reach the server. Check your connection and try again.";
    }
    render();
    if (alert) shell.announce(alert);
  }

  function check(input: HTMLInputElement, label: string, required = false) {
    return h(
      "label",
      { class: "check", for: input.id },
      input,
      h("span", {}, label, required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null),
    );
  }

  function render() {
    shell.paint(() => {
      if (fatal) return [h("p", { class: "note" }, fatal)];
      if (!config) return [h("p", { class: "muted note" }, "Loading…")];
      const c = config;
      if (done) {
        return [
          h("div", { class: "tick", "aria-hidden": "true" }, "✓"),
          h("h2", { tabindex: -1 }, c.copy.successTitle),
          c.copy.successMessage ? h("p", { class: "note" }, c.copy.successMessage) : null,
          c.copy.bookingUrl
            ? h("div", { class: "actions" }, h("a", { class: "primary", href: c.copy.bookingUrl, style: "display:flex;align-items:center;justify-content:center;text-decoration:none" }, c.copy.bookLinkLabel))
            : null,
        ];
      }
      const business = c.businessName || "us";
      const formEl = h(
        "form",
        { novalidate: true },
        h(
          "div",
          { class: "fields" },
          form!.element,
          check(notifications, `Send me booking confirmations and reminders from ${business}`, true),
          c.settings.offerMarketing ? check(marketing, `Tell me about events and promotions from ${business}`) : null,
        ),
        h("div", { class: "trap", "aria-hidden": "true" }, h("label", {}, "Leave this empty", trap)),
        h("button", { type: "submit", class: "primary", disabled: sending }, sending ? "Signing up…" : c.copy.submitButton),
      );
      formEl.addEventListener("submit", (e) => {
        e.preventDefault();
        submit();
      });
      return [
        h(
          "div",
          { class: "head" },
          h(
            "div",
            {},
            h("h2", { id: `${shell.id}-title`, tabindex: -1 }, c.copy.title),
            c.businessName ? h("p", { class: "muted" }, c.businessName) : null,
          ),
        ),
        alert ? h("div", { class: "alert", role: "alert" }, alert) : null,
        formEl,
        h("p", { class: "note muted" }, "No password needed: we'll email you a link to your bookings."),
      ];
    }, { done });
  }

  render();
  (async () => {
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/widget/config?${new URLSearchParams({ key: ctx.key, widget: "registration" })}`);
      if (!res.ok) throw new Error(String(res.status));
      config = (await res.json()) as RegistrationConfig;
      shell.applyTheme(config.theme, config.copy.title);
      form = renderForm(config.fields, shell.id);
      shownAt = Date.now();
      render();
      emit(host, { widget: "registration", action: "view" });
    } catch {
      fatal = "Sign-up isn't available right now. Please contact the business directly.";
      render();
    }
  })();
}

registerWidget("registration", mountRegistration);
