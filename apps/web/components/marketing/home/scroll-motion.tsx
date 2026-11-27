"use client";

import { useEffect } from "react";
import styles from "./home.module.css";

/**
 * What rises into place as it scrolls into view: section headings, card grids
 * and product pictures. Children of a group arrive one after another. Nothing
 * rotates or replays: one calm rise per element, once.
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

/**
 * GetOn's opening scroll choreography: the full-bleed sticky hero video clips
 * inward into a floating rounded cinema card (`inset(...) round 32px`), gently
 * eases video zoom from 1.05 -> 1.0, and subtly scales the copy over the
 * 360px sticky runway before releasing into the rest of the page.
 */
function attachHeroSettle(home: HTMLElement) {
  const hero = home.querySelector<HTMLElement>("[data-home-hero]");
  if (!hero) return () => undefined;
  let frame = 0;
  const paint = () => {
    frame = 0;
    const rect = hero.getBoundingClientRect();
    const runway = Math.max(240, hero.offsetHeight - window.innerHeight);
    const raw = Math.min(1, Math.max(0, -rect.top / runway));
    // Smooth ease-out curve for the clip-path card settle
    const eased = 1 - Math.pow(1 - raw, 1.65);
    hero.style.setProperty("--settle", eased.toFixed(4));
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  paint();
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if (frame) cancelAnimationFrame(frame);
    hero.style.removeProperty("--settle");
  };
}

/**
 * GetOn's "Built for lives that cross borders" parallax: alternating collage
 * photos translate vertically in opposite directions as the section crosses
 * the viewport. Driven by rAF so it works identically in Chrome, Safari, and Firefox.
 */
function attachCollageParallax(home: HTMLElement) {
  const stage = home.querySelector<HTMLElement>("[data-collage-stage]");
  if (!stage) return () => undefined;
  const items = [...stage.querySelectorAll<HTMLElement>("[data-collage-speed]")];
  if (!items.length) return () => undefined;
  let frame = 0;
  const desktop = matchMedia("(min-width: 768px)");

  const paint = () => {
    frame = 0;
    if (!desktop.matches) {
      for (const item of items) item.style.removeProperty("--py");
      return;
    }
    const rect = stage.getBoundingClientRect();
    const vh = window.innerHeight || 900;
    // Normalized -1 (below viewport) to +1 (above viewport), 0 when centered
    const progress = Math.max(-1.2, Math.min(1.2, (vh * 0.5 - (rect.top + rect.height * 0.5)) / (vh * 0.85)));
    for (const item of items) {
      const speed = Number(item.dataset.collageSpeed || 0);
      item.style.setProperty("--py", `${(progress * speed).toFixed(1)}px`);
    }
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  paint();
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if (frame) cancelAnimationFrame(frame);
    for (const item of items) item.style.removeProperty("--py");
  };
}

/** The footer trails the scroll as it comes up, so the rounded main page lifts off it. */
function attachFooterReveal(home: HTMLElement) {
  const footer = home.nextElementSibling instanceof HTMLElement && home.dataset.curtain !== undefined ? home.nextElementSibling : null;
  if (!footer) return () => undefined;
  let frame = 0;
  const paint = () => {
    frame = 0;
    const top = footer.getBoundingClientRect().top;
    const seen = Math.min(1, Math.max(0, (window.innerHeight - top) / Math.min(window.innerHeight, footer.offsetHeight || 1)));
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
 * A pinned rail on phones: the section holds still while its cards slide
 * sideways as you scroll down, then lets go.
 */
function attachPinnedRails(home: HTMLElement) {
  const stops: Array<() => void> = [];
  home.querySelectorAll<HTMLElement>("[data-pin-rail]").forEach((section) => {
    const track = section.querySelector<HTMLElement>("[data-pin-track]");
    if (!track) return;
    let distance = 0;
    let frame = 0;
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
      const stops = [
        attachReveals(home),
        attachHeroSettle(home),
        attachCollageParallax(home),
        attachFooterReveal(home),
      ];
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
