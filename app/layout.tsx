import type { Metadata, Viewport } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";

import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import ScrollProgress from "@/components/ScrollProgress";
import { BusinessSchema } from "@/components/StructuredData";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/Toast";

import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wjohnstonmedia.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Johnston Media — Your Vision. My Lens.",
    template: "%s · Johnston Media",
  },
  description:
    "Sydney-based photography, videography, aerial media and web development. Cinematic storytelling for sports, commercial and events.",
  keywords: [
    "photography Sydney",
    "videography NSW",
    "sports photography",
    "aerial drone media",
    "commercial video production",
    "web development Sydney",
  ],
  authors: [{ name: "Will Johnston" }],
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: siteUrl,
    siteName: "Johnston Media",
    title: "Johnston Media — Your Vision. My Lens.",
    description:
      "Cinematic photography, videography, aerial media and web development across New South Wales.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Johnston Media — Your Vision. My Lens.",
    description:
      "Cinematic photography, videography, aerial media and web development across New South Wales.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#faf8f6" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-AU"
      className={`${playfair.variable} ${montserrat.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved theme before first paint, so there's no flash of
            the wrong one. Falls through to prefers-color-scheme otherwise. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <BusinessSchema />
        <ToastProvider>
          <a href="#main" className="jm-skip-link">
            Skip to content
          </a>
          <ScrollProgress />
          <Nav />
          <main id="main">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
