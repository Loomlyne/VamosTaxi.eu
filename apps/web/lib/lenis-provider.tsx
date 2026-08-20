"use client";

// apps/web/lib/lenis-provider.tsx
//
// Port of assets/lenis-boot.js (76 lines, read in full — see 01-PATTERNS.md § this file
// and 01-RESEARCH.md Pitfall 7) into a client component driven by React's lifecycle
// instead of a `<script>` tag's IIFE. Uses the current `lenis` npm package (the retired
// `@studio-freight/lenis` scoped name is gone — RESEARCH's State of the Art table) rather
// than the vendored `assets/lenis.js` — same engine, package form.
//
// What ports verbatim from the analog:
//   - The house settings (lerp 0.12, wheelMultiplier 1, smoothWheel on, syncTouch off,
//     anchors on, allowNestedScroll on, autoRaf on).
//   - The sheet-lock detector + MutationObserver that drives lenis.stop()/.start() while
//     a sheet sets `body{overflow:hidden}` (CLAUDE.md's Lenis section, `lockScroll()` in
//     app/home/home.dc.html:1549).
//   - The prefers-reduced-motion gate: tear the instance down entirely rather than
//     softening it, re-evaluated on every `change` event so it also holds mid-session.
//   - `data-lenis-prevent` (and its wheel/touch/vertical/horizontal siblings) skipping the
//     smooth-scroll instance — this is a built-in Lenis behaviour (see
//     node_modules/lenis/dist/lenis.js's onVirtualScroll) that `allowNestedScroll: true`
//     and leaving the library's own event wiring untouched already provides; nothing
//     extra to port for it.
//
// What is genuinely new (Pitfall 7): a `usePathname()` effect resets scroll to the top on
// every client-side route change after the first paint, because Lenis assumes a
// scrollable document whose identity never changes and the App Router replaces page
// content without a reload.
//
// Fix carried forward from the analog, not a mechanical copy (deviation, Rule 1 — see
// 01-08-SUMMARY.md "Deviations"): `locked()` here reads the LOCKING element's *inline*
// style, not `getComputedStyle()`. The vendored version reads computed style on both
// `document.body` and `document.documentElement`. That works for `body` (the mocks only
// ever lock via `document.body.style.overflow = 'hidden'`, inline — see the
// `lockScroll()` reference above) but is circular for `documentElement`: Lenis's own
// `updateClassName()` adds a `lenis-stopped` class to the root element the moment
// `.stop()` is called, and `node_modules/lenis/dist/lenis.css` maps that class straight
// to `overflow: clip` via a stylesheet rule — which a computed-style read cannot tell
// apart from a real external lock. Once stopped, the root element's *computed* overflow
// reads "clip" forever (an artifact of being stopped, not a signal to stay stopped),
// so a literal port of the computed-style check can never call `.start()` again after
// the first lock — the exact "instance that never restarts" DoS the plan's threat
// register (T-01-23) calls out. Reading `.style.overflowY` instead of the cascade
// sidesteps the class-driven rule entirely, since Lenis never writes inline style.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Lenis from "lenis";
import type { LenisOptions, ScrollToOptions } from "lenis";
import "lenis/dist/lenis.css";

/** House settings, ported verbatim from assets/lenis-boot.js's SETTINGS object — do not
 * re-tune these while porting (CLAUDE.md, PLAT-05, 01-UI-SPEC.md's Motion Contract).
 * `respectReducedMotion` is switched off deliberately: the package's own built-in
 * reduced-motion handling softens `lerp` to 1 rather than tearing the instance down, and
 * the analog's (and this port's) contract is full teardown — see the reduced-motion
 * effect below, which owns that behaviour instead. */
const LENIS_OPTIONS: LenisOptions = {
  lerp: 0.12,
  wheelMultiplier: 1,
  smoothWheel: true,
  syncTouch: false,
  anchors: true,
  allowNestedScroll: true,
  autoRaf: true,
  respectReducedMotion: false,
};

/** The mocks' own convention for a programmatic scroll that has to clear the sticky
 * header (`app/pages/SiteFooter.dc.html`'s `goToFaq`, `app/home/home.dc.html`'s footer
 * "land" helper): -88, the 76px sticky header (CLAUDE.md's Fixed Constraints) plus a
 * small breathing gap. Every `useVamosScroll().scrollTo()` call gets this for free. */
const STICKY_HEADER_OFFSET = -88;

/** Debug/test hooks live only under this flag (never in a production bundle — Next
 * inlines `process.env.NODE_ENV` at build time, so `next build` dead-code-eliminates
 * this whole branch) and are never referenced by any product component (T-01-22's
 * mitigation, enforced structurally by Task 2's verify step). They carry a *count* and a
 * navigation trigger, never the live instance, so nothing reachable through them grants
 * control over page scrolling beyond what a normal `<Link>` click already would. */
const TEST_HOOKS_ENABLED = process.env.NODE_ENV !== "production";

