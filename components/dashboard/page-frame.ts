import { cn } from "cn";

// One frame for every dashboard page, the same as the Overview: up to 1240px,
// same padding, so titles and content start at the same spot on every page.
// - "wide": tables and lists use the whole frame.
// - "form" / "detail": the page's direct children are capped at a readable
//   width, aligned left (not centred), so the spare space sits on the right.
export type PageWidth = "wide" | "form" | "detail";

const FRAME = "mx-auto w-full max-w-[1240px] px-4 pt-7 pb-12 sm:px-[clamp(16px,3vw,40px)]";

const CONTENT: Record<PageWidth, string> = {
  wide: "",
  form: "*:max-w-2xl",
  detail: "*:max-w-3xl",
};

export function pageFrame(width: PageWidth = "wide", extra?: string): string {
  return cn(FRAME, CONTENT[width], extra);
}
