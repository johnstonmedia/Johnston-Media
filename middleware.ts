import { NextResponse, type NextRequest } from "next/server";

/**
 * Serves the email platform on its own subdomain.
 *
 * mail.wjohnstonmedia.com/anything is rewritten to /email/anything, so the
 * platform gets an address of its own — which matters because it's a different
 * tool for a different job, and because a link to a conversation shouldn't
 * look like a link to the photography site.
 *
 * A rewrite rather than a redirect: the URL in the bar stays on the subdomain,
 * so a link you copy out of the address bar is a mail.* link. The /email path
 * still works directly, which is what makes local development and Vercel
 * preview deployments possible without wildcard DNS.
 *
 * Both mail.* and email.* are accepted. mail.* is the one to use; email.* is
 * kept because it was the address first, and a subdomain that has been handed
 * out even once should not start 404ing.
 */
const EMAIL_HOSTS = [
  "mail.wjohnstonmedia.com",
  "email.wjohnstonmedia.com",
  "mail.localhost:3000",
  "email.localhost:3000",
];

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
