"use client";

import { useEffect } from "react";

/** How much of the remaining distance the page covers each frame: lower is slower and silkier. */
const EASE = 0.1;

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
 * Wheel scrolling that glides, the way GetOn and other studio sites feel: the
 * wheel sets where the page is going and the page eases there. Only on a mouse
 * or trackpad; touch keeps the phone's own scrolling, and reduced-motion keeps
 * the browser's. Keyboard, scrollbar and find-in-page still scroll natively;
 * the glide picks up from wherever they leave the page. Same-page links glide
 * to their section too.
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
    const limit = () => Math.max(0, root.scrollHeight - window.innerHeight);
    const locked = () => getComputedStyle(document.body).overflow === "hidden" || getComputedStyle(root).overflow === "hidden";

    const tick = () => {
      current += (target - current) * EASE;
      if (Math.abs(target - current) < 0.4) current = target;
      window.scrollTo(0, current);
      frame = current === target ? 0 : requestAnimationFrame(tick);
    };
    const glideTo = (y: number) => {
      if (!frame) current = window.scrollY;
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
    // Anything else that moves the page (keys, scrollbar, focus) becomes the new starting point.
    const onScroll = () => {
      if (!frame) target = current = window.scrollY;
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href^='#']");
      const id = link?.getAttribute("href")?.slice(1);
      const section = id ? document.getElementById(decodeURIComponent(id)) : null;
      if (!section) return;
      event.preventDefault();
      const margin = parseFloat(getComputedStyle(section).scrollMarginTop) || 80;
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
