import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// widget.js (the loader plus the chat, what every site loads) and one
// file per inline widget, which the loader fetches only when the
// page has a <div data-chatalot="..."> for it.
const bundles = [
  { entry: "widget/index.ts", out: "public/widget.js" },
  { entry: "widget/schedule/index.ts", out: "public/widgets/schedule.js" },
  { entry: "widget/appointment/index.ts", out: "public/widgets/appointment.js" },
  { entry: "widget/reschedule/index.ts", out: "public/widgets/reschedule.js" },
];

// All widgets together must stay under this, gzipped (see CLAUDE.md).
const BUDGET_BYTES = 60 * 1024;

let total = 0;
for (const { entry, out } of bundles) {
  await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2020"],
    outfile: out,
  });
  const gz = gzipSync(readFileSync(out)).length;
  total += gz;
  console.log(`${out}: ${(gz / 1024).toFixed(1)} KB gzipped`);
}
console.log(`widgets total: ${(total / 1024).toFixed(1)} KB gzipped (budget ${BUDGET_BYTES / 1024} KB)`);
if (total > BUDGET_BYTES) {
  console.error("Widget bundles are over budget.");
  process.exit(1);
}
