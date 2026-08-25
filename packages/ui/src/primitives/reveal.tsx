"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion, type Variants } from "motion/react";
import { cn } from "../cn.js";

/**
 * Railor's motion language.
 *
 * The rule: motion clarifies where a thing came from, then gets out of the way.
 * Short travel (never more than ~14px), one ease, no bounce, no scale-in on
 * text, and everything is `once: true` so scrolling back up is never a
 * performance. `useReducedMotion` collapses every variant to a plain fade so
 * the layout still lands in the same place for people who opt out.
 */
const EASE = [0.22, 1, 0.36, 1] as const;

export type RevealDirection = "up" | "down" | "left" | "right" | "none";

const OFFSET: Record<RevealDirection, { x?: number; y?: number }> = {
  up: { y: 14 },
  down: { y: -14 },
  left: { x: 14 },
  right: { x: -14 },
  none: {},
};

export function Reveal({
  children,
  direction = "up",
  delay = 0,
  duration = 0.55,
  className,
  as = "div",
  amount = 0.35,
}: {
  children: React.ReactNode;
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
  amount?: number;
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];
  const from = reduced ? {} : OFFSET[direction];

  return (
    <Component
      initial={{ opacity: 0, ...from }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration, delay, ease: EASE }}
      className={className}
    >
      {children}
    </Component>
  );
}

/**
 * Parent for a list that should arrive one item at a time. Pair with
 * `StaggerItem`; the delay lives on the parent so items stay declarative.
 */
export function Stagger({
  children,
  className,
  step = 0.06,
  delay = 0,
  amount = 0.2,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
  delay?: number;
  amount?: number;
  as?: "div" | "ul" | "section";
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];

  const variants: Variants = {
    hidden: {},
    shown: {
      transition: { staggerChildren: reduced ? 0 : step, delayChildren: delay },
    },
  };

  return (
    <Component
      variants={variants}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
      className={className}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  direction = "up",
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  direction?: RevealDirection;
  as?: "div" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const Component = motion[as];
  const from = reduced ? {} : OFFSET[direction];

  return (
    <Component
      variants={{
        hidden: { opacity: 0, ...from },
        shown: { opacity: 1, x: 0, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
      className={className}
    >
      {children}
    </Component>
  );
}

/**
 * A number that counts up when it scrolls into view. The value is real — the
 * animation only draws the eye to it — so the final frame always renders the
 * exact figure, and reduced-motion users get that figure immediately.
 */
export function CountUp({
  value,
  duration = 1.1,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
      // Guarantees the last frame is the true value, never a rounding artifact.
      onComplete: () => setShown(value),
    });
    return () => controls.stop();
  }, [inView, reduced, value, duration]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {(inView ? shown : 0).toLocaleString()}
    </span>
  );
}
