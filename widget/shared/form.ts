import { canonicalPhone } from "../../lib/contacts/phone";
import { h } from "./dom";

// Renders a business's form fields (the list stored in the dashboard) and
// reads the answers back. The server re-validates everything against the
// stored list; the checks here only save the customer a round trip.

export type FormField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "date";
  required: boolean;
  placeholder?: string;
  options?: string[];
};

export type RenderedForm = {
  element: HTMLElement;
  values: () => Record<string, string | boolean>;
  // The first problem, or null; focuses the field it's about.
  check: () => string | null;
};

const AUTOCOMPLETE: Record<string, string> = { full_name: "name", phone: "tel", email: "email" };

export function renderForm(fields: FormField[], idPrefix: string): RenderedForm {
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();

  const rows = fields.map((f) => {
    const id = `${idPrefix}-${f.key}`;
    const required = f.required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null;
    if (f.type === "checkbox") {
      const input = h("input", { id, type: "checkbox", name: f.key, required: f.required });
      inputs.set(f.key, input);
      return h("label", { class: "check", for: id }, input, h("span", {}, f.label, required));
    }
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (f.type === "textarea") {
      input = h("textarea", { id, name: f.key, rows: 3, maxlength: 2000, placeholder: f.placeholder, required: f.required });
    } else if (f.type === "select") {
      input = h(
        "select",
        { id, name: f.key, required: f.required },
        h("option", { value: "" }, "Choose…"),
        (f.options ?? []).map((o) => h("option", { value: o }, o)),
      );
    } else {
      input = h("input", {
        id,
        name: f.key,
        type: f.type,
        placeholder: f.placeholder,
        required: f.required,
        maxlength: 200,
        autocomplete: AUTOCOMPLETE[f.key],
        inputmode: f.type === "tel" ? "tel" : undefined,
      });
    }
    inputs.set(f.key, input);
    return h("div", { class: "field" }, h("label", { for: id }, f.label, required), input);
  });

  function values() {
    const out: Record<string, string | boolean> = {};
    for (const [key, input] of inputs) {
      out[key] = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value.trim();
    }
    return out;
  }

  function check(): string | null {
    const v = values();
    for (const f of fields) {
      const input = inputs.get(f.key)!;
      const value = v[f.key];
      let problem: string | null = null;
      if (f.required && (value === "" || value === false)) {
        problem = f.type === "checkbox" ? `Please tick "${f.label}".` : `Please fill in "${f.label}".`;
      } else if (f.type === "tel" && value && !canonicalPhone(String(value))) {
        problem = "Enter a valid mobile number, e.g. 082 123 4567 or +27 82 123 4567.";
      } else if (f.type === "email" && value && !/^\S+@\S+\.\S+$/.test(String(value))) {
        problem = `Enter a valid email for "${f.label}".`;
      }
      input.setAttribute("aria-invalid", problem ? "true" : "false");
      if (problem) {
        input.focus();
        return problem;
      }
    }
    return null;
  }

  return { element: h("div", { class: "fields" }, rows), values, check };
}
