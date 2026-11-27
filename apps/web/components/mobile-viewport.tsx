"use client";

import { useEffect } from "react";

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "file",
  "range",
  "color",
  "hidden",
  "reset",
  "image",
]);

/** True when the focused element opens a soft keyboard on iOS or Android. */
export function isEditableElement(node: EventTarget | null): node is HTMLElement {
  if (!node || !(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLTextAreaElement) return !node.readOnly && !node.disabled;
  if (node instanceof HTMLSelectElement) return !node.disabled;
  if (node instanceof HTMLInputElement) {
    return !node.readOnly && !node.disabled && !NON_TEXT_INPUT_TYPES.has(node.type);
  }
  return node.isContentEditable;
}

/** True when an element lives inside a fixed modal/sheet/drawer that manages its own scroll. */
function insideFixedOverlay(node: HTMLElement): boolean {
  for (let cur: HTMLElement | null = node; cur && cur !== document.body; cur = cur.parentElement) {
    const pos = getComputedStyle(cur).position;
    if (pos === "fixed") return true;
  }
  return false;
}

/**
 * Computes cross-platform mobile viewport metrics from `window.visualViewport`.
 *
 * - On Android Chrome with `interactive-widget=resizes-content`, both
 *   `window.innerHeight` and `visualViewport.height` shrink when the keyboard
 *   opens, so `kbOffset` (how much `position: fixed; bottom: 0` is buried) is 0
 *   while `keyboardOpen` is still true (compared against `baselineHeight`).
 * - On iOS Safari/Chrome, `window.innerHeight` stays tall while
 *   `visualViewport.height` shrinks, so `kbOffset` equals the exact keyboard
 *   overlap and fixed sheets lift cleanly above the keyboard without double-offsetting Android.
 */
export function computeViewportMetrics(params: {
  innerWidth: number;
  innerHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  baselineHeight: number;
  editing: boolean;
}) {
  const { innerWidth, innerHeight, visualHeight, visualOffsetTop, baselineHeight, editing } = params;
  const mobile = innerWidth < 1024;
  const effectiveVisualHeight = Math.max(200, Math.round(visualHeight));
  const shrinkFromBaseline = Math.max(innerHeight, baselineHeight) - visualHeight;
  const keyboardOpen = mobile && editing && shrinkFromBaseline > 110;
  // Exact gap between layout viewport bottom and visual viewport bottom (iOS Safari overlap; ~0 on Android resizes-content).
  const rawBottomOverlap = Math.round(innerHeight - visualHeight - visualOffsetTop);
  const kbOffset = keyboardOpen ? Math.max(0, rawBottomOverlap) : 0;
  const vvTop = Math.max(0, Math.round(visualOffsetTop));
  return {
    vvh: effectiveVisualHeight,
    vvTop,
    kbOffset,
    keyboardOpen,
  };
}

/**
 * Cross-platform iOS & Android viewport and soft-keyboard coordinator.
 *
 * Publishes CSS custom properties on `<html>`:
 *   --vvh        exact visible viewport height (px)
 *   --vv-top     visualViewport.offsetTop (px)
 *   --kb-offset  overlap between layout bottom and visual bottom when keyboard is open (px)
 *   data-keyboard-open="true" when a soft keyboard is active on mobile/tablet
 *
 * Also ensures newly focused inputs scroll smoothly into the visible safe band
 * above the keyboard and resets stranded iOS visual-viewport offset on dismiss.
 */
export function MobileViewportManager() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let baselineHeight = Math.max(window.innerHeight, vv?.height ?? window.innerHeight);
    let baselineWidth = window.innerWidth;
    let blurTimer: number | undefined;
    let scrollTimer: number | undefined;

    const ensureFocusedVisible = (target: HTMLElement) => {
      if (window.innerWidth >= 1024 || insideFixedOverlay(target)) return;
      const visualHeight = vv?.height ?? window.innerHeight;
      const rect = target.getBoundingClientRect();
      const safeTop = 88;
      const safeBottom = visualHeight - 20;
      if (rect.top < safeTop || rect.bottom > safeBottom) {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
    };

    const sync = () => {
      const innerWidth = window.innerWidth;
      const innerHeight = window.innerHeight;
      const visualHeight = vv?.height ?? innerHeight;
      const visualOffsetTop = vv?.offsetTop ?? 0;
      const editing = isEditableElement(document.activeElement);

      // Orientation change or window width resize resets baseline height.
      if (Math.abs(innerWidth - baselineWidth) > 80) {
        baselineWidth = innerWidth;
        baselineHeight = Math.max(innerHeight, visualHeight);
      } else if (!editing) {
        baselineHeight = Math.max(innerHeight, visualHeight);
      }

      const metrics = computeViewportMetrics({
        innerWidth,
        innerHeight,
        visualHeight,
        visualOffsetTop,
        baselineHeight,
        editing,
      });

      root.style.setProperty("--vvh", `${metrics.vvh}px`);
      root.style.setProperty("--vv-top", `${metrics.vvTop}px`);
      root.style.setProperty("--kb-offset", `${metrics.kbOffset}px`);

      if (metrics.keyboardOpen) {
        root.dataset.keyboardOpen = "true";
      } else {
        delete root.dataset.keyboardOpen;
      }

      if (metrics.keyboardOpen && document.activeElement instanceof HTMLElement) {
        window.clearTimeout(scrollTimer);
        const active = document.activeElement;
        scrollTimer = window.setTimeout(() => {
          if (document.activeElement === active) ensureFocusedVisible(active);
        }, 120);
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      window.clearTimeout(blurTimer);
      sync();
      const target = event.target;
      if (isEditableElement(target) && window.innerWidth < 1024) {
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => {
          if (document.activeElement === target) ensureFocusedVisible(target);
        }, 280);
      }
    };

    const onFocusOut = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        sync();
        // iOS Safari can leave visualViewport.offsetTop stranded after keyboard dismissal.
        if (!isEditableElement(document.activeElement) && vv && vv.offsetTop > 0) {
          window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" as ScrollBehavior });
        }
      }, 120);
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      window.clearTimeout(blurTimer);
      window.clearTimeout(scrollTimer);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      delete root.dataset.keyboardOpen;
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--kb-offset");
    };
  }, []);

  return null;
}
