"use client";

import { useEffect } from "react";
import styles from "./home.module.css";

const revealTargets = [
  styles.head, styles.step, styles.provider, styles.mapViewport, styles.routeChips,
  styles.audience, styles.devCode, styles.basis, styles.faq, styles.final, styles.logos,
].map((className) => `.${className}`).concat("[data-home-reveal]").join(",");

/** Older browsers get the same scene entrance without polling scroll position. */
export function HomeScrollMotion() {
  useEffect(() => {
    if (CSS.supports("animation-timeline: view()") || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const home = document.getElementById("main");
    if (!home) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        entry.target.dataset.homeEntered = "";
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -7% 0px" });
    home.querySelectorAll(revealTargets).forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return null;
}
