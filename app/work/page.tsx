import type { Metadata } from "next";
import Link from "next/link";

import Hero from "@/components/Hero";
import { ArrowRight } from "@/components/Icons";
import PortfolioGrid from "@/components/PortfolioGrid";
import Reveal from "@/components/Reveal";
import { PORTFOLIO_CATEGORIES } from "@/lib/types";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected sports videography, sports photography and commercial work from Johnston Media across New South Wales.",
  alternates: { canonical: "/work" },
};

export default function WorkPage() {
  return (
    <>
      <Hero
        compact
        eyebrow="Selected Work"
        title={
          <>
            The Portfolio
            <em>Frame by Frame</em>
          </>
        }
        lead="Sports seasons, brand campaigns and events — shot, cut and graded in-house."
      />

      <section className="jm-section">
        <div className="jm-inner">
          {PORTFOLIO_CATEGORIES.map((category) => (
            <Reveal key={category.slug}>
              <PortfolioGrid
                categorySlug={category.slug}
                label={category.label}
              />
            </Reveal>
          ))}

          <Reveal>
            <div
              className="jm-card"
              style={{ textAlign: "center", marginTop: "2rem" }}
            >
              <h2 className="jm-section-title" style={{ fontSize: "1.8rem" }}>
                Something in mind?
              </h2>
              <p className="jm-body" style={{ margin: "0.75rem auto 1.5rem", maxWidth: "48ch" }}>
                Every project starts with a conversation about what you want
                people to feel when they watch it.
              </p>
              <Link href="/contact" className="jm-btn-primary">
                Request a quote <ArrowRight />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
