"use client";

import "./SiteHeader.css";
import { useEffect, useRef, useState, type AnimationEvent } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { useVamosLocale, type CurrencyCode, type Locale } from "@/lib/locale-shim";
import { Icon, Logo } from "../core";
import { BrandSelect } from "./BrandSelect";
import type { BrandSelectOption } from "./BrandSelect";
import { SiteHeaderAccount } from "./SiteHeaderAccount";
import type { SessionSnapshot } from "./SiteHeaderAccount";

// Ported from `app/pages/SiteHeader.dc.html` (the full file). CLAUDE.md makes this
// component mandatory on every public page and forbids hand-rolling a header anywhere;
// `apps/web/app/[locale]/layout.tsx` is what makes that structural rather than
// remembered.
//
// Two variants, one control row. `inverse` — the charcoal sticky bar — is the default
// and the only one any page in Phase 1 renders. `overlay` is the same control row,
// transparent, over a photographic hero, becoming a floating charcoal-glass pane once
// scrolled past its placement; the home hero that exercises it does not land until
// Phase 5, but the mock defines it and it is ported now so Phase 5 does not inherit a
// half-ported component.
//
// The control row is fixed and identical everywhere, in this order: logo,
// language switcher, currency switcher, sign-in control, primary call to
// action. Public phone is the ContactFab overlay, not a header pill.
// `cta={false}` drops the CTA on a page that already shows the booking card;
// checkout hides it because the traveller is already in the funnel.
// `hideAccount` drops the account control.
//
// Signed-in branch (avatar disc, account menu, Server-Action sign-out) shipped in
// Phase 5 plan 05-20 via SiteHeaderAccount. The notification bell did not: every
// notice in the mock is booking-attached and no booking or notification table exists
// before Phase 7 (raised in plan 05-24). The verify-email notice shipped because
// getUser() already carries that fact. The layout never reads the session, so public
// pages keep static rendering; the signed-out control is the SSR default.

const { Link } = createNavigation(routing);

/** The four locales, labelled in their own language. This is the one switcher CLAUDE.md
 *  names as legitimately opting out of translation — "Deutsch" is what a German speaker
 *  looks for, never the English word "German" — so these endonyms are literals here and
 *  the control carries `data-i18n-skip`, exactly as the mock marks the same subtree. */
const LANG_NOTE: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  ar: "العربية",
};

const CURRENCY_ORDER: CurrencyCode[] = ["CHF", "EUR", "USD", "AED"];

export type SiteHeaderVariant = "inverse" | "overlay";

/**
 * Derived from the mock's own `data-props` declaration block (D-29, and
 * 01-PATTERNS.md quotes it in full), not inferred from usage — every prop it names is
 * here: `variant`, `cta`, `signInLabel`, `hideAccount`, `lang`, `cur`, `onLang`, `onCur`.
 *
 * `onLang`/`onCur` are declared `(v:string)=>void` in the mock. They are narrowed to the
 * four-locale / four-currency unions here (T-01-02, Tampering): the switcher can only
 * ever offer a value drawn from `routing.locales` and the currency table, so a caller
 * cannot be handed — or hand back — an arbitrary navigation target.
 */
export interface SiteHeaderProps {
  variant?: SiteHeaderVariant;
  cta?: boolean;
  signInLabel?: string;
  hideAccount?: boolean;
  /** Supplying both `lang` and `cur` makes the header fully controlled — it then never
   *  touches the shared locale contract itself and simply reports a choice through
   *  `onLang`/`onCur`. Omitting them (what every real page does) wires it to
   *  `apps/web/lib/locale-shim.ts` instead. This mirrors the mock's own
   *  `this.props.lang || this.state.lang` fallback. */
  lang?: Locale;
  cur?: CurrencyCode;
  onLang?: (v: Locale) => void;
  onCur?: (v: CurrencyCode) => void;
  /** Dev gallery / tests: stub the header account snapshot (no session fetch). */
  accountSnapshot?: SessionSnapshot;
  accountMenuOpen?: boolean;
  /** Dev gallery: start with the narrow hamburger open. */
  defaultNarrowOpen?: boolean;
}

