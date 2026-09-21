import { build } from "esbuild";

await build({
  entryPoints: ["widget/index.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  outfile: "public/widget.js",
});

console.log("widget.js built.");
