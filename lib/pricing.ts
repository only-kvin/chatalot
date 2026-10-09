import type { Plan } from "./plans";

// Monthly price per plan in rand, shown on the marketing site. null means
// "Contact us". Plan contents live in lib/plans.ts; only the amounts are here,
// so setting prices is a one-line change.
export const MONTHLY_PRICE_ZAR: Record<Exclude<Plan, "trial">, number | null> = {
  starter: null,
  growth: null,
  pro: null,
};

export function priceLabel(plan: Exclude<Plan, "trial">): string {
  const amount = MONTHLY_PRICE_ZAR[plan];
  return amount === null ? "Contact us" : `R${amount.toLocaleString("en-ZA")} / month`;
}
