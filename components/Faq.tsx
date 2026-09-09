import { faqSchema, type FaqItem } from "@/lib/faq";

import styles from "./Faq.module.css";
import Reveal from "./Reveal";

interface FaqProps {
  items: FaqItem[];
  /** Stable @id for the schema, e.g. "https://…/contact#faq". */
  schemaId: string;
  eyebrow?: string;
  title?: string;
}

/**
 * Questions and answers, with the matching FAQPage schema.
 *
 * Rendered as native <details> rather than a JavaScript accordion for a
 * deliberate reason: the answers stay in the HTML whether or not they're open,
 * so search engines and AI answer engines read all of them, and the thing still
 * works with JavaScript off.
 */
export default function Faq({
  items,
  schemaId,
  eyebrow = "Questions",
  title = "The things people ask",
}: FaqProps) {
  return (
    <section className="jm-section">
      <script
        type="application/ld+json"
        // Authored content, not user input — no injection surface.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema(items, schemaId)),
        }}
      />

      <div className="jm-inner">
        <Reveal>
          <span className="jm-eyebrow">{eyebrow}</span>
          <h2 className="jm-section-title">{title}</h2>
          <hr className="jm-section-rule" />
        </Reveal>

        <Reveal delay={80} className={styles.list}>
          {items.map((item) => (
            <details key={item.question} className={styles.item}>
              <summary className={styles.question}>
                <span>{item.question}</span>
                <span className={styles.chevron} aria-hidden="true" />
              </summary>
              <p className={styles.answer}>{item.answer}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
