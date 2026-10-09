"use server";

import { headers } from "next/headers";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { demoRequestSchema, fileDemoRequest } from "@/lib/marketing/demo-request";
import { MARKETING_WIDGET_KEY } from "@/lib/marketing/site";
import { checkDemoRequestLimit } from "@/lib/security/rate-limit";
import { looksLikeBot } from "@/lib/widgets/spam";

export type DemoFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<string, string>> };

export async function requestDemo(_prev: DemoFormState, formData: FormData): Promise<DemoFormState> {
  // Same cheap bot checks as the public widgets: a hidden field people never
  // fill, and nobody completes this form in under three seconds. A bot gets
  // the success screen, so it doesn't learn to adapt.
  const honeypot = String(formData.get("website") ?? "");
  const elapsedMs = Number(formData.get("elapsedMs") ?? 0) || 0;
  if (looksLikeBot({ honeypot, elapsedMs })) return { status: "sent" };

  const parsed = demoRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      fieldErrors[field] ??= issue.message;
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkDemoRequestLimit(ip))) {
    return { status: "error", message: "We've had a few requests from you already. Please try again in a few minutes." };
  }

  // Filing and emailing happen after the response, so the visitor isn't kept
  // waiting on the email provider.
  waitUntil(
    fileDemoRequest(createAdminClient(), parsed.data, MARKETING_WIDGET_KEY).catch((err) =>
      console.error("Filing a demo request failed:", err),
    ),
  );
  return { status: "sent" };
}
