// Public base URL for links that leave the app: emails, the widget snippet.
// On Vercel, VERCEL_PROJECT_PRODUCTION_URL is the project's production domain
// (e.g. chatalot.vercel.app, or a custom domain once added) — never one of
// the per-deployment URLs, which sit behind Vercel's login. Elsewhere (local
// dev) it falls back to NEXT_PUBLIC_APP_URL.
export function appUrl(path = ""): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = production
    ? `https://${production}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path}`;
}
