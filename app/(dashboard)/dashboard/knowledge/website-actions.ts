"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { getCurrentTenantId } from "@/lib/db/current-tenant";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  ImportRefusedError,
  importWebsite,
  removeWebsiteKnowledge,
  runWebsiteImport,
  setPageExcluded,
} from "@/lib/website/import";

// The owner's website import controls. The tenant always comes from the
// signed-in user, never from the form; the service-role client is used
// because imports are server-only rows, and every query filters by it.

type Result = { error: string | null };

export async function startWebsiteImportAction(startUrl: string): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (typeof startUrl !== "string" || !startUrl.trim() || startUrl.length > 500) return { error: "Enter your website's address." };

  const admin = createAdminClient();
  try {
    const importId = await importWebsite(admin, tenantId, startUrl);
    // The crawl continues after this response (about 4 minutes at most);
    // anything left is picked up by the daily job.
    waitUntil(runWebsiteImport(admin, importId).catch((err) => console.error("Website import failed:", err)));
  } catch (err) {
    if (err instanceof ImportRefusedError) return { error: err.message };
    console.error("Starting a website import failed:", err);
    return { error: "Couldn't start the import. Please try again." };
  }
  revalidatePath("/dashboard/knowledge");
  return { error: null };
}

export async function setWebsitePageExcludedAction(itemId: string, excluded: boolean): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  if (!z.uuid().safeParse(itemId).success || typeof excluded !== "boolean") return { error: "Invalid page." };
  try {
    await setPageExcluded(createAdminClient(), tenantId, itemId, excluded);
  } catch (err) {
    if (err instanceof ImportRefusedError) return { error: err.message };
    console.error(`Changing website page ${itemId} failed:`, err);
    return { error: excluded ? "Couldn't switch the page off." : "Couldn't switch the page back on. Try again in a minute." };
  }
  revalidatePath("/dashboard/knowledge");
  return { error: null };
}

export async function removeWebsiteKnowledgeAction(): Promise<Result> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "Not authorized." };
  const admin = createAdminClient();
  // A running import would only add the pages back.
  const { count } = await admin
    .from("website_imports")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["queued", "running"]);
  if (count) return { error: "An import is still running. Remove the pages once it has finished." };
  try {
    await removeWebsiteKnowledge(admin, tenantId);
  } catch (err) {
    console.error("Removing website knowledge failed:", err);
    return { error: "Couldn't remove the website pages. Please try again." };
  }
  revalidatePath("/dashboard/knowledge");
  return { error: null };
}
