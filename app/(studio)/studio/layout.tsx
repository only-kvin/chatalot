import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/db/auth";
import { getPlatformRole } from "@/lib/db/platform-role";
import { ThemeScript } from "@/components/theme/theme-script";

// The studio: where the website-factory team finds any business and sets up
// its widgets for the sites they build. Platform staff and admins only.
// Pages here read with the service role after this check, and only what
// they need (business names, widgets), never conversations or customers.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/studio");
  const role = await getPlatformRole();
  if (!role) redirect("/dashboard");

  return (
    <div className="app-backdrop min-h-screen">
      <ThemeScript />
      <header className="border-b bg-card/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/studio" className="font-semibold">
            Studio
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            {role === "admin" && (
              <Link href="/admin" className="hover:text-foreground">
                Admin
              </Link>
            )}
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
