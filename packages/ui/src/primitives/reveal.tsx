"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/**
 * Decides whether an element gets a scroll-reveal at all.
 *
 * Server HTML always renders content visible — no reader, crawler or slow
 * device ever sees a blank section. After hydration, only elements that start
 * below the fold are "armed" (hidden instantly, off-screen, so nothing
 * flickers) and then revealed as they scroll in. Anything already on screen
 * simply stays put.
 */
function useScrollReveal(amount: number) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount });
  const [armed, setArmed] = useState(false);
  useLayoutEffectSafe(() => {
    const el = ref.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.9) setArmed(true);
  }, []);
  return { ref, state: armed && !inView ? "hidden" : "shown" } as const;
}

const useLayoutEffectSafe = typeof window === "undefined" ? useEffect : useLayoutEffect;

type RevealTag = "div" | "section" | "li" | "span" | "article";

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
  as?: RevealTag;
  amount?: number;
}) {
  const reduced = useReducedMotion();
  const Component = motion[as] as typeof motion.div;
  const from = reduced ? {} : OFFSET[direction];
  const { ref, state } = useScrollReveal(amount);

  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      initial={false}
      animate={state}
      variants={{
        hidden: { opacity: 0, ...from, transition: { duration: 0 } },
        shown: { opacity: 1, x: 0, y: 0, transition: { duration, delay, ease: EASE } },
      }}
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
  const Component = motion[as] as typeof motion.div;
  const { ref, state } = useScrollReveal(amount);

  const variants: Variants = {
    hidden: { transition: { duration: 0 } },
    shown: {
      transition: { staggerChildren: reduced ? 0 : step, delayChildren: delay },
    },
  };

  return (
    <Component ref={ref as React.Ref<HTMLDivElement>} variants={variants} initial={false} animate={state} className={className}>
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
  const Component = motion[as] as typeof motion.div;
  const from = reduced ? {} : OFFSET[direction];

  return (
    <Component
      variants={{
        hidden: { opacity: 0, ...from, transition: { duration: 0 } },
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
  // Server HTML and first paint carry the real figure — a count-up must never
  // show a false "0" to someone whose JavaScript is slow or disabled.
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!inView) return;
    if (reduced || value === 0) {
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
      {shown.toLocaleString("en-US")}
    </span>
  );
}
