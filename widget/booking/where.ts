import { h } from "../shared/dom";
import { calloutFeeNotice, type BookingLocation } from "../../lib/bookings/price-label";
import { inServiceArea } from "../../lib/bookings/service-area";
import type { BusinessInfo, Service } from "./api";
import type { Shell } from "./shell";

// Where a booking happens, shared by the booking widgets: the "Where?"
// choice for services done at either place, and the address fields (with
// the service-area message) for bookings at the customer's. What's typed
// survives going back and forth.

export type Where = {
  // The customer still has to choose (an "either" service).
  needsChoice: (s: Service | null) => boolean;
  // Where this service's booking happens now ("either" before choosing =
  // undefined, so availability isn't asked for the wrong place).
  location: (s: Service | null) => BookingLocation | undefined;
  choose: (location: BookingLocation) => void;
  reset: () => void;
  // The two choices, for the "Where?" step.
  renderChoice: (o: { businessName: string; onChoose: (l: BookingLocation) => void }) => Node[];
  // The address fields, or null for a booking at the business.
  renderAddress: (s: Service | null) => HTMLElement | null;
  // The first problem with the address (and focuses it), or null.
  check: (s: Service | null) => string | null;
  payload: (s: Service | null) => { location: BookingLocation | null; address: Record<string, string> | null };
  // Summary rows: where, the call-out fee, the cancellation policy.
  rows: (s: Service | null, businessName: string, feeCents?: number | null) => [string, string | null][];
  setBusiness: (b: BusinessInfo | undefined) => void;
};

const FIELDS = [
  { key: "line", label: "Street address", required: true, autocomplete: "address-line1" },
  { key: "suburb", label: "Suburb or town", required: true, autocomplete: "address-level3" },
  { key: "city", label: "City", required: false, autocomplete: "address-level2" },
  { key: "postalCode", label: "Postal code", required: false, autocomplete: "postal-code" },
  { key: "accessNotes", label: "Access notes (gate code, parking)", required: false, autocomplete: "off" },
] as const;

export function createWhere(shell: Shell): Where {
  let chosen: BookingLocation | undefined;
  let business: BusinessInfo = { serviceAreas: [], cancellationPolicy: "", address: "" };
  // Built once, so typing survives re-renders.
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  const areaNote = h("p", { class: "note muted", "aria-live": "polite" });
  for (const f of FIELDS) {
    const attrs = { id: `${shell.id}-addr-${f.key}`, name: f.key, required: f.required, maxlength: f.key === "accessNotes" ? 500 : 200, autocomplete: f.autocomplete };
    inputs.set(f.key, f.key === "accessNotes" ? h("textarea", { ...attrs, rows: 2 }) : h("input", { ...attrs, type: "text" }));
  }
  const value = (k: string) => inputs.get(k)!.value.trim();

  // Updated as they type: never a refusal, just what happens next.
  function updateAreaNote() {
    const suburb = value("suburb");
    if (!business.serviceAreas.length || !suburb) {
      areaNote.textContent = "";
      return;
    }
    areaNote.textContent = inServiceArea(business.serviceAreas, suburb, value("city"))
      ? `✓ We cover ${suburb}.`
      : `${suburb} isn't in our listed areas (${business.serviceAreas.join("; ")}). You can still send the request: we'll confirm whether we can come.`;
  }
  inputs.get("suburb")!.addEventListener("input", updateAreaNote);
  inputs.get("city")!.addEventListener("input", updateAreaNote);

  const location = (s: Service | null): BookingLocation | undefined => {
    if (!s) return undefined;
    if (s.location === "either") return chosen;
    return s.location;
  };

  return {
    needsChoice: (s) => s?.location === "either",
    location,
    choose(l) {
      chosen = l;
    },
    reset() {
      chosen = undefined;
    },
    setBusiness(b) {
      if (b) business = b;
    },
    renderChoice({ businessName, onChoose }) {
      const option = (l: BookingLocation, title: string, desc: string) =>
        h(
          "li",
          { class: "item" },
          h("div", { class: "body" }, h("div", { class: "name" }, title), desc ? h("div", { class: "desc" }, desc) : null),
          shell.button("pick", "Select", () => onChoose(l), `where-${l}`, { "aria-label": title, "aria-pressed": String(chosen === l) }),
        );
      return [
        h("p", { class: "muted note" }, "Where would you like it: at our place, or at yours?"),
        h(
          "ul",
          { class: "list" },
          option("business", `At ${businessName || "our place"}`, business.address),
          option("customer", "At your place", "We come to you"),
        ),
      ];
    },
    renderAddress(s) {
      if (location(s) !== "customer") return null;
      updateAreaNote();
      return h(
        "fieldset",
        { class: "fields address" },
        h("legend", {}, "Where should we come?"),
        FIELDS.map((f) =>
          h(
            "div",
            { class: "field" },
            h("label", { for: `${shell.id}-addr-${f.key}` }, f.label, f.required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null),
            inputs.get(f.key)!,
          ),
        ),
        areaNote,
      );
    },
    check(s) {
      if (location(s) !== "customer") return null;
      for (const f of FIELDS) {
        const input = inputs.get(f.key)!;
        const missing = f.required && !value(f.key);
        input.setAttribute("aria-invalid", missing ? "true" : "false");
        if (missing) {
          input.focus();
          return `Please fill in "${f.label}".`;
        }
      }
      return null;
    },
    payload(s) {
      const l = location(s) ?? null;
      if (l !== "customer") return { location: l, address: null };
      return {
        location: l,
        address: Object.fromEntries(FIELDS.map((f) => [f.key, value(f.key)])),
      };
    },
    rows(s, businessName, feeCents) {
      const l = location(s);
      const rows: [string, string | null][] = [];
      if (l === "customer") {
        const where = [value("line"), value("suburb")].filter(Boolean).join(", ");
        rows.push(["Where", where || "At your place"]);
        rows.push(["Payment", calloutFeeNotice(feeCents === undefined ? (s?.calloutFeeCents ?? null) : feeCents, businessName)]);
      } else if (l === "business") {
        rows.push(["Where", business.address || null]);
      }
      rows.push(["Cancellation", business.cancellationPolicy || null]);
      return rows;
    },
  };
}
