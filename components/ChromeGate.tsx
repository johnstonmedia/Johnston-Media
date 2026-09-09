"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides the marketing site's nav and footer inside the email platform.
 *
 * The email platform is an application, not a page of the website: it has its
 * own sidebar and fills the window. Its children are rendered on the server and
 * passed through here, so nothing is built and then thrown away — on an /email
 * route this simply returns null.
 */
export default function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/email")) return null;
  return <>{children}</>;
}
