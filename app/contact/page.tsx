import type { Metadata } from "next";

import ContactForm from "@/components/ContactForm";
import Hero from "@/components/Hero";
import { InstagramIcon, TikTokIcon, YouTubeIcon } from "@/components/Icons";
import QuoteForm from "@/components/QuoteForm";
import Reveal from "@/components/Reveal";

import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Request a quote from Johnston Media — cinematic photography, videography and aerial media across New South Wales.",
};

const PRIMARY_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "wjohnston.media@gmail.com";

const DETAILS = [
  { label: "Based in", value: "New South Wales, Australia" },
  { label: "Travels", value: "Sydney, Newcastle, Wollongong & beyond" },
  { label: "Response time", value: "Usually within one business day" },
  { label: "Aerial", value: "Licensed drone operation" },
];

const SOCIALS = [
  {
    href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "https://instagram.com",
    label: "Instagram",
    icon: <InstagramIcon />,
  },
  {
    href: process.env.NEXT_PUBLIC_TIKTOK_URL ?? "https://tiktok.com",
    label: "TikTok",
    icon: <TikTokIcon />,
  },
  {
    href: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? "https://youtube.com",
    label: "YouTube",
    icon: <YouTubeIcon />,
  },
];

export default function ContactPage() {
  return (
    <>
      <Hero
        compact
        eyebrow="Get in Touch"
        title={
          <>
            Let&apos;s talk about
            <em>your project</em>
          </>
        }
        lead="Tell me what you have in mind and I'll come back with a quote — usually within one business day."
      />

      <section className="jm-section">
        <div className="jm-inner">
          <div className={styles.grid}>
            <Reveal>
              <span className="jm-eyebrow">Direct</span>
              <h2 className="jm-section-title" style={{ fontSize: "1.9rem" }}>
                Straight to my inbox
              </h2>
              <a href={`mailto:${PRIMARY_EMAIL}`} className={styles.email}>
                {PRIMARY_EMAIL}
              </a>
              <p className="jm-body">
                Have a project in mind? Whether it&apos;s a sports season, a
                brand campaign, a website, or something in between — reach out
                and we&apos;ll make it happen.
              </p>

              <div className={styles.detailList}>
                {DETAILS.map((detail) => (
                  <div key={detail.label} className={styles.detail}>
                    <div className={styles.detailLabel}>{detail.label}</div>
                    <div className={styles.detailValue}>{detail.value}</div>
                  </div>
                ))}
              </div>

              <div className={styles.socialRow}>
                {SOCIALS.map((social) => (
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
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.formCard}>
                <h2 className={styles.formCardTitle}>Request a quote</h2>
                <p className={styles.formCardSub}>
                  The more detail you give me, the sharper the quote.
                </p>
                <QuoteForm source="media" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="jm-section jm-section--alt jm-section--tight">
        <div className={`jm-inner ${styles.shortForm}`}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="jm-eyebrow">Or just say hello</span>
              <h2 className="jm-section-title" style={{ fontSize: "1.7rem" }}>
                A quick message works too
              </h2>
            </div>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
