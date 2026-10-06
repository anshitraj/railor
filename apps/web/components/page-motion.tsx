"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void>; skipTransition: () => void };
};

/** Navigation-only snapshots: outgoing content never remains interactive or cached. */
export function PageMotion() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const finish = useRef<(() => void) | null>(null);

  useLayoutEffect(() => { finish.current?.(); }, [pathname, params]);
  useEffect(() => {
    const documentWithTransitions = document as TransitionDocument;
    if (!documentWithTransitions.startViewTransition) return;
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || finish.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin || /^\/(api|auth|v1)\//.test(next.pathname)) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      event.preventDefault();
      const transition = documentWithTransitions.startViewTransition!(() => new Promise<void>((resolve) => {
        const timeout = window.setTimeout(() => { transition.skipTransition(); complete(); }, 1800);
        const complete = () => { window.clearTimeout(timeout); finish.current = null; resolve(); };
        finish.current = complete;
        router.push(next.pathname + next.search + next.hash);
      }));
      // Interrupted transitions (rapid navigation, hidden tabs) are harmless.
      void transition.finished.catch(() => {});
    };
    // Run before Next's link handler; it observes defaultPrevented and leaves this navigation to us.
    document.addEventListener("click", navigate, true);
    return () => { document.removeEventListener("click", navigate, true); finish.current?.(); };
  }, [router]);
  return null;
}
