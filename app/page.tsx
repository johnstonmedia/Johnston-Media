import Link from "next/link";

import Hero from "@/components/Hero";
import { ArrowRight } from "@/components/Icons";
import PortfolioGrid from "@/components/PortfolioGrid";
import Reveal from "@/components/Reveal";

import styles from "./page.module.css";

const SERVICES = [
  {
    icon: "📷",
    title: "Photography",
    desc: "Sports, commercial and events — frozen with precision.",
  },
  {
    icon: "🎬",
    title: "Videography",
    desc: "Cinematic storytelling from sidelines to boardrooms.",
  },
  {
    icon: "🚁",
    title: "Aerial",
    desc: "Licensed drone coverage giving a perspective like no other.",
  },
  {
    icon: "✂️",
    title: "Editing",
    desc: "Grade, cut, deliver — end to end post-production.",
  },
  {
    icon: "⌘",
    title: "Web Development",
    desc: "Sites and client portals built with the same eye for detail.",
  },
];

const STATS = [
  { num: "100+", label: "Projects" },
  { num: "5+", label: "Years" },
  { num: "NSW", label: "Based & Beyond" },
  { num: "4K", label: "Resolution" },
];

export default function HomePage() {
  return (
    <>
      <Hero
        useSettingsVideo
        showScroll
        eyebrow="Sydney · NSW · Australia"
        title={
          <>
            Cinematic Stories
            <em>Built to Last</em>
          </>
        }
        sub="Sports · Commercial · Events · Aerial"
        actions={
          <>
            <Link href="/work" className="jm-btn-primary">
              View Work
            </Link>
            <Link href="/contact" className="jm-btn-ghost">
              Get in Touch
            </Link>
          </>
        }
      />

      {/* ─── Services ─────────────────────────────── */}
      <section className={styles.services} aria-label="Services">
        <Reveal stagger className={styles.servicesGrid}>
          {SERVICES.map((service) => (
            <div key={service.title} className={styles.service}>
              <span className={styles.serviceIcon} aria-hidden="true">
                {service.icon}
              </span>
              <h2 className={styles.serviceTitle}>{service.title}</h2>
              <p className={styles.serviceDesc}>{service.desc}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ─── Selected work ────────────────────────── */}
      <section className="jm-section" id="work">
        <div className="jm-inner">
          <Reveal className={styles.sectionHead}>
            <div className={styles.sectionHeadRow}>
              <div>
                <span className="jm-eyebrow">Selected Work</span>
                <h2 className="jm-section-title">The Portfolio</h2>
              </div>
              <Link href="/work" className="jm-btn-ghost jm-btn-sm">
                All work <ArrowRight />
              </Link>
            </div>
            <hr className="jm-section-rule" />
          </Reveal>

          <Reveal>
            <PortfolioGrid
              categorySlug="sports-video"
              label="Sports Videography"
              limit={3}
            />
          </Reveal>
          <Reveal>
            <PortfolioGrid
              categorySlug="commercial"
              label="Commercial"
              limit={3}
            />
          </Reveal>
        </div>
      </section>

      {/* ─── Web development teaser ───────────────── */}
      <section className={styles.webTeaser}>
        <div className={`jm-flare ${styles.webFlare}`} aria-hidden="true" />
        <div className="jm-grain" aria-hidden="true" />

        <div className={styles.webTeaserInner}>
          <Reveal>
            <span className="jm-eyebrow">New — Web Development</span>
            <h2 className="jm-section-title">
              Sites that move <em>like film</em>
            </h2>
            <hr className="jm-section-rule" />
            <p className="jm-body">
              The same instinct that frames a shot builds a website. I design
              and build fast, cinematic sites — plus the booking forms, client
              portals and invoicing automation that run quietly behind them.
            </p>

            <div className={styles.pillRow}>
              {[
                "Next.js",
                "Firebase",
                "Square payments",
                "Email automation",
                "Client portals",
              ].map((pill) => (
                <span key={pill} className={styles.pill}>
                  {pill}
                </span>
              ))}
            </div>

            <Link href="/web-development" className="jm-btn-primary">
              Explore web development <ArrowRight />
            </Link>
          </Reveal>

          <Reveal delay={120}>
            <div className={styles.codeCard}>
              <div className={styles.codeBar}>
                <span
                  className={styles.codeDot}
                  style={{ background: "#e05252" }}
                />
                <span
                  className={styles.codeDot}
                  style={{ background: "#F2C88D" }}
                />
                <span
                  className={styles.codeDot}
                  style={{ background: "#4a9d6e" }}
                />
              </div>
              <pre className={styles.codeBody}>
                <code>
                  <span className={styles.codeCom}>
                    {"// quote → invoice → paid, automatically"}
                  </span>
                  {"\n"}
                  <span className={styles.codeKey}>const</span> quote ={" "}
                  <span className={styles.codeKey}>await</span> createQuote(
                  {"{\n"}
                  {"  service: "}
                  <span className={styles.codeStr}>
                    &quot;Season Highlights&quot;
                  </span>
                  ,{"\n"}
                  {"  client:  "}
                  <span className={styles.codeStr}>
                    &quot;jane@club.com.au&quot;
                  </span>
                  ,{"\n"}
                  {"});\n\n"}
                  <span className={styles.codeKey}>await</span> square.
                  sendInvoice(quote);{"\n"}
                  <span className={styles.codeKey}>await</span> email.
                  quoteReady(quote);{"\n\n"}
                  <span className={styles.codeCom}>
                    {"// → client pays, project opens"}
                  </span>
                </code>
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── About ────────────────────────────────── */}
      <section className="jm-section jm-section--alt" id="about">
        <div className="jm-inner">
          <div className={styles.aboutGrid}>
            <Reveal>
              <span className="jm-eyebrow">About Johnston Media</span>
              <blockquote className={styles.aboutQuote}>
                &ldquo;Every frame
                <br />
                is a decision.&rdquo;
              </blockquote>
              <hr className="jm-section-rule" />
              <p className="jm-body">
                Based in New South Wales, Johnston Media delivers cinematic
                photography and videography for sports teams, brands, and
                events. With an eye trained on authentic connection — we
                don&apos;t just document your story, we craft it.
              </p>
              <p style={{ marginTop: "1.5rem" }}>
                <Link href="/contact" className="jm-btn-primary">
                  Work With Me
                </Link>
              </p>
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

      {/* ─── CTA ──────────────────────────────────── */}
      <section className={styles.ctaStrip}>
        <div className="jm-grain" aria-hidden="true" />
        <Reveal className={styles.ctaInner}>
          <div>
            <h2 className={styles.ctaTitle}>
              Ready to create something
              <br />
              worth remembering?
            </h2>
            <p className={styles.ctaSub}>
              Your next project starts with a conversation.
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