type VamosLenisDebug = () => { instances: number; isStopped: boolean | null };

declare global {
  interface Window {
    __vamosLenisDebug?: VamosLenisDebug;
    __vamosTestNav?: (href: string) => void;
  }
}

// Module-scoped, not component-state: the singleton guard has to survive React
// remounting the component (Strict Mode's double-invoke in dev, Fast Refresh) without
// ever having two live instances at once — mirrors the vendored boot's own
// `if (window.__vtLenisBoot) return` guard, moved into a JS module's closure instead of
// a global flag on `window`.
let activeLenis: Lenis | null = null;
let activeInstanceCount = 0;

function isLocked(el: HTMLElement | null): boolean {
  if (!el) return false;
  const v = el.style.overflowY || el.style.overflow;
  return v === "hidden" || v === "clip";
}

function usePrefersReducedMotion(): boolean {
  // Never touches `window` during render — only inside the effect, after mount, so this
  // component (and everything that mounts it) is safe to render on the server even
  // though the provider itself is never rendered there (Prohibitions list).
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/**
 * The single smooth-scroll owner (PLAT-05, D-27 port of assets/lenis-boot.js). Mount
 * exactly once, at the client boundary (`apps/web/app/[locale]/providers.tsx`) — every
 * page underneath shares the one instance this creates.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const pathname = usePathname();
  const router = useRouter();
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const isFirstPathRef = useRef(true);

  // Boot / teardown. Reduced motion torn down entirely (not softened) per the analog's
  // own contract; re-runs whenever the preference flips mid-session.
  useEffect(() => {
    if (reducedMotion) return;

    if (activeLenis) {
      // Backstop (must_haves: "two rapid client-side navigations do not leave two
      // instances running; the second mount reuses the first") — an instance is
      // already live (e.g. a Strict Mode double-invoke raced this effect against a
      // cleanup that hasn't run yet). Reuse it instead of constructing a second one.
      setLenis(activeLenis);
      return;
    }

    const instance = new Lenis(LENIS_OPTIONS);
    activeLenis = instance;
    activeInstanceCount += 1;
    setLenis(instance);

    return () => {
      // Only tear down if this effect still owns the active instance — a stale
      // cleanup must never destroy an instance a newer mount has already taken over.
      if (activeLenis === instance) {
        instance.destroy();
        activeLenis = null;
        activeInstanceCount -= 1;
      }
      setLenis((current) => (current === instance ? null : current));
    };
  }, [reducedMotion]);

  // Sheet-lock sync — port of syncLock()/the MutationObserver in the analog, with the
  // inline-style fix documented in the file header.
  useEffect(() => {
    if (!lenis) return;

    function syncLock() {
      if (!lenis) return;
      if (isLocked(document.body) || isLocked(document.documentElement)) {
        lenis.stop();
      } else {
        lenis.start();
      }
    }

    const observer = new MutationObserver(syncLock);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    syncLock();

    return () => observer.disconnect();
  }, [lenis]);

  // Pitfall 7 — the behaviour the mocks never needed. The App Router swaps page content
  // without a reload, so scroll position has to be reset by hand on every navigation
  // after the first paint (the mocks' own page-transition boot always started fresh).
  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false;
      return;
    }
    if (lenis) {
      lenis.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, lenis]);

  // Dev-only test hooks (see TEST_HOOKS_ENABLED doc comment above).
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    window.__vamosLenisDebug = () => ({
      instances: activeInstanceCount,
      isStopped: activeLenis ? activeLenis.isStopped : null,
    });
    window.__vamosTestNav = (href: string) => {
      router.push(href);
    };
    return () => {
      delete window.__vamosLenisDebug;
      delete window.__vamosTestNav;
    };
  }, [router]);

  return <>{children}</>;
}

/**
 * Programmatic scrolling with the sticky-header offset already applied — no call site
 * hand-rolls it, and none reaches for the Lenis instance directly (Prohibitions list).
 * Falls back to native `scrollTo`/`scrollIntoView` when the instance is torn down
 * (reduced motion, or before the first effect has run), honouring the same preference.
 */
export function useVamosScroll(): {
  scrollTo: (
    target: string | HTMLElement | number,
    options?: ScrollToOptions,
  ) => void;
} {
  return useMemo(
    () => ({
      scrollTo(target: string | HTMLElement | number, options?: ScrollToOptions) {
        const offset = options?.offset ?? STICKY_HEADER_OFFSET;
        if (activeLenis) {
          activeLenis.scrollTo(target, { offset, ...options });
          return;
        }
        // No live instance (reduced motion, or not yet booted) — same fallback shape
        // as the analog's window.vtScrollTo.
        const reduced =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const el =
          typeof target === "string"
            ? document.getElementById(target.replace(/^#/, ""))
            : target instanceof HTMLElement
              ? target
              : null;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.pageYOffset + offset;
        window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      },
    }),
    [],
  );
}
