import type { Metadata } from "next";
import Link from "next/link";

import Hero from "@/components/Hero";
import { ArrowRight } from "@/components/Icons";
import QuoteForm from "@/components/QuoteForm";
import Reveal from "@/components/Reveal";

import pageStyles from "../page.module.css";
import styles from "./web.module.css";

export const metadata: Metadata = {
  title: "Web Development",
  description:
    "Cinematic, fast websites and custom client portals built by Johnston Media — with booking forms, Square invoicing and email automation wired in.",
};

const CAPABILITIES = [
  {
    icon: "◈",
    title: "Websites that feel designed",
    body: "Not a template with your logo dropped in. Every site is built from scratch around your story, your images and the way your customers actually move through a page.",
  },
  {
    icon: "⚡",
    title: "Fast, everywhere",
    body: "Built on Next.js and deployed to a global edge network. Pages load instantly, images are optimised automatically, and mobile is never an afterthought.",
  },
  {
    icon: "⚙",
    title: "Automation behind the scenes",
    body: "Quote forms that email you and the client instantly, invoices raised in Square, payments reconciled automatically. The admin runs itself.",
  },
  {
    icon: "◐",
    title: "Client portals & dashboards",
    body: "Secure logins, role-based access, file delivery, project tracking. The same system running this studio, built for yours.",
  },
  {
    icon: "◉",
    title: "Found on Google",
    body: "Proper metadata, structured markup, clean semantics and real performance scores — the things search engines actually reward.",
  },
  {
    icon: "◇",
    title: "Yours to keep",
    body: "You own the code, the domain and the accounts. No proprietary lock-in, no monthly ransom to keep your own site online.",
  },
];

const PACKAGES = [
  {
    name: "The Landing Page",
    for: "One page, one goal",
    desc: "A single, beautifully built page that converts — ideal for a campaign, a launch or a focused service offering.",
    features: [
      "Custom single-page design",
      "Contact or booking form with email automation",
      "Mobile-first, fully responsive",
      "Basic SEO and analytics",
      "Deployed on Vercel with your domain",
    ],
    featured: false,
  },
  {
    name: "The Business Site",
    for: "Most small businesses",
    desc: "A complete multi-page website with everything a growing business needs to be found, trusted and contacted.",
    features: [
      "Up to 6 custom-designed pages",
      "Portfolio or gallery system",
      "Quote requests wired to your inbox",
      "Square invoicing integration",
      "SEO, analytics and performance tuning",
      "Content you can edit yourself",
    ],
    featured: true,
  },
  {
    name: "Custom Portal",
    for: "When a site isn't enough",
    desc: "A bespoke web application — client logins, dashboards, file delivery, bookings and payments, built around how you actually work.",
    features: [
      "Everything in The Business Site",
      "Secure authentication and user roles",
      "Client dashboard and file delivery",
      "Square payments and automated invoicing",
      "Admin panel built for your workflow",
      "Ongoing support and iteration",
    ],
    featured: false,
  },
];

const PROCESS = [
  {
    num: "Phase 01",
    title: "Discovery",
    body: "We work out what the site actually needs to do — who it's for, what they should feel, and what counts as success. You get a fixed quote before anything starts.",
  },
  {
    num: "Phase 02",
    title: "Design",
    body: "I design the real thing in the browser, not a flat mockup. You see it move, on your phone, before a line of production code is written.",
  },
  {
    num: "Phase 03",
    title: "Build",
    body: "The site gets built, the automation gets wired in, and you get a live preview link that updates as I go. Nothing happens in a black box.",
  },
  {
    num: "Phase 04",
    title: "Launch",
    body: "Domain, DNS, analytics and email all configured and tested. I hand over the keys, walk you through it, and stay reachable afterwards.",
  },
];

const STACK = [
  { name: "Next.js + React", why: "Fast pages, real SEO, no template ceiling" },
  { name: "Vercel", why: "Global edge hosting with instant rollbacks" },
  { name: "Firebase", why: "Authentication, database and secure file storage" },
  { name: "Square", why: "Invoicing and payments your accountant already knows" },
  { name: "Resend", why: "Reliable transactional email that lands in the inbox" },
  { name: "TypeScript", why: "Fewer bugs, safer changes months down the line" },
];

