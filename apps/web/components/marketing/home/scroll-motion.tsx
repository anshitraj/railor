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
  times?: number[];
};

const networkAnchor = "[data-home-reveal]:has([data-home-provider-motion])";
/**
 * Phone choreography, all tied to scroll position so it runs forwards and
 * backwards with the thumb: headings arrive from the left, their explanations
 * from the right, feature rows alternate sides, card rails slide in sideways,
 * and the hero phone leans back as you scroll past it.
 */
const mobileScenes: Scene[] = [
  {
    select: `.${styles.heroIntro}`,
    anchor: `.${styles.hero}`,
    frames: { transform: ["translateY(0)", "translateY(-62px)"], opacity: [1, .9] },
    offset: ["start start", "start -.46"],
  },
  {
    select: `.${styles.heroGlow}`,
    anchor: `.${styles.hero}`,
    frames: { transform: ["translateY(-12px) scale(.9)", "translateY(116px) scale(1.23)"] },
    offset: ["start start", "end .28"],
  },
  {
    select: `.${styles.heroCalc}`,
    anchor: `.${styles.hero}`,
    frames: { transform: ["perspective(1300px) rotateX(0deg) scale(1)", "perspective(1300px) rotateX(16deg) scale(.9)"], opacity: [1, .55] },
    offset: ["start -.42", "end .02"],
  },
  {
    select: `.${styles.head} > :first-child, .${styles.dev} > :first-child, .${styles.trust} > :first-child, .${styles.faq} > :first-child`,
    frames: { transform: ["translateX(-48px)", "translateX(0)"], opacity: [.3, 1] },
    offset: ["start .98", "start .5"],
  },
  {
    select: `.${styles.head} > .${styles.lead}, .${styles.heroExtras}, .${styles.logos}, .${styles.routeChips}, .${styles.faqList}, .${styles.stepControls}, .${styles.profileControls}`,
    frames: { transform: ["translateX(40px)", "translateX(0)"], opacity: [.35, 1] },
    offset: ["start .96", "start .52"],
  },
  {
    select: "article:not([data-flip]) > [data-why-copy], article[data-flip] > [data-why-picture]",
    frames: { transform: ["translateX(-56px) rotate(-2deg)", "translateX(0) rotate(0)"], opacity: [.25, 1] },
    offset: ["start 1", "start .5"],
  },
  {
    select: "article:not([data-flip]) > [data-why-picture], article[data-flip] > [data-why-copy]",
    frames: { transform: ["translateX(64px) rotate(4deg) scale(.94)", "translateX(0) rotate(0) scale(1)"], opacity: [.25, 1] },
    offset: ["start 1", "start .48"],
  },
  {
    select: "[data-rail]",
    frames: { transform: ["translateX(88px)", "translateX(0)"], opacity: [.4, 1] },
    offset: ["start 1", "start .55"],
  },
  {
    select: `.${styles.steps}, .${styles.audiences}, .${styles.devCode}, [data-home-reveal]`,
    frames: { transform: ["translateY(38px) scale(.97)", "translateY(0) scale(1)"] },
    offset: ["start 1", "start .52"],
  },
  {
    select: `.${styles.final}`,
    frames: { transform: ["perspective(900px) rotateX(22deg) scale(.88)", "perspective(900px) rotateX(0deg) scale(1)"], opacity: [.4, 1] },
    offset: ["start 1", "start .45"],
  },
  {
    select: "[data-home-provider-motion]:nth-child(odd)",
    anchor: networkAnchor,
    frames: { transform: ["translate(-34px, 23px) rotate(-8deg) scale(.88)", "translate(0) rotate(0) scale(1)"], opacity: [.48, 1] },
    offset: ["start .93", "start .52"],
  },
  {
    select: "[data-home-provider-motion]:nth-child(even)",
    anchor: networkAnchor,
    frames: { transform: ["translate(36px, 36px) rotate(8deg) scale(.88)", "translate(0) rotate(0) scale(1)"], opacity: [.48, 1] },
    offset: ["start .87", "start .47"],
  },
  {
    select: "[data-home-result-motion]",
    anchor: networkAnchor,
    frames: { transform: ["translateY(30px) scale(.92)", "translateY(0) scale(1)"], opacity: [.36, 1] },
    offset: ["start .75", "start .32"],
  },
  {
    select: `.${styles.mapFrame}`,
    anchor: `.${styles.mapViewport}`,
    frames: { transform: ["translateY(46px) scale(1.12)", "translateY(0) scale(1)"], opacity: [.64, 1] },
    offset: ["start 1", "start .29"],
  },
];

/**
 * A pinned rail: the section holds still while its cards slide sideways as
 * you scroll down, then lets go. The section is made just tall enough for the
 * cards to travel their own width.
 */
function attachPinnedRails(home: HTMLElement) {
  const stops: Array<() => void> = [];
  home.querySelectorAll<HTMLElement>("[data-pin-rail]").forEach((section) => {
    const track = section.querySelector<HTMLElement>("[data-pin-track]");
    if (!track) return;
    let distance = 0;
    let frame = 0;
    // Plain scroll maths (not a scroll timeline), so it behaves the same in every phone browser.
    const paint = () => {
      frame = 0;
      const travel = section.offsetHeight - window.innerHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel)) : 0;
      track.style.transform = `translate3d(${(-progress * distance).toFixed(1)}px, 0, 0)`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const detach = () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      track.style.transform = "";
    };
    const layout = () => {
      detach();
      section.style.removeProperty("--rail-travel");
      delete section.dataset.pinned;
      distance = Math.ceil(track.scrollWidth - track.clientWidth);
      if (distance < 40) return;
      section.dataset.pinned = "";
      // One pixel of scroll moves the cards about 1.4 pixels: brisk, never a chore.
      // CSS adds this to the large viewport height, so a phone's sliding toolbar can't change it.
      section.style.setProperty("--rail-travel", `${Math.ceil(distance / 1.4)}px`);
      window.addEventListener("scroll", onScroll, { passive: true });
      paint();
    };
    layout();
    const resize = new ResizeObserver(() => layout());
    resize.observe(track);
    stops.push(() => {
      resize.disconnect();
      detach();
      section.style.removeProperty("--rail-travel");
      delete section.dataset.pinned;
    });
  });
  return () => stops.forEach((stop) => stop());
}

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
          const animation = animate(element, scene.frames, { autoplay: false, ease: "linear", times: scene.times });
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
        const scenes = attachMobileScenes(home);
        const rails = attachPinnedRails(home);
        detach = () => {
          scenes();
          rails();
        };
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
