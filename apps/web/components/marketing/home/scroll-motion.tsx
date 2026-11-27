"use client";

import { useEffect } from "react";
import styles from "./home.module.css";

/**
 * What rises into place as it scrolls into view: section headings, card grids
 * and product pictures. Children of a group arrive one after another. Nothing
 * rotates, slides sideways or replays: one calm rise per element, once.
 */
const REVEAL = [
  styles.head, styles.steps, styles.provider, styles.mapViewport, styles.routeChips, styles.audiences,
  styles.devCode, styles.basis, styles.faqList, styles.final, styles.logos,
].map((className) => `.${className}`).concat("[data-home-reveal]").join(",");
/** Grids whose children arrive one after another. */
const GROUPS = [styles.steps, styles.audiences, styles.faqList].map((className) => `.${className}`).concat("[data-rail]").join(",");

function attachReveals(home: HTMLElement) {
  const root = document.documentElement;
  const targets = [...home.querySelectorAll<HTMLElement>(REVEAL)];
  home.querySelectorAll<HTMLElement>(GROUPS).forEach((group) => {
    [...group.children].forEach((child, index) => {
      if (!(child instanceof HTMLElement)) return;
      child.dataset.reveal = "";
      child.style.setProperty("--reveal-i", String(Math.min(index, 6)));
      targets.push(child);
    });
  });
  const observer = new IntersectionObserver((entries) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting || !(target instanceof HTMLElement)) continue;
      target.dataset.revealed = "";
      observer.unobserve(target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  for (const target of targets) {
    // Anything already on screen when the page opens shows at once.
    if (target.getBoundingClientRect().top < window.innerHeight * 0.92) target.dataset.revealed = "";
    target.dataset.reveal ??= "";
    observer.observe(target);
  }
  root.dataset.revealReady = "";
  return () => {
    observer.disconnect();
    delete root.dataset.revealReady;
  };
}

/** The hero video settles into a rounded card as the page scrolls past it (GetOn's opening move). */
function attachHeroSettle(home: HTMLElement) {
  const hero = home.querySelector<HTMLElement>("[data-home-hero]");
  if (!hero) return () => undefined;
  let frame = 0;
  const paint = () => {
    frame = 0;
    const progress = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.55)));
    hero.style.setProperty("--settle", progress.toFixed(3));
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
  window.addEventListener("scroll", onScroll, { passive: true });
  paint();
  return () => {
    window.removeEventListener("scroll", onScroll);
    if (frame) cancelAnimationFrame(frame);
    hero.style.removeProperty("--settle");
  };
}

/** The footer trails the scroll as it comes up, so the page seems to lift off it. */
function attachFooterReveal(home: HTMLElement) {
  const footer = home.nextElementSibling instanceof HTMLElement && home.dataset.curtain !== undefined ? home.nextElementSibling : null;
  if (!footer) return () => undefined;
  let frame = 0;
  const paint = () => {
    frame = 0;
    const top = footer.getBoundingClientRect().top;
    const seen = Math.min(1, Math.max(0, (window.innerHeight - top) / Math.min(window.innerHeight, footer.offsetHeight)));
    footer.style.setProperty("--footer-lag", ((1 - seen) * Math.min(window.innerHeight * 0.4, 320)).toFixed(1));
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  paint();
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if (frame) cancelAnimationFrame(frame);
    footer.style.removeProperty("--footer-lag");
  };
}

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
      const stops = [attachReveals(home), attachHeroSettle(home), attachFooterReveal(home)];
      if (mobile.matches) stops.push(attachPinnedRails(home));
      detach = () => stops.forEach((stop) => stop());
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