export default function WebDevelopmentPage() {
  return (
    <>
      <Hero
        compact
        eyebrow="Johnston Media · Web Development"
        title={
          <>
            Sites that move
            <em>like film</em>
          </>
        }
        lead="The same eye that frames a shot builds the website. Cinematic, fast, and quietly automated behind the scenes."
        actions={
          <>
            <Link href="#packages" className="jm-btn-primary">
              See packages
            </Link>
            <Link href="#web-quote" className="jm-btn-ghost">
              Request a quote
            </Link>
          </>
        }
      />

      {/* ─── Positioning ──────────────────────────── */}
      <section className="jm-section">
        <div className="jm-inner">
          <Reveal>
            <span className="jm-eyebrow">Why a photographer builds websites</span>
            <h2 className="jm-section-title">
              Composition is composition,
              <br />
              <em>whatever the medium</em>
            </h2>
            <hr className="jm-section-rule" />
            <p className="jm-lead">
              Years of deciding what belongs in a frame — and what gets cut —
              turns out to be the same discipline a good website needs. Most
              sites fail because everything is shouting at once. I build the
              opposite: pages with a clear subject, deliberate pacing, and
              nothing competing for attention that hasn&apos;t earned it.
            </p>
            <p className="jm-body" style={{ marginTop: "1.25rem", maxWidth: "70ch" }}>
              And because I run a studio myself, I know what the back end has to
              do. This very site takes a quote request, creates the customer in
              Square, emails the client, raises the invoice and opens the
              project when it&apos;s paid — without me touching a thing. I build
              that for other people too.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─── Capabilities ─────────────────────────── */}
      <section className="jm-section jm-section--alt">
        <div className="jm-inner">
          <Reveal>
            <span className="jm-eyebrow">What I build</span>
            <h2 className="jm-section-title">More than a brochure</h2>
            <hr className="jm-section-rule" />
          </Reveal>

          <Reveal stagger className={styles.capGrid}>
            {CAPABILITIES.map((cap) => (
              <div key={cap.title} className={styles.cap}>
                <span className={styles.capIcon} aria-hidden="true">
                  {cap.icon}
                </span>
                <h3 className={styles.capTitle}>{cap.title}</h3>
                <p className={styles.capBody}>{cap.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ─── Packages ─────────────────────────────── */}
      <section className="jm-section" id="packages">
        <div className="jm-inner">
          <Reveal>
            <span className="jm-eyebrow">Packages</span>
            <h2 className="jm-section-title">Three ways to start</h2>
            <hr className="jm-section-rule" />
            <p className="jm-body" style={{ maxWidth: "62ch" }}>
              Every project is quoted individually — these are starting points,
              not boxes you have to fit into. Tell me what you need and
              I&apos;ll price it honestly.
            </p>
          </Reveal>

          <Reveal stagger className={styles.packages} delay={80}>
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.name}
                className={`${styles.package} ${
                  pkg.featured ? styles.packageFeatured : ""
                }`}
              >
                {pkg.featured ? (
                  <span
                    className={`jm-badge jm-badge--copper ${styles.packageTag}`}
                  >
                    Most popular
                  </span>
                ) : null}
                <h3 className={styles.packageName}>{pkg.name}</h3>
                <p className={styles.packageFor}>{pkg.for}</p>
                <p className={styles.packageDesc}>{pkg.desc}</p>

                <ul className={styles.packageList}>
                  {pkg.features.map((feature) => (
                    <li key={feature}>
                      <span className={styles.check} aria-hidden="true">
                        ✓
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="#web-quote"
                  className={pkg.featured ? "jm-btn-primary" : "jm-btn-ghost"}
                >
                  Request a quote
                </Link>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ─── Process ──────────────────────────────── */}
      <section className="jm-section jm-section--alt">
        <div className="jm-inner">
          <Reveal>
            <span className="jm-eyebrow">The process</span>
            <h2 className="jm-section-title">How a site gets made</h2>
            <hr className="jm-section-rule" />
          </Reveal>

          <Reveal stagger className={styles.timeline} delay={80}>
            {PROCESS.map((phase) => (
              <div key={phase.num} className={styles.phase}>
                <span className={styles.phaseNum}>{phase.num}</span>
                <h3 className={styles.phaseTitle}>{phase.title}</h3>
                <p className={styles.phaseBody}>{phase.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ─── Stack ────────────────────────────────── */}
      <section className="jm-section">
        <div className="jm-inner">
          <div className={styles.stackGrid}>
            <Reveal>
              <span className="jm-eyebrow">Under the hood</span>
              <h2 className="jm-section-title">
                Built on tools that <em>last</em>
              </h2>
              <hr className="jm-section-rule" />
              <p className="jm-body">
                No page builders, no plugin soup, nothing that breaks when it
                updates itself at 2am. Just modern, well-supported technology
                that any developer can pick up if you ever need them to.
              </p>
              <p style={{ marginTop: "1.75rem" }}>
                <Link href="#web-quote" className="jm-btn-primary">
                  Start a project <ArrowRight />
                </Link>
              </p>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.stackList}>
                {STACK.map((item) => (
                  <div key={item.name} className={styles.stackItem}>
                    <span className={styles.stackName}>{item.name}</span>
                    <span className={styles.stackWhy}>{item.why}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Quote form ───────────────────────────── */}
      <section className="jm-section jm-section--alt" id="web-quote">
        <div className={`jm-inner ${styles.quoteWrap}`}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <span className="jm-eyebrow">Start here</span>
              <h2 className="jm-section-title">Tell me about your project</h2>
              <p
                className="jm-body"
                style={{ margin: "1rem auto 0", maxWidth: "52ch" }}
              >
                A few details is all I need to come back with a real number and
                a realistic timeline.
              </p>
            </div>

            <div className={styles.quoteCard}>
              <QuoteForm source="web" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────── */}
      <section className={pageStyles.ctaStrip}>
        <div className="jm-grain" aria-hidden="true" />
        <Reveal className={pageStyles.ctaInner}>
          <div>
            <h2 className={pageStyles.ctaTitle}>
              Need the photography too?
            </h2>
            <p className={pageStyles.ctaSub}>
              Site, stills and video from one studio — shot to match, built to fit.
            </p>
          </div>
          <Link href="/work" className="jm-btn-white">
            See the work <ArrowRight />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
