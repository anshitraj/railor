"use client";

import NumberFlow from "@number-flow/react";
import { useEffect, useRef, useState } from "react";

/**
 * A figure that rolls up to its value when it scrolls into view. The server
 * renders the real number, so search engines and anyone without JavaScript see
 * it; with reduced motion it simply stays put.
 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return;
    setShown(0);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setShown(value); observer.disconnect(); }
    }, { threshold: 0.4 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref}>
      <span className="sr-only">{value.toLocaleString("en-US")}</span>
      <span aria-hidden><NumberFlow value={shown} locales="en-US" format={{ maximumFractionDigits: 0 }} transformTiming={{ duration: 1500, easing: "cubic-bezier(.22, 1, .36, 1)" }} /></span>
    </span>
  );
}