/**
 * The mandatory public header. Renders connected to the shared locale contract by
 * default; renders fully controlled when `lang` and `cur` are both supplied.
 *
 * The branch is on a *component*, not on a hook — `SiteHeaderConnected` calls
 * `useVamosLocale()` unconditionally inside itself. Which branch a call site takes is
 * fixed by that call site (a page never becomes controlled halfway through its life), so
 * this never reorders a hook.
 */
export function SiteHeader(props: SiteHeaderProps) {
  if (props.lang !== undefined && props.cur !== undefined) {
    return <SiteHeaderView {...props} lang={props.lang} cur={props.cur} />;
  }
  return <SiteHeaderConnected {...props} />;
}

/**
 * The wiring CLAUDE.md's "Language and currency are platform-wide, never per-section"
 * rule asks for: the switchers call the shared setters from `apps/web/lib/locale-shim.ts`
 * (`useVamosLocale`), which relabels the whole page in place through a next-intl router
 * transition. Nothing here reads or writes a storage key and nothing reloads the page —
 * a reload would discard exactly the booking draft ADR-001's acceptance test exists to
 * protect.
 */
function SiteHeaderConnected({ lang, cur, onLang, onCur, ...rest }: SiteHeaderProps) {
  const locale = useVamosLocale();
  return (
    <SiteHeaderView
      {...rest}
      lang={lang ?? locale.lang}
      cur={cur ?? locale.cur}
      onLang={(v) => {
        locale.setLang(v);
        onLang?.(v);
      }}
      onCur={(v) => {
        locale.setCur(v);
        onCur?.(v);
      }}
    />
  );
}

type SiteHeaderViewProps = Omit<SiteHeaderProps, "lang" | "cur"> & {
  lang: Locale;
  cur: CurrencyCode;
};

