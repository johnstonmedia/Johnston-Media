import { NextResponse, type NextRequest } from "next/server";

/**
 * Serves the email platform on its own subdomain.
 *
 * email.wjohnstonmedia.com/anything is rewritten to /email/anything, so the
 * platform gets a address of its own — which matters because it's a different
 * tool for a different job, and because a link to a campaign shouldn't look
 * like a link to the photography site.
 *
 * A rewrite rather than a redirect: the URL in the bar stays on the subdomain.
 * The /email path still works directly, which is what makes local development
 * and Vercel preview deployments possible without wildcard DNS.
 */
const EMAIL_HOSTS = ["email.wjohnstonmedia.com", "email.localhost:3000"];

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (!EMAIL_HOSTS.includes(host)) return NextResponse.next();

  const url = request.nextUrl.clone();

  // Already rewritten, or a shared asset — leave it alone.
  if (
    url.pathname.startsWith("/email") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  url.pathname = `/email${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip static files and image optimisation — they're host-agnostic.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
