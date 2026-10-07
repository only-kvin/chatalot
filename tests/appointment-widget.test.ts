import { describe, it, expect } from "vitest";
import { filterServices, groupServices, needsStaffStep, previousStep, stepsFor } from "../widget/appointment/flow";
import { imageKind, storedPhotoPath } from "../lib/staff/photo";
import { widgetFrom } from "../lib/widgets/config";
import { renderCustomerBookingEmail } from "../lib/email/customer-booking";

describe("appointment steps", () => {
  it("only asks who when there's a real choice", () => {
    expect(needsStaffStep(0)).toBe(false); // no staff: one calendar
    expect(needsStaffStep(1)).toBe(false); // one person: chosen for them
    expect(needsStaffStep(2)).toBe(true);
    expect(stepsFor(true)).toEqual(["service", "staff", "time", "details"]);
    expect(stepsFor(false)).toEqual(["service", "time", "details"]);
  });

  it("goes back one step at a time, skipping a step that isn't there", () => {
    expect(previousStep(stepsFor(true), "time")).toBe("staff");
    expect(previousStep(stepsFor(false), "time")).toBe("service");
    expect(previousStep(stepsFor(true), "service")).toBeNull();
  });
});

describe("service list", () => {
  const services = [
    { name: "Men's Cut", description: "Clippers and scissors", category: "Hair" },
    { name: "Gel Manicure", description: "", category: "Nails" },
    { name: "Balayage", description: "Hand-painted colour", category: "Hair" },
    { name: "Consultation", description: "", category: "" },
  ];

  it("searches names, descriptions and categories", () => {
    expect(filterServices(services, "colour").map((s) => s.name)).toEqual(["Balayage"]);
    expect(filterServices(services, "NAILS").map((s) => s.name)).toEqual(["Gel Manicure"]);
    expect(filterServices(services, "  ")).toHaveLength(4);
  });

  it("groups by category in the business's order, or not at all", () => {
    expect(groupServices(services, true).map((g) => [g.category, g.services.map((s) => s.name)])).toEqual([
      ["Hair", ["Men's Cut", "Balayage"]],
      ["Nails", ["Gel Manicure"]],
      ["", ["Consultation"]],
    ]);
    expect(groupServices(services, false)).toHaveLength(1);
  });
});

describe("appointment widget settings", () => {
  it("fills in defaults and keeps valid stored values", () => {
    const fresh = widgetFrom("appointment", null);
    expect(fresh.copy.title).toBe("Book a service");
    expect(fresh.settings).toEqual({ allowAnyStaff: true, groupByCategory: true });
    const stored = widgetFrom("appointment", {
      copy: { title: "Book with us", nextSteps: "Arrive 5 minutes early", bogus: 1 },
      settings: { allowAnyStaff: false, groupByCategory: "yes" },
    });
    expect(stored.copy).toMatchObject({ title: "Book with us", nextSteps: "Arrive 5 minutes early", confirmButton: "Confirm booking" });
    // An invalid stored value falls back to the defaults.
    expect(stored.settings).toEqual({ allowAnyStaff: true, groupByCategory: true });
  });
});

describe("staff photos", () => {
  it("knows images by their first bytes, not their name", () => {
    expect(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(imageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(imageKind(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.ext).toBe("webp");
    expect(imageKind(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("only treats photos in our own bucket as ours to delete", () => {
    const base = "https://abc.supabase.co";
    expect(storedPhotoPath(`${base}/storage/v1/object/public/staff-photos/t1/s1-x.jpg`, base)).toBe("t1/s1-x.jpg");
    expect(storedPhotoPath("https://example.com/me.jpg", base)).toBeNull();
    expect(storedPhotoPath(null, base)).toBeNull();
  });
});

describe("rescheduled email", () => {
  it("sends the new time with a calendar file and the manage link", () => {
    const email = renderCustomerBookingEmail(
      "rescheduled",
      {
        id: "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b",
        name: "Thandi",
        email: "t@example.com",
        startsAt: "2026-10-13T09:00:00Z",
        endsAt: "2026-10-13T09:30:00Z",
        serviceName: "Cut",
        staffName: null,
        businessName: "Demo Salon",
        contact: "",
      },
      { manageUrl: "https://x.test/b/abc" },
    );
    expect(email.subject).toBe("Booking moved: Cut at Demo Salon");
    expect(email.html).toContain("Tuesday 13 October at 11:00");
    expect(email.html).toContain("https://x.test/b/abc");
    expect(email.ics).toContain("DTSTART:20261013T090000Z");
  });
});
