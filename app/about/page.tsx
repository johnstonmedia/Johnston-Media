import type { Metadata } from "next";
import Link from "next/link";

import Hero from "@/components/Hero";
import { ArrowRight } from "@/components/Icons";
import Reveal from "@/components/Reveal";
import { getSiteSettings, paragraphs } from "@/lib/serverSettings";

import styles from "../page.module.css";

/**
 * Picks up edits made in the admin panel without a redeploy.
 * Must be a literal — Next.js reads route config statically.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "About",
  description:
    "Johnston Media is Will Johnston — a New South Wales photographer, videographer and drone operator telling stories with a cinematic eye.",
};

/** Shown until the story is written in Admin → Site content. */
const DEFAULT_STORY = [
  "Johnston Media is Will Johnston. Based in New South Wales, I shoot cinematic photography and video for sports teams, brands and events — and I stay on the project from the first conversation to final delivery.",
  "That means the person you brief is the person behind the camera and in the edit. Nothing gets lost in a handover, and the story you set out to tell is the one that gets delivered.",
  "More recently that same care has extended to the web — building the sites, portals and automation that studios and small businesses actually need.",
];

const STATS = [
  { num: "100+", label: "Projects" },
  { num: "5+", label: "Years" },
  { num: "NSW", label: "Based & Beyond" },
  { num: "4K", label: "Resolution" },
];

const PROCESS = [
  {
    step: "01",
    title: "Conversation",
    body: "We talk through the story, the audience and what success actually looks like — before a single frame is planned.",
  },
  {
    step: "02",
    title: "Plan the shoot",
    body: "Locations, timings, shot list and gear. Aerial permissions sorted where they're needed.",
  },
  {
    step: "03",
    title: "Shoot",
    body: "On the day I stay out of the way and read the moment. Nothing staged that shouldn't be.",
  },
  {
    step: "04",
    title: "Cut and grade",
    body: "The edit is where the story lands. You see a cut, give notes, and we refine until it sings.",
  },
  {
    step: "05",
    title: "Deliver",
    body: "Final files land in your client portal, in every format and ratio you need.",
  },
];

export default async function AboutPage() {
  const settings = await getSiteSettings();
  const story = paragraphs(settings?.aboutText);
  const body = story.length > 0 ? story : DEFAULT_STORY;

  return (
    <>
      <Hero
        compact
        eyebrow="About Johnston Media"
        title={
          <>
            Every frame
            <em>is a decision</em>
          </>
        }
        lead="Photography, videography and aerial media for people who care how their story looks."
      />

      <section className="jm-section">
        <div className="jm-inner">
          <div className={styles.aboutGrid}>
            <Reveal>
              <span className="jm-eyebrow">The Studio</span>
              <h2 className="jm-section-title">
                {settings?.aboutTitle ? (
                  settings.aboutTitle
                ) : (
                  <>
                    A one-person studio, <em>on purpose</em>
                  </>
                )}
              </h2>
              <hr className="jm-section-rule" />
              {body.map((para, i) => (
                <p
                  key={para.slice(0, 32)}
                  className="jm-body"
                  style={i > 0 ? { marginTop: "1rem" } : undefined}
                >
                  {para}
                </p>
              ))}
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.statsGrid}>
                {STATS.map((stat) => (
                  <div key={stat.label} className={styles.stat}>
                    <div className={styles.statNum}>{stat.num}</div>
                    <div className={styles.statLabel}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="jm-section jm-section--alt">
        <div className="jm-inner">
          <Reveal>
            <span className="jm-eyebrow">How it works</span>
            <h2 className="jm-section-title">From brief to delivery</h2>
            <hr className="jm-section-rule" />
          </Reveal>

          <Reveal
            stagger
            className={styles.servicesGrid}
            // Process steps read as a sequence, so they're numbered.
          >
            {PROCESS.map((item) => (
              <div key={item.step} className={styles.service}>
                <span className={styles.serviceIcon} aria-hidden="true">
                  {item.step}
                </span>
                <h3 className={styles.serviceTitle}>{item.title}</h3>
                <p className={styles.serviceDesc}>{item.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className={styles.ctaStrip}>
        <div className="jm-grain" aria-hidden="true" />
        <Reveal className={styles.ctaInner}>
          <div>
            <h2 className={styles.ctaTitle}>Let&apos;s make something good.</h2>
            <p className={styles.ctaSub}>
              Tell me what you have in mind and I&apos;ll come back with a plan.
            </p>
          </div>
          <Link href="/contact" className="jm-btn-white">
            Get a Quote <ArrowRight />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
