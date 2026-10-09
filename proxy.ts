import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Refreshes the Supabase session cookie on every request so Server Components
// always see a valid session. Skips the public widget/chat/webhook API routes,
// which never carry a user session and use the service-role client instead.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Triggers a token refresh if the current one is expired. getClaims()
  // verifies the JWT locally against the project's cached signing keys, so
  // (unlike getUser()) it doesn't cost a round trip to Supabase per request.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ?? null;

  // Signed-out visits to the dashboard or admin go to login, remembering the
  // page — e.g. a conversation link from a notification email — so sign-in
  // returns there. (The layouts still enforce auth; this is about the return trip.)
  const { pathname, search } = request.nextUrl;
  if (!user && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }

  // "/" is the static marketing page for visitors. Signed-in users get
  // /welcome instead (same URL), which sends staff on to their dashboard.
  // Deciding here keeps the landing page free of cookies, so it stays static.
  if (user && pathname === "/") {
    const welcome = request.nextUrl.clone();
    welcome.pathname = "/welcome";
    const rewrite = NextResponse.rewrite(welcome, { request });
    // Keep any refreshed session cookies from above.
    response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
    return rewrite;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/chat|api/widget|api/whatsapp|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|video/).*)",
  ],
};
