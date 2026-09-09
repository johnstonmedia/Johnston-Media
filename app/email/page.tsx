import type { Metadata } from "next";

import EmailApp from "./EmailApp";

export const metadata: Metadata = {
  title: "Email",
  description: "Campaigns, contacts and the help inbox for Johnston Media.",
  // An internal tool. Nothing here belongs in a search index.
  robots: { index: false, follow: false },
};

export default function EmailPlatformPage() {
  return <EmailApp />;
}
