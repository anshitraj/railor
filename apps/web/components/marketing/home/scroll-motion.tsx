"use client";

import { useEffect } from "react";
import { animate, scroll } from "motion";
import styles from "./home.module.css";

const revealTargets = [
  styles.head, styles.step, styles.provider, styles.mapViewport, styles.routeChips,
  styles.audience, styles.devCode, styles.basis, styles.faq, styles.final, styles.logos,
].map((className) => `.${className}`).concat("[data-home-reveal]").join(",");

type ScrollOffsets = NonNullable<Parameters<typeof scroll>[1]>["offset"];
type Scene = {
  select: string;
  anchor?: string;
  frames: { transform: string[]; opacity?: number[] };
  offset: ScrollOffsets;
};

const mobileScenes: Scene[] = [
  {
    select: `.${styles.heroIntro}`,
    anchor: `.${styles.hero}`,
    frames: { transform: ["translateY(0)", "translateY(-46px)"], opacity: [1, .82] },
    offset: ["start start", "start -.46"],
  },
  {
    select: `.${styles.heroGlow}`,
    anchor: `.${styles.hero}`,
    frames: { transform: ["translateY(-12px) scale(.9)", "translateY(116px) scale(1.23)"] },
    offset: ["start start", "end .28"],
  },
  {
    select: `.${styles.head} > :first-child, .${styles.dev} > :first-child, .${styles.trust} > :first-child, .${styles.faq} > :first-child`,
    frames: { transform: ["translateY(44px)", "translateY(0)"], opacity: [.72, 1] },
    offset: ["start .98", "start .39"],
  },
  {
    select: `.${styles.head} > .${styles.lead}, .${styles.heroExtras}, .${styles.logos}, .${styles.routeChips}, .${styles.faqList}`,
    frames: { transform: ["translateY(32px)", "translateY(0)"], opacity: [.8, 1] },
    offset: ["start .92", "start .36"],
  },
  {
    select: `.${styles.heroCalc}, .${styles.provider}, .${styles.audience}, .${styles.devCode}, .${styles.basis}, .${styles.final}, [data-home-reveal]`,
    frames: { transform: ["translateY(58px) scale(.94)", "translateY(0) scale(1)"], opacity: [.68, 1] },
    offset: ["start 1", "start .37"],
  },
  {
    select: `.${styles.mapFrame}`,
    anchor: `.${styles.mapViewport}`,
    frames: { transform: ["translateY(46px) scale(1.12)", "translateY(0) scale(1)"], opacity: [.64, 1] },
    offset: ["start 1", "start .29"],
  },
  {
    select: `.${styles.finalCoins}`,
    anchor: `.${styles.final}`,
    frames: { transform: ["translateY(44px) scale(.78)", "translateY(0) scale(1)"] },
    offset: ["start .93", "start .39"],
  },
];

function attachMobileScenes(home: HTMLElement) {
  const sections = new Map<Element, { tracks: { element: HTMLElement; scene: Scene }[]; stop?: () => void }>();
  const observer = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      const section = sections.get(target)!;
      if (!isIntersecting) {
        section.stop?.();
        section.stop = undefined;
      } else if (!section.stop) {
        const stops = section.tracks.map(({ element, scene }) => {
          const anchor = scene.anchor ? element.closest<HTMLElement>(scene.anchor) ?? element : element;
          const animation = animate(element, scene.frames, { autoplay: false, ease: "linear" });
          const detach = scroll(animation, { target: anchor, offset: scene.offset });
          return () => {
            detach();
            animation.cancel();
          };
        });
        section.stop = () => stops.forEach((stop) => stop());
      }
    }
  }, { rootMargin: "320px 0px" });

  home.dataset.mobileMotion = "";
  for (const scene of mobileScenes) {
    home.querySelectorAll<HTMLElement>(scene.select).forEach((element) => {
      element.dataset.scrollScene = "";
      // Observe stable section boxes so an animated card cannot move itself out of view.
      const anchor = element.closest("section") ?? home;
      const section = sections.get(anchor) ?? { tracks: [] };
      section.tracks.push({ element, scene });
      sections.set(anchor, section);
    });
  }
  sections.forEach((_, section) => observer.observe(section));

  return () => {
    observer.disconnect();
    sections.forEach(({ tracks, stop }) => {
      stop?.();
      tracks.forEach(({ element }) => delete element.dataset.scrollScene);
    });
    delete home.dataset.mobileMotion;
  };
}

export function HomeScrollMotion() {
  useEffect(() => {
    const home = document.getElementById("main");
    if (!home || !("IntersectionObserver" in window)) return;

    const motion = matchMedia("(prefers-reduced-motion: no-preference)");
    const mobile = matchMedia("(max-width: 719px)");
    let detach: (() => void) | undefined;

    const sync = () => {
      detach?.();
      detach = undefined;
      if (!motion.matches) return;
      if (mobile.matches) {
        detach = attachMobileScenes(home);
      } else if (!CSS.supports("animation-timeline: view()")) {
        const observer = new IntersectionObserver((entries) => {
          for (const { isIntersecting, target } of entries) {
            if (!isIntersecting || !(target instanceof HTMLElement)) continue;
            target.dataset.homeEntered = "";
            observer.unobserve(target);
          }
        }, { rootMargin: "0px 0px -7% 0px" });
        home.querySelectorAll(revealTargets).forEach((element) => observer.observe(element));
        detach = () => observer.disconnect();
      }
    };

    sync();
    motion.addEventListener("change", sync);
    mobile.addEventListener("change", sync);
    return () => {
      motion.removeEventListener("change", sync);
      mobile.removeEventListener("change", sync);
      detach?.();
    };
  }, []);
  return null;
}
