import { BUSINESS_GROUPS } from "./business-types";
import { FEATURE_PAGES } from "./features";
import { GUIDES } from "./guides";

// Every public page. The generated ones (features, business types, guides)
// come from the same data as the pages themselves.
export function publicPaths(): string[] {
  return [
    "/",
    "/features",
    ...FEATURE_PAGES.map((p) => `/features/${p.slug}`),
    ...BUSINESS_GROUPS.map((g) => `/for/${g.slug}`),
    "/pricing",
    "/resources",
    ...GUIDES.map((g) => `/resources/${g.slug}`),
    "/demo",
    "/signup",
    "/bot",
    "/login",
    "/terms",
    "/privacy",
    "/data-deletion",
  ];
}
