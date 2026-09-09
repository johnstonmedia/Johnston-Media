import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Mostly here so the site gets a proper icon and name when someone adds it to
 * a phone home screen — the portal is the part clients return to, and it's
 * worth it looking like an app rather than a bookmark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Johnston Media — Your Vision. My Lens.",
    short_name: "Johnston Media",
    description:
      "Cinematic photography, videography, aerial media and web development across New South Wales.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#0b2740",
    lang: "en-AU",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
