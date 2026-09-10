/**
 * The email platform renders its own full-window shell — no site nav, no
 * footer, no scroll-progress bar. It sits outside the (site) route group so
 * that chrome is never built in the first place.
 */
export default function EmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main id="main">{children}</main>;
}
