import { h } from "../shared/dom";
import { emit } from "../shared/events";
import { renderForm, type FormField, type RenderedForm } from "../shared/form";
import { registerWidget, type MountContext } from "../shared/loader-contract";
import type { Theme } from "../shared/theme";
import { createShell } from "../booking/shell";

// widgets/contact.js: the website contact form. The business's own fields,
// two optional (unticked) consent boxes, a spam trap, and a thank-you with
// the business's expected response time. Mounted into
// <div data-chatalot="contact">.

type ContactConfig = {
  businessName: string;
  contact: string;
  theme: Theme;
  fields: FormField[];
  copy: { title: string; submitButton: string; successTitle: string; successMessage: string; responseTime: string };
  settings: { offerNewsletter: boolean; offerPromotions: boolean };
};

function mountContact(host: HTMLElement, ctx: MountContext): void {
  const shell = createShell(host, ctx, "contact");
  let config: ContactConfig | null = null;
  let fatal: string | null = null;
  let alert: string | null = null;
  let sending = false;
  let sent = false;
  // Built once so what's typed survives re-renders.
  let form: RenderedForm | null = null;
  const newsletter = h("input", { type: "checkbox", id: `${shell.id}-newsletter` });
  const promotions = h("input", { type: "checkbox", id: `${shell.id}-promotions` });
  const trap = h("input", { type: "text", name: "website", tabindex: -1, autocomplete: "off" });
  let shownAt = 0;

  const contactLine = () => (config?.contact ? ` You can also reach ${config.businessName} on ${config.contact}.` : "");

  async function submit() {
    if (sending || !form || !config) return;
    const problem = form.check();
    const values = form.values();
    const reply = problem ?? (values.email || values.phone ? null : "Please give an email address or a phone number so we can reply.");
    if (reply) {
      alert = reply;
      render();
      // The form's own check focuses its field; the "no way to reply" one
      // points at the email (or phone) box.
      if (!problem) shell.focusFirst('[name="email"], [name="phone"]');
      return;
    }
    sending = true;
    alert = null;
    render();
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ctx.key,
          answers: values,
          newsletter: newsletter.checked,
          promotions: promotions.checked,
          website: trap.value,
          elapsedMs: Date.now() - shownAt,
        }),
      });
      const json = await res.json().catch(() => ({}));
      sending = false;
      if (res.ok && json.ok) {
        sent = true;
        render();
        emit(host, { widget: "contact", action: "submitted" });
        shell.announce(config.copy.successTitle);
        shell.focusFirst("h2");
        return;
      }
      alert = `${typeof json.error === "string" ? json.error : "We couldn't send your message."}${contactLine()}`;
    } catch {
      sending = false;
      alert = `We couldn't reach the server. Check your connection and try again.${contactLine()}`;
    }
    render();
    shell.announce(alert);
  }

  function check(input: HTMLInputElement, label: string) {
    return h("label", { class: "check", for: input.id }, input, h("span", {}, label));
  }

  function render() {
    shell.paint(() => {
      if (fatal) return [h("p", { class: "note" }, fatal)];
      if (!config) return [h("p", { class: "muted note" }, "Loading…")];
      const c = config;
      if (sent) {
        return [
          h("div", { class: "tick", "aria-hidden": "true" }, "✓"),
          h("h2", { tabindex: -1 }, c.copy.successTitle),
          c.copy.successMessage ? h("p", { class: "note" }, c.copy.successMessage) : null,
          c.copy.responseTime ? h("p", { class: "note muted" }, c.copy.responseTime) : null,
        ];
      }
      const formEl = h(
        "form",
        { novalidate: true },
        h(
          "div",
          { class: "fields" },
          form!.element,
          c.settings.offerNewsletter ? check(newsletter, "Send me the newsletter") : null,
          c.settings.offerPromotions ? check(promotions, "Tell me about events and promotions") : null,
        ),
        h("div", { class: "trap", "aria-hidden": "true" }, h("label", {}, "Leave this empty", trap)),
        h("button", { type: "submit", class: "primary", disabled: sending }, sending ? "Sending…" : c.copy.submitButton),
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
        c.copy.responseTime ? h("p", { class: "note muted" }, c.copy.responseTime) : null,
      ];
    }, { done: sent });
  }

  render();
  (async () => {
    try {
      const res = await fetch(`${ctx.apiOrigin}/api/widget/config?${new URLSearchParams({ key: ctx.key, widget: "contact" })}`);
      if (!res.ok) throw new Error(String(res.status));
      config = (await res.json()) as ContactConfig;
      shell.applyTheme(config.theme, config.copy.title);
      form = renderForm(config.fields, shell.id);
      shownAt = Date.now();
      render();
      emit(host, { widget: "contact", action: "view" });
    } catch {
      fatal = "The contact form isn't available right now. Please contact the business directly.";
      render();
    }
  })();
}

registerWidget("contact", mountContact);
