import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWidget } from "../lib/widgets/config";
import { createWidget, loaderScript, saveWidget, widgetBox } from "../lib/widgets/instances";

// A stand-in for the widget_instances table: rows in memory, with the
// filters these helpers use.
type Row = { id: string; tenant_id: string; type: string; name: string; status: string; is_default: boolean; copy: unknown; settings: unknown; fields: unknown; active: boolean };

function fakeDb(rows: Row[]) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from() {
      const filters: [string, unknown][] = [];
      const match = () => rows.filter((r) => filters.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
      let patch: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        update: (p: Record<string, unknown>) => ((patch = p), q),
        maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          const hits = match();
          if (patch) for (const r of hits) Object.assign(r, patch);
          resolve({ data: hits.map((r) => ({ id: r.id })), error: null });
        },
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          const i = { select: () => i, single: async () => ({ data: { id: "new-id" }, error: null }), then: (res: (v: unknown) => void) => res({ error: null }) };
          return i;
        },
      };
      return q;
    },
  };
  return { db: client as unknown as SupabaseClient, inserted };
}

const T = "tenant-1";
const MAIN = "11111111-1111-4111-8111-111111111111";
const NAILS = "22222222-2222-4222-8222-222222222222";
const row = (over: Partial<Row>): Row => ({
  id: MAIN,
  tenant_id: T,
  type: "appointment",
  name: "Appointment",
  status: "live",
  is_default: true,
  copy: {},
  settings: {},
  fields: [],
  active: true,
  ...over,
});

describe("loadWidget", () => {
  const rows = [row({}), row({ id: NAILS, name: "Nail bar", status: "draft", is_default: false, copy: { title: "Book nails" } })];

  it("picks the widget asked for", async () => {
    const w = await loadWidget(fakeDb(rows).db, T, "appointment", NAILS);
    expect(w).toMatchObject({ id: NAILS, name: "Nail bar", status: "draft", isDefault: false });
    expect(w.copy.title).toBe("Book nails");
  });

  it("uses the default without an id, or for one that's gone", async () => {
    for (const id of [null, undefined, "33333333-3333-4333-8333-333333333333", "not-a-uuid"]) {
      expect((await loadWidget(fakeDb(rows).db, T, "appointment", id)).id).toBe(MAIN);
    }
  });

  it("falls back to built-in settings for a business that never saved one", async () => {
    const w = await loadWidget(fakeDb([]).db, T, "contact");
    expect(w).toMatchObject({ id: null, name: "Contact", status: "live", isDefault: true, active: true });
  });
});

describe("saveWidget", () => {
  const values = { active: true, copy: { title: "Hi" }, settings: {}, fields: [] };

  it("saves the default, creating it on first save", async () => {
    const existing = fakeDb([row({})]);
    expect(await saveWidget(existing.db, T, "appointment", values)).toEqual({ error: null });
    expect(existing.inserted).toEqual([]);

    const fresh = fakeDb([]);
    expect(await saveWidget(fresh.db, T, "appointment", values)).toEqual({ error: null });
    expect(fresh.inserted[0]).toMatchObject({ tenant_id: T, type: "appointment", is_default: true, status: "live" });
  });

  it("saves a named widget, and says so if it's gone", async () => {
    const { db } = fakeDb([row({}), row({ id: NAILS, is_default: false })]);
    expect(await saveWidget(db, T, "appointment", values, NAILS)).toEqual({ error: null });
    expect(await saveWidget(fakeDb([row({})]).db, T, "appointment", values, NAILS)).toEqual({ error: "That widget no longer exists." });
  });
});

describe("createWidget", () => {
  it("makes the first of a type the live main widget, later ones as asked", async () => {
    const first = fakeDb([]);
    await createWidget(first.db, T, "appointment", { name: "", status: "draft", createdBy: "u1" });
    expect(first.inserted[0]).toMatchObject({ is_default: true, status: "live", name: "Appointment" });

    const second = fakeDb([row({})]);
    await createWidget(second.db, T, "appointment", { name: "  Nail bar  ", status: "draft", createdBy: "u1" });
    expect(second.inserted[0]).toMatchObject({ is_default: false, status: "draft", name: "Nail bar" });
  });
});

describe("embed codes", () => {
  it("one script per page, a box per widget", () => {
    expect(loaderScript("https://app.example", "pk_1")).toBe('<script src="https://app.example/widget.js" data-key="pk_1" data-chat="off" async></script>');
    expect(widgetBox("appointment")).toBe('<div data-chatalot="appointment"></div>');
    expect(widgetBox("schedule", { widgetId: NAILS, preview: true })).toBe(`<div data-chatalot="schedule" data-widget="${NAILS}" data-preview></div>`);
  });
});
