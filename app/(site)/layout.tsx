import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import ScrollProgress from "@/components/ScrollProgress";

/**
 * The marketing site's chrome.
 *
 * This lives in a route group rather than in the root layout because the email
 * platform is an application, not a page of the website — it has its own
 * sidebar and fills the window, and the site nav sitting on top of it is wrong.
 *
 * A route group is the right tool for that rather than a runtime check on the
 * pathname: mail.wjohnstonmedia.com is rewritten to /email by middleware, and a
 * rewrite leaves the browser's URL on "/", so anything asking usePathname()
 * whether it is "on /email" gets told no and renders the nav anyway. Routing
 * decides this at build time instead, so there is nothing to get wrong and no
 * flash of the wrong chrome on hydration.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#main" className="jm-skip-link">
        Skip to content
      </a>
      <ScrollProgress />
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
