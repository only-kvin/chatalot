// The appointment widget's step logic: services first, then who, then when,
// then the customer's details. Pure, so tests cover it.

export type Step = "service" | "staff" | "time" | "details";

// The staff step is only worth showing when there's a real choice: nobody
// offering the service means the business has no staff (one calendar), and
// a single person is simply chosen for the customer.
export function needsStaffStep(offeringCount: number): boolean {
  return offeringCount > 1;
}

export function stepsFor(staffStep: boolean): Step[] {
  return staffStep ? ["service", "staff", "time", "details"] : ["service", "time", "details"];
}

export function previousStep(steps: Step[], current: Step): Step | null {
  const i = steps.indexOf(current);
  return i > 0 ? steps[i - 1] : null;
}

export const STEP_LABEL: Record<Step, string> = {
  service: "Service",
  staff: "Who",
  time: "Time",
  details: "Your details",
};

type Searchable = { name: string; description: string; category: string };

// Search shows up once a business has this many services.
export const SEARCH_FROM = 9;

export function filterServices<T extends Searchable>(services: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return services;
  return services.filter((s) => `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q));
}

// Services under their category headings, in the business's order; those
// without a category come under "" (no heading).
export function groupServices<T extends Searchable>(services: T[], byCategory: boolean): { category: string; services: T[] }[] {
  if (!byCategory) return [{ category: "", services }];
  const groups: { category: string; services: T[] }[] = [];
  for (const s of services) {
    const category = s.category.trim();
    let group = groups.find((g) => g.category === category);
    if (!group) groups.push((group = { category, services: [] }));
    group.services.push(s);
  }
  return groups;
}
