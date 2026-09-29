"use client";

// apps/web/lib/locale-shim.ts
//
// ADR-001 point 5: "A compatibility shim keeps the mandated contract." CLAUDE.md
// mandates the `VamosLocale` contract platform-wide — `setLang`, `setCur`, `onChange`,
// `money()`, in-place relabelling, never a reload — and that contract survives this port
// unchanged; only the mechanism underneath moves from DOM-walking
// (`app/vamos-locale.js`) to language-as-route-segment + client-only currency state.
//
// The one genuinely new problem this port has that the mock never did: Next's router,
// pathname and active locale are only reachable through hooks, inside a component render
// — but the old `VamosLocale` was a plain global object, callable from anywhere
// (`VamosLocale.setLang('de')`, no component required). `LocaleShimBootstrap` below
// closes that gap the same way `apps/web/lib/lenis-provider.tsx`'s `activeLenis`
// singleton does: a small set of module-scoped "active" refs, kept current by one
// component mounted once in the client boundary (`app/[locale]/providers.tsx`), so the
// imperative `VamosLocale.*` methods have something live to call.

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "@/i18n/routing";
import {
  useCurrency,
  getCurrency,
  setCurrency,
  onCurrencyChange,
  money as formatActiveCurrency,
  type CurrencyCode,
} from "./currency-store";

export type { CurrencyCode, Locale };

const { useRouter, usePathname } = createNavigation(routing);

export interface LocaleSnapshot {
  lang: Locale;
  cur: CurrencyCode;
}

type ChangeListener = (snapshot: LocaleSnapshot) => void;

const listeners = new Set<ChangeListener>();

// Module-scoped "active" navigation refs — see the file header. `LocaleShimBootstrap`
// is the only writer; every `VamosLocale` method below is only ever a reader.
let activeRouter: ReturnType<typeof useRouter> | null = null;
let activePathname: string | null = null;
let activeLocale: Locale | null = null;

function isSupportedLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

/**
 * D-47: the language lives in the NEXT_LOCALE cookie (same one `app/vamos-locale.js`
 * writes on home). Middleware rewrites unprefixed Next pages to /{locale}/... from it,
 * so a choice is one cookie write plus a server refresh; no prefixed URL is requested
 * (those 308 back to the unprefixed address).
 */
function writeLocaleCookie(next: Locale): void {
  document.cookie =
    `NEXT_LOCALE=${next}; Path=/; Max-Age=31536000; SameSite=Lax` +
    (location.protocol === "https:" ? "; Secure" : "");
}

function snapshot(): LocaleSnapshot {
  return { lang: activeLocale ?? routing.defaultLocale, cur: getCurrency() };
}

function emit(): void {
  const snap = snapshot();
  for (const listener of listeners) {
    try {
      listener(snap);
    } catch {
      // One subscriber's error must never break the rest — mirrors
      // app/vamos-locale.js's own try/catch-per-listener in its emit().
    }
  }
}

// Currency changes (a `setCur` call from anywhere, including outside this module) also
// fire the shared `onChange` — the mock's own contract notifies on both, and call sites
// built against it expect that.
onCurrencyChange(emit);

/**
 * The mandated compatibility contract (ADR-001 point 5; CLAUDE.md's `VamosLocale`
 * section). Same names, same in-place-relabelling/never-a-reload guarantee as
 * `app/vamos-locale.js` — for call sites (component classes, non-React modules) that
 * need the imperative object rather than the hook below.
 */
export const VamosLocale = {
  lang(): Locale {
    return snapshot().lang;
  },
  cur(): CurrencyCode {
    return snapshot().cur;
  },
  /**
   * Writes the NEXT_LOCALE cookie and re-renders the current route on the server
   * (`router.refresh()`, a soft refresh: it keeps client state, and is not the browser's
   * whole-document reload). A whole-document reload would discard exactly the booking-draft state
   * `apps/web/lib/booking-draft.ts` exists to survive across this call (ADR-001's
   * acceptance test).
   *
   * T-01-02 (Tampering): `next` is typed to the fixed four-locale union, and this
   * runtime check is the backstop for a caller that bypassed the type (an `any`-typed
   * test hook, a stray non-TS call site) — the navigation target is always drawn from
   * `routing.locales`, never from whatever string a caller happened to pass.
   */
  setLang(next: Locale): void {
    if (!isSupportedLocale(next)) return;
    if (!activeRouter || activePathname == null) return;
    writeLocaleCookie(next);
    activeRouter.refresh();
  },
  setCur(next: CurrencyCode): void {
    setCurrency(next);
  },
  onChange(fn: ChangeListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  money(amount?: number | null): string {
    return formatActiveCurrency(amount);
  },
};

/**
 * React-hook form of the same contract, for components that already re-render on their
 * own rather than needing the subscribe/unsubscribe dance `VamosLocale.onChange` exists
 * for. `lang`/`cur` both come from the framework's own reactive primitives
 * (`useLocale()`, `useCurrency()`'s `useSyncExternalStore`), so a component using this
 * hook re-renders automatically on either kind of change — no manual `onChange` wiring.
 */
export function useVamosLocale(): {
  lang: Locale;
  cur: CurrencyCode;
  setLang: (next: Locale) => void;
  setCur: (next: CurrencyCode) => void;
  money: (amount?: number | null) => string;
  onChange: (fn: ChangeListener) => () => void;
} {
  const lang = useLocale() as Locale;
  const { currency, setCurrency: setCur, money } = useCurrency();
  const router = useRouter();

  function setLang(next: Locale): void {
    if (!isSupportedLocale(next)) return;
    writeLocaleCookie(next);
    router.refresh();
  }

  return { lang, cur: currency, setLang, setCur, money, onChange: VamosLocale.onChange };
}

/** Debug/test hooks live only under this flag, mirroring
 *  `apps/web/lib/lenis-provider.tsx`'s own `TEST_HOOKS_ENABLED` convention: dead-code
 *  eliminated from a production bundle (`next build` inlines `NODE_ENV`), never
 *  referenced by any product component. */
const TEST_HOOKS_ENABLED = process.env.NODE_ENV !== "production";

type VamosLocaleDebug = () => LocaleSnapshot;

declare global {
  interface Window {
    __vamosLocaleDebug?: VamosLocaleDebug;
    __vamosSetLang?: (locale: string) => void;
    __vamosSetCurrency?: (code: string) => void;
    __vamosMoney?: (amount?: number | null) => string;
  }
}

/**
 * Mounted once in the client boundary (`app/[locale]/providers.tsx`), alongside
 * `LenisProvider` — keeps the module-scoped refs `VamosLocale`'s imperative methods
 * read current every render, and emits `onChange` whenever the active locale actually
 * changes (a `<Link>` navigation or a browser back/forward, not only a
 * `VamosLocale.setLang` call, which already emits via the router transition itself).
 */
export function LocaleShimBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as Locale;

  useEffect(() => {
    activeRouter = router;
    activePathname = pathname;
    const changed = activeLocale !== null && activeLocale !== locale;
    activeLocale = locale;
    if (changed) emit();
  });

  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    window.__vamosLocaleDebug = () => snapshot();
    window.__vamosSetLang = (next: string) => VamosLocale.setLang(next as Locale);
    window.__vamosSetCurrency = (code: string) => VamosLocale.setCur(code as CurrencyCode);
    window.__vamosMoney = (amount?: number | null) => VamosLocale.money(amount);
    return () => {
      delete window.__vamosLocaleDebug;
      delete window.__vamosSetLang;
      delete window.__vamosSetCurrency;
      delete window.__vamosMoney;
    };
  }, []);

  return null;
}
