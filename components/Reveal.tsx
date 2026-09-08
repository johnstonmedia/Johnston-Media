"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger direct children instead of revealing the block as one unit. */
  stagger?: boolean;
  className?: string;
  as?: ElementType;
  /** Delay in ms before the reveal runs once in view. */
  delay?: number;
  id?: string;
}

/**
 * IntersectionObserver-driven scroll reveal.
 * Reveals once, then stops observing — matches the original site's behaviour.
 */
export default function Reveal({
  children,
  stagger = false,
  className = "",
  as: Tag = "div",
  delay = 0,
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion: show immediately, skip the observer entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("jm-revealed");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target as HTMLElement;
          window.setTimeout(() => target.classList.add("jm-revealed"), delay);
          observer.unobserve(target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  const base = stagger ? "jm-reveal jm-stagger" : "jm-reveal";

  return (
    <Tag
      ref={ref}
      id={id}
      className={`${base}${className ? ` ${className}` : ""}`}
    >
      {children}
    </Tag>
  );
}
