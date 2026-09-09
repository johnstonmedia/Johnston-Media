"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import ThemeToggle from "./ThemeToggle";
import styles from "./Nav.module.css";

const LINKS = [
  { href: "/work", label: "Work" },
  { href: "/web-development", label: "Web Development" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}>
        <div className={styles.inner}>
          {/* The logo artwork already carries the wordmark and tagline,
              so no adjacent text is needed. */}
          <Link href="/" className={styles.logo} aria-label="Johnston Media home">
            <Image
              src="/logo.png"
              alt="Johnston Media"
              width={168}
              height={46}
              priority
              style={{ height: 46, width: "auto" }}
            />
          </Link>

          <nav className={styles.links} aria-label="Primary">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.link} ${
                  isActive(link.href) ? styles.linkActive : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/portal" className={styles.cta}>
              Client Portal
            </Link>
            <ThemeToggle />
          </nav>

          <div className={styles.mobileActions}>
            <ThemeToggle />
            <button
            type="button"
            className={`${styles.hamburger} ${
              menuOpen ? styles.hamburgerOpen : ""
            }`}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`${styles.mobileNav} ${menuOpen ? styles.mobileNavOpen : ""}`}
        hidden={!menuOpen}
      >
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={styles.mobileLink}>
            {link.label}
          </Link>
        ))}
        <Link href="/portal" className="jm-btn-primary">
          Client Portal
        </Link>
      </div>
    </>
  );
}