function SiteHeaderView({
  variant: variantProp = "inverse",
  cta,
  signInLabel,
  hideAccount = false,
  lang,
  cur,
  onLang,
  onCur,
  accountSnapshot,
  accountMenuOpen,
  defaultNarrowOpen = false,
}: SiteHeaderViewProps) {
  const t = useTranslations("common");
  const tHeader = useTranslations("header");

  const [menuOpen, setMenuOpen] = useState(defaultNarrowOpen);
  const [menuClosing, setMenuClosing] = useState(false);
  const [floating, setFloating] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const menuOpenRef = useRef(menuOpen);
  const menuClosingRef = useRef(false);
  menuOpenRef.current = menuOpen;
  menuClosingRef.current = menuClosing;

  const pathname = usePathname() ?? "";
  const rest = pathname.replace(/^\/(de|fr|ar)(?=\/|$)/, "");
  const isHome = rest === "" || rest === "/";
  const isCheckout = rest === "/checkout" || rest.startsWith("/checkout/");
  const variant: SiteHeaderVariant =
    isHome || variantProp === "overlay" ? "overlay" : "inverse";

  // Only the overlay bar floats — the charcoal one is already sticky and solid.
  // The booking card lives in the page body, below this header, so the observer
  // waits until `[data-bookcard]` is in the document. Floating starts once that
  // card leaves the viewport (the mock: the bar carries Book after you scroll
  // past the widget).
  useEffect(() => {
    if (variant !== "overlay") {
      setFloating(false);
      return;
    }
    let io: IntersectionObserver | null = null;
    const mo = new MutationObserver(() => bind());
    const bind = () => {
      if (io) return;
      const card = document.querySelector("[data-bookcard]");
      if (!card || typeof IntersectionObserver === "undefined") return;
      io = new IntersectionObserver(
        ([entry]) => {
          if (entry) setFloating(!entry.isIntersecting);
        },
        { threshold: 0 },
      );
      io.observe(card);
      mo.disconnect();
    };
    bind();
    if (!io) mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, [variant]);

  const finishClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    menuClosingRef.current = false;
    setMenuClosing(false);
    setMenuOpen(false);
  };
  const closeMenu = () => {
    if (!menuOpenRef.current || menuClosingRef.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      finishClose();
      return;
    }
    menuClosingRef.current = true;
    setMenuClosing(true);
    closeTimerRef.current = window.setTimeout(finishClose, 360);
  };
  const toggleMenu = () => {
    if (menuClosingRef.current) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      menuClosingRef.current = false;
      setMenuClosing(false);
      setMenuOpen(true);
      return;
    }
    if (menuOpenRef.current) closeMenu();
    else setMenuOpen(true);
  };
  const onSheetAnimEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (!menuClosingRef.current) return;
    if (event.target !== event.currentTarget) return;
    finishClose();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const away = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const resize = () => {
      if (window.innerWidth >= 1080) finishClose();
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", resize);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen || menuClosing) return;
    sheetCloseRef.current?.focus({ preventScroll: true });
  }, [menuOpen, menuClosing]);

  const pathRef = useRef(pathname);
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    finishClose();
  }, [pathname]);

  // The mock's own rule, ported verbatim: home drops the CTA while its booking card is
  // on screen, and the floating overlay bar carries it again once you have scrolled past
  // that card, so the way to book is never off the page.
  const showCta =
    !isCheckout &&
    (((cta ?? (isHome ? false : variant !== "overlay")) !== false) || floating);
  const showAccount = !hideAccount;
  const accountLabel = signInLabel || t("sign-in");
  const bookLabel = t("book-a-transfer");
  const menuExpanded = menuOpen && !menuClosing;
  const menuLabel = menuOpen ? t("close") : t("menu");

  const langOptions: BrandSelectOption[] = routing.locales.map((value) => ({
    value,
    label: value.toUpperCase(),
    note: LANG_NOTE[value],
  }));

  const curNote: Record<CurrencyCode, string> = {
    CHF: t("swiss-francs"),
    EUR: t("euro"),
    USD: tHeader("us-dollars"),
    AED: tHeader("uae-dirham"),
  };
  const curOptions: BrandSelectOption[] = CURRENCY_ORDER.map((value) => ({
    value,
    label: value,
    note: curNote[value],
  }));

  const pickLang = (value: string) => {
    if ((routing.locales as readonly string[]).includes(value)) onLang?.(value as Locale);
  };
  const pickCur = (value: string) => {
    if (CURRENCY_ORDER.includes(value as CurrencyCode)) onCur?.(value as CurrencyCode);
  };

  const serviceLinks = [
    { href: "/?service=airport#book", label: t("airport-transfers") },
    { href: "/?service=city#book", label: t("city-to-city") },
  ];

  return (
    <>
      <header
        ref={headerRef}
        data-hd={variant}
        data-hd-float={floating ? "1" : undefined}
        data-hd-open={menuOpen ? "1" : undefined}
        data-screen-label="Header"
      >
        <div data-hd-row="1">
          <Link href="/" data-hd-logo="1" aria-label={tHeader("vamos-taxi-home")}>
            <span data-hd-wide="1">
              <Logo variant="reversed" form="wordmark" height={24} />
            </span>
            <span data-hd-narrow="1">
              <Logo variant="reversed" form="mark" height={30} />
            </span>
          </Link>

          {/* ── the wide control row ─────────────────────────────────────────── */}
          <div data-hd-wide="1" data-hd-tail="1">
            <BrandSelect
              value={lang}
              options={langOptions}
              onSelect={pickLang}
              icon="globe"
              a11yLabel={t("language")}
              i18nSkip
            />
            <BrandSelect
              value={cur}
              options={curOptions}
              onSelect={pickCur}
              icon="banknote"
              a11yLabel={t("currency")}
              i18nSkip
            />
            {showAccount ? (
              <SiteHeaderAccount
                variant={variant}
                signInLabel={accountLabel}
                snapshot={accountSnapshot}
                defaultMenuOpen={accountMenuOpen}
              />
            ) : null}
            {showCta ? (
              <Link data-hd-cta="1" href="/#book">
                <span>{bookLabel}</span>
                <Icon name="arrow-right" size={15} color="currentColor" />
              </Link>
            ) : null}
          </div>

          {/* ── the narrow control row ───────────────────────────────────────── */}
          <div data-hd-narrow="1" data-hd-tail="1">
            <button
              type="button"
              data-hd-menu-btn="1"
              aria-label={menuLabel}
              aria-expanded={menuExpanded}
              aria-haspopup="dialog"
              aria-controls="vt-hd-sheet"
              onClick={toggleMenu}
            >
              <Icon name={menuOpen ? "x" : "menu"} size={20} color="var(--vt-charcoal-900)" />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <>
            <div
              data-hd-scrim="1"
              data-hd-closing={menuClosing ? "1" : undefined}
              aria-hidden="true"
              onClick={closeMenu}
            />
            <div
              data-hd-sheet="1"
              id="vt-hd-sheet"
              data-hd-closing={menuClosing ? "1" : undefined}
              role="dialog"
              aria-modal="true"
              aria-label={t("menu")}
              onAnimationEnd={onSheetAnimEnd}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) closeMenu();
              }}
            >
              <div data-hd-sheet-head="1">
                <button
                  ref={sheetCloseRef}
                  type="button"
                  data-hd-menu-btn="1"
                  data-hd-sheet-close="1"
                  aria-label={t("close")}
                  onClick={closeMenu}
                >
                  <Icon name="x" size={20} color="var(--vt-charcoal-900)" />
                </button>
                {showCta ? (
                  <Link data-hd-cta="1" href="/#book">
                    <span>{bookLabel}</span>
                    <Icon name="arrow-right" size={16} color="currentColor" />
                  </Link>
                ) : null}
                {showAccount ? (
                  <SiteHeaderAccount
                    variant={variant}
                    placement="sheet"
                    signInLabel={accountLabel}
                    snapshot={accountSnapshot}
                  />
                ) : null}
                <div data-hd-locale="1">
                  <BrandSelect
                    value={lang}
                    options={langOptions}
                    onSelect={pickLang}
                    icon="globe"
                    a11yLabel={t("language")}
                    i18nSkip
                  />
                  <span data-hd-cur="1" data-vt-no-i18n="1">
                    <BrandSelect
                      value={cur}
                      options={curOptions}
                      onSelect={pickCur}
                      icon="banknote"
                      a11yLabel={t("currency")}
                      i18nSkip
                    />
                  </span>
                </div>
              </div>
              <div data-hd-sheet-body="1">
                <div data-hd-sec="1">
                  <span data-hd-kicker="1">{t("services")}</span>
                  <div data-hd-nav="1">
                    {serviceLinks.map((l) => (
                      <Link key={l.href} data-hd-menuitem="1" href={l.href}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>
                <div data-hd-sec="1">
                  <span data-hd-kicker="1">{t("help")}</span>
                  <div data-hd-nav="1">
                    <Link data-hd-menuitem="1" href="/#faq">
                      <Icon name="info" size={18} color="currentColor" />
                      <span>{t("faqs")}</span>
                    </Link>
                    <Link data-hd-menuitem="1" href="/contact">
                      <Icon name="map-pin" size={18} color="currentColor" />
                      <span>{t("contact")}</span>
                    </Link>
                    <a data-hd-menuitem="1" href="mailto:info@vamostaxi.site" data-vt-no-i18n="1">
                      <Icon name="mail" size={18} color="currentColor" />
                      <span>info@vamostaxi.site</span>
                    </a>
                    <a data-hd-menuitem="1" href="https://wa.me/41796267082" rel="noreferrer noopener">
                      <Icon name="message-circle" size={18} color="currentColor" />
                      <span>{t("whatsapp")}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </header>
      {floating ? <div data-hd-spacer="1" aria-hidden="true" /> : null}
    </>
  );
}
