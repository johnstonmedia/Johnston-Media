import type { Metadata } from "next";
import Link from "next/link";

import PortalDemo from "@/components/demos/PortalDemo";
import ScriberDemo from "@/components/demos/ScriberDemo";
import Hero from "@/components/Hero";
import { ArrowRight } from "@/components/Icons";
import PackageCards from "@/components/PackageCards";
import { PackageProvider } from "@/components/PackageContext";
import QuoteForm from "@/components/QuoteForm";
import Reveal from "@/components/Reveal";
import { WebDevelopmentSchema } from "@/components/StructuredData";

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
    body: "Your pages appear the moment someone taps the link — on a laptop or on patchy mobile data at a game. Photos stay sharp without making anyone wait.",
  },
  {
    icon: "⚙",
    title: "Automation behind the scenes",
    body: "Quote forms that email you and the client instantly, invoices raised in Square, payments reconciled automatically. The admin runs itself.",
  },
  {
    icon: "◐",
    title: "Client portals & dashboards",
    body: "Give your clients a private login to track their job, approve work and download their files. The same system running this studio, built for yours.",
  },
  {
    icon: "◉",
    title: "Found on Google",
    body: "Set up properly so search engines understand who you are, what you do and where you work — the groundwork that gets you turning up in local searches.",
  },
  {
    icon: "◇",
    title: "Yours to keep",
    body: "You own the site, the domain and every account it runs on. No lock-in, and no monthly fee just to keep your own website online.",
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

/**
 * Case study. Every claim here is verifiable from the live product — no
 * invented client names, metrics or testimonials.
 */
const CASE_STUDY = {
  eyebrow: "Recent work",
  name: "Scriber",
  url: "https://pracscriber.com",
  tagline: "A practice tool for students who sit exams with a writer.",
  body: [
    "Some students are approved to have a person write their exam for them — they dictate, the writer writes. It's a skill, and until now there was nowhere to practise it.",
    "Scriber plays the part of that writer. Students upload a past paper, read it on one side of the screen and dictate their answer on the other, saying every comma and full stop out loud exactly as they'd have to on the day.",
  ],
  detail:
    "The hard part wasn't the dictation — it was making the writer human. A transcription tool types every word instantly and never tires, which teaches a pace no real person could survive. Scriber's writer runs a beat behind, can only hold so much before they lose the thread, and occasionally stops to ask how a word is spelled. Push too fast and they ask you to repeat yourself, exactly as they would in the room.",
  outcomes: [
    "Students practise against realistic limits, not a perfect machine",
    "Exam papers never leave the student's own device",
    "Runs at effectively zero hosting cost",
    "Free for students to use",
  ],
};

const INCLUDED = [
  {
    name: "It loads fast",
    why: "Pages appear straight away, even on a phone on mobile data",
  },
  {
    name: "It's yours",
    why: "You own the site, the domain and every account it runs on",
  },
  {
    name: "No monthly ransom",
    why: "Hosting is free or near-free at your scale — no platform fees",
  },
  {
    name: "It stays fixed",
    why: "Nothing breaks itself overnight the way plugin-based sites do",
  },
  {
    name: "Payments you already trust",
    why: "Invoicing through Square, straight into the account you use now",
  },
  {
    name: "Someone to call",
    why: "You deal with me directly — the person who actually built it",
  },
];

export default function WebDevelopmentPage() {
  return (
    <PackageProvider>
      <WebDevelopmentSchema />
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

          <Reveal delay={80}>
            <PackageCards source="web" quoteAnchorId="web-quote" />
          </Reveal>
        </div>
      </section>

      {/* ─── Case study ───────────────────────────── */}
      <section className="jm-section jm-section--alt">
        <div className="jm-inner">
          <Reveal>
            <span className="jm-eyebrow">{CASE_STUDY.eyebrow}</span>
            <h2 className="jm-section-title">
              {CASE_STUDY.name} — <em>{CASE_STUDY.tagline}</em>
            </h2>
            <hr className="jm-section-rule" />
          </Reveal>

          <div className={styles.caseGrid}>
            <Reveal>
              {CASE_STUDY.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className="jm-body"
                  style={{ marginBottom: "1rem" }}
                >
                  {paragraph}
                </p>
              ))}

              <div className={styles.caseDetail}>
                <span className={styles.caseDetailLabel}>
                  The interesting problem
                </span>
                <p>{CASE_STUDY.detail}</p>
              </div>

              <a
                href={CASE_STUDY.url}
                className="jm-btn-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit {CASE_STUDY.name} <ArrowRight />
              </a>
            </Reveal>

            <Reveal delay={120}>
              <ul className={styles.outcomeList}>
                {CASE_STUDY.outcomes.map((outcome) => (
                  <li key={outcome}>
                    <span className={styles.check} aria-hidden="true">
                      ✓
                    </span>
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.caseNote}>
                Built end to end — the idea, the interface, the logic and the
                launch. Live at{" "}
                <a
                  href={CASE_STUDY.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  pracscriber.com
                </a>
                .
              </p>
            </Reveal>
          </div>

          {/* The demo does the explaining that the copy above can't. */}
          <Reveal delay={80}>
            <ScriberDemo />
          </Reveal>
        </div>
      </section>

      {/* ─── Portal demo ──────────────────────────── */}
      <section className="jm-section">
        <div className="jm-inner">
          <Reveal>
            <span className="jm-eyebrow">What a portal feels like</span>
            <h2 className="jm-section-title">
              Your clients get <em>their own login</em>
            </h2>
            <hr className="jm-section-rule" />
            <p className="jm-body" style={{ maxWidth: "66ch" }}>
              No more chasing approvals over text and losing files in expired
              download links. Your client signs in, sees exactly where their job
              is up to, approves the estimate, pays, and collects their files —
              while the same job updates on your side automatically.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <PortalDemo />
          </Reveal>
        </div>
      </section>

      {/* ─── Process ──────────────────────────────── */}
      <section className="jm-section">
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
      <section className="jm-section jm-section--alt">
        <div className="jm-inner">
          <div className={styles.stackGrid}>
            <Reveal>
              <span className="jm-eyebrow">What you get</span>
              <h2 className="jm-section-title">
                Built to <em>stay built</em>
              </h2>
              <hr className="jm-section-rule" />
              <p className="jm-body">
                No page builders, no plugin soup, nothing that breaks itself
                while you sleep. You get a site that's genuinely yours, runs
                for almost nothing, and still works properly in three
                years&apos; time.
              </p>
              <p style={{ marginTop: "1.75rem" }}>
                <Link href="#web-quote" className="jm-btn-primary">
                  Start a project <ArrowRight />
                </Link>
              </p>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.stackList}>
                {INCLUDED.map((item) => (
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
    </PackageProvider>
  );
}
