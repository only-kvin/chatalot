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
  { entry: "widget/contact/index.ts", out: "public/widgets/contact.js" },
  { entry: "widget/registration/index.ts", out: "public/widgets/registration.js" },
  { entry: "widget/events/index.ts", out: "public/widgets/events.js" },
  { entry: "widget/classes/index.ts", out: "public/widgets/classes.js" },
];

// Each file must stay under this, gzipped (see CLAUDE.md): a page loads
// widget.js plus only the widgets it shows, so what matters is each one's
// size, not the sum of all of them (printed for reference).
const BUDGET_PER_FILE = 20 * 1024;

let total = 0;
const over = [];
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
  if (gz > BUDGET_PER_FILE) over.push(out);
  console.log(`${out}: ${(gz / 1024).toFixed(1)} KB gzipped`);
}
console.log(`all widgets: ${(total / 1024).toFixed(1)} KB gzipped (budget ${BUDGET_PER_FILE / 1024} KB per file)`);
if (over.length) {
  console.error(`Over budget: ${over.join(", ")}`);
  process.exit(1);
}
