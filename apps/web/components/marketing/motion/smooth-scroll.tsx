"use client";

import { useEffect } from "react";

/** Exponential decay speed (higher = snappier, lower = silkier). Frame-rate independent. */
const DAMPING = 9.2;

/** True when the wheel should scroll something inside the page (a menu, a table) rather than the page itself. */
function innerScroller(start: EventTarget | null, deltaY: number): boolean {
  for (let node = start instanceof Element ? start : null; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (node instanceof HTMLElement && node.dataset.smoothIgnore !== undefined) return true;
    const { overflowY } = getComputedStyle(node);
    if (!/(auto|scroll|overlay)/.test(overflowY) || node.scrollHeight <= node.clientHeight + 1) continue;
    if ((deltaY < 0 && node.scrollTop > 0) || (deltaY > 0 && Math.ceil(node.scrollTop + node.clientHeight) < node.scrollHeight)) return true;
  }
  return false;
}

/**
 * Lenis-style damped wheel scrolling for desktop: frame-rate independent
 * exponential interpolation so 60Hz, 120Hz and 144Hz screens glide identically.
 * Touch keeps native inertia; reduced motion keeps native browser scrolling;
 * same-page `#anchor` links glide smoothly into place.
 */
export function SmoothScroll() {
  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;
    const root = document.documentElement;
    root.dataset.smoothScroll = "";

    let target = window.scrollY;
    let current = window.scrollY;
    let frame = 0;
    let lastTime = 0;
    const limit = () => Math.max(0, root.scrollHeight - window.innerHeight);
    const locked = () => getComputedStyle(document.body).overflow === "hidden" || getComputedStyle(root).overflow === "hidden";

    const tick = (now: number) => {
      const dt = lastTime ? Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000)) : 1 / 60;
      lastTime = now;
      const alpha = 1 - Math.exp(-DAMPING * dt);
      current += (target - current) * alpha;
      if (Math.abs(target - current) < 0.35) {
        current = target;
      }
      window.scrollTo(0, current);
      if (current === target) {
        frame = 0;
        lastTime = 0;
      } else {
        frame = requestAnimationFrame(tick);
      }
    };

    const glideTo = (y: number) => {
      if (!frame) {
        current = window.scrollY;
        lastTime = 0;
      }
      target = Math.max(0, Math.min(limit(), y));
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaX) > Math.abs(event.deltaY) || locked()) return;
      if (innerScroller(event.target, event.deltaY)) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 32 : event.deltaMode === 2 ? event.deltaY * window.innerHeight : event.deltaY;
      glideTo((frame ? target : window.scrollY) + delta);
    };

    const onScroll = () => {
      if (!frame) target = current = window.scrollY;
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href^='#'], a[href^='/#']");
      const rawHref = link?.getAttribute("href") ?? "";
      const hashIndex = rawHref.indexOf("#");
      if (hashIndex === -1) return;
      if (rawHref.startsWith("/#") && window.location.pathname !== "/") return;
      const id = rawHref.slice(hashIndex + 1);
      const section = id ? document.getElementById(decodeURIComponent(id)) : null;
      if (!section) return;
      event.preventDefault();
      const margin = parseFloat(getComputedStyle(section).scrollMarginTop) || 88;
      glideTo(section.getBoundingClientRect().top + window.scrollY - margin);
      history.replaceState(null, "", `#${id}`);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.smoothScroll;
    };
  }, []);
  return null;
}
