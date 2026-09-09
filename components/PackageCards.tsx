"use client";

import {
  formatFromPrice,
  packagesFor,
  type ServicePackage,
} from "@/lib/packages";

import { usePackageSelection } from "./PackageContext";
import styles from "./PackageCards.module.css";

interface PackageCardsProps {
  source: "web" | "media";
  /** Element to scroll to after choosing. */
  quoteAnchorId: string;
}

export default function PackageCards({
  source,
  quoteAnchorId,
}: PackageCardsProps) {
  const { selectedId, select } = usePackageSelection();
  const packages = packagesFor(source);

  if (packages.length === 0) return null;

  function choose(pkg: ServicePackage) {
    select(pkg.id);
    const anchor = document.getElementById(quoteAnchorId);
    anchor?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  return (
    <div className={styles.grid}>
      {packages.map((pkg) => {
        const price = formatFromPrice(pkg);
        const isSelected = selectedId === pkg.id;

        return (
          <div
            key={pkg.id}
            className={`${styles.card} ${pkg.featured ? styles.featured : ""} ${
              isSelected ? styles.selected : ""
            }`}
          >
            {pkg.featured ? (
              <span className={`jm-badge jm-badge--copper ${styles.tag}`}>
                Most popular
              </span>
            ) : null}

            <h3 className={styles.name}>{pkg.name}</h3>
            <p className={styles.audience}>{pkg.audience}</p>

            {price ? (
              <p className={styles.price}>{price}</p>
            ) : (
              <p className={styles.priceOnRequest}>Price on request</p>
            )}

            <p className={styles.desc}>{pkg.description}</p>

            <ul className={styles.list}>
              {pkg.includes.map((item) => (
                <li key={item}>
                  <span className={styles.check} aria-hidden="true">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {isSelected ? (
              <span className={styles.chosen}>✓ Selected</span>
            ) : (
              <button
                type="button"
                className={pkg.featured ? "jm-btn-primary" : "jm-btn-ghost"}
                style={{ width: "100%" }}
                onClick={() => choose(pkg)}
              >
                Choose this package
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
