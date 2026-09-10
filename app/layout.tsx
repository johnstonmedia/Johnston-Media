import type { Metadata, Viewport } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";

import { BusinessSchema } from "@/components/StructuredData";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/Toast";
import { SITE_URL } from "@/lib/siteUrl";

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



export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  creator: "Will Johnston",
  publisher: "Johnston Media",
  // Every page declares its own canonical relative to this base, so the
  // vercel.app previews never compete with the real domain in search.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE_URL,
    siteName: "Johnston Media",
    title: "Johnston Media — Your Vision. My Lens.",
    description:
      "Cinematic photography, videography, aerial media and web development across New South Wales.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Johnston Media — photography, videography, aerial and web, New South Wales",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Johnston Media — Your Vision. My Lens.",
    description:
      "Cinematic photography, videography, aerial media and web development across New South Wales.",
    images: ["/og-image.jpg"],
  },
  icons: {
    // app/favicon.ico is picked up automatically — listing it here too would
    // emit the tag twice.
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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
        {/* Chrome (nav, footer, skip link) belongs to the (site) route
            group; the email platform supplies its own. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
