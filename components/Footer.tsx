import Image from "next/image";
import Link from "next/link";

import { getSiteSettings } from "@/lib/serverSettings";

import { InstagramIcon, TikTokIcon, YouTubeIcon } from "./Icons";
import styles from "./Footer.module.css";

const NAVIGATE = [
  { href: "/work", label: "Work" },
  { href: "/web-development", label: "Web Development" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/portal", label: "Client Portal" },
];

const SERVICES = [
  { href: "/work#sports-video", label: "Sports Videography" },
  { href: "/work#sports-photo", label: "Sports Photography" },
  { href: "/work#commercial", label: "Commercial" },
  { href: "/web-development", label: "Websites & Portals" },
];

export default async function Footer() {
  const year = new Date().getFullYear();
  const settings = await getSiteSettings();

  // Admin panel first, then the env var, then the bare platform link.
  const socials = [
    {
      href:
        settings?.igUrl ||
        process.env.NEXT_PUBLIC_INSTAGRAM_URL ||
        "https://instagram.com",
      label: "Instagram",
      icon: <InstagramIcon />,
    },
    {
      href:
        settings?.ttUrl ||
        process.env.NEXT_PUBLIC_TIKTOK_URL ||
        "https://tiktok.com",
      label: "TikTok",
      icon: <TikTokIcon />,
    },
    {
      href:
        settings?.ytUrl ||
        process.env.NEXT_PUBLIC_YOUTUBE_URL ||
        "https://youtube.com",
      label: "YouTube",
      icon: <YouTubeIcon />,
    },
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Image
              src="/logo.png"
              alt="Johnston Media"
              width={170}
              height={46}
              style={{ height: 46, width: "auto" }}
            />
            <p className={styles.tagline}>Your Vision. My Lens.</p>
            <p className={styles.blurb}>
              Cinematic photography, videography and aerial media across New
              South Wales — plus websites built with the same eye for detail.
            </p>
          </div>

          <nav className={styles.nav} aria-label="Footer">
            <div className={styles.col}>
              <h4>Navigate</h4>
              {NAVIGATE.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
            <div className={styles.col}>
              <h4>Services</h4>
              {SERVICES.map((link) => (
                <Link key={link.label} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>
            © {year} Johnston Media · New South Wales, Australia
            {settings?.footerNote ? ` · ${settings.footerNote}` : ""}
          </p>
          <div className={styles.social}>
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                className={styles.socialBtn}
                aria-label={social.label}
                target="_blank"
                rel="noopener noreferrer"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
