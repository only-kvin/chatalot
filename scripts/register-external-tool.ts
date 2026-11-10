// Registers (or updates) the tools another app provides to one business's
// receptionist. Platform-only: a tool decides where a customer's words go.
//
// Usage: pnpm register-external-tool <tenant-slug> <tools.json>
//
// tools.json:
// {
//   "endpointUrl": "https://other-app.example/api/bookfront/tools/<id>",
//   "secret": "<the signing secret the other app generated>",
//   "tools": [
//     { "name": "search_stock", "description": "...", "promptNote": "...",
//       "parameters": { "type": "object", "properties": { ... }, "required": [ ... ] } }
//   ]
// }
//
// Tools of this tenant that aren't in the file are left alone; disable one
// with `"enabled": false`.

import { readFileSync } from "node:fs";
import { z } from "zod";
import { createAdminClient } from "../lib/db/supabase-admin";
import { checkEndpoint, externalToolSchema, isBuiltInToolName } from "../lib/agent/external-tools";
import { encrypt } from "../lib/security/crypto";

const fileSchema = z.object({
  endpointUrl: z.string().min(1),
  secret: z.string().min(32, "secret must be at least 32 characters"),
  tools: z
    .array(
      externalToolSchema
        .omit({ endpoint_url: true, prompt_note: true })
        .extend({ promptNote: z.string().max(2000).default(""), enabled: z.boolean().default(true) }),
    )
    .min(1),
});

async function main() {
  const [slug, path] = process.argv.slice(2);
  if (!slug || !path) {
    console.error("Usage: pnpm register-external-tool <tenant-slug> <tools.json>");
    process.exit(1);
  }

  const file = fileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  checkEndpoint(file.endpointUrl);
  const clash = file.tools.find((t) => isBuiltInToolName(t.name));
  if (clash) throw new Error(`"${clash.name}" is a built-in tool name`);

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, name").eq("slug", slug).maybeSingle();
  if (!tenant) throw new Error(`No business with slug "${slug}"`);

  const { error } = await admin.from("external_tools").upsert(
    file.tools.map((t) => ({
      tenant_id: tenant.id,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      endpoint_url: file.endpointUrl,
      secret_encrypted: encrypt(file.secret),
      prompt_note: t.promptNote,
      enabled: t.enabled,
    })),
    { onConflict: "tenant_id,name" },
  );
  if (error) throw new Error(error.message);

  console.log(`${tenant.name}: registered ${file.tools.map((t) => t.name).join(", ")} -> ${file.endpointUrl}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
