"use client";

import "./SiteHeader.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { useVamosLocale, type CurrencyCode, type Locale } from "@/lib/locale-shim";
import { PHONE_DISPLAY, PHONE_HREF } from "@/lib/contact-channels";
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
// The control row is fixed and identical everywhere, in this order: logo, phone
// affordance, language switcher, currency switcher, sign-in control, primary call to
// action. `cta={false}` drops the CTA on a page that already shows the booking card;
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
}: SiteHeaderViewProps) {
  const t = useTranslations("common");
  const tHeader = useTranslations("header");

  const [menuOpen, setMenuOpen] = useState(false);
  const [floating, setFloating] = useState(false);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  const variant: SiteHeaderVariant = variantProp === "overlay" ? "overlay" : "inverse";

  // Only the overlay bar floats — the charcoal one is already sticky and solid.
  useEffect(() => {
    if (variant !== "overlay") {
      setFloating(false);
      return;
    }
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        setFloating(y > 120);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [variant]);

  useEffect(() => {
    if (!menuOpen) return;
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const away = (event: MouseEvent) => {
      if (menuRootRef.current && !menuRootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const resize = () => {
      if (window.innerWidth >= 1080) setMenuOpen(false);
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", resize);
    };
  }, [menuOpen]);

  // The mock's own rule, ported verbatim: home drops the CTA while its booking card is
  // on screen, and the floating overlay bar carries it again once you have scrolled past
  // that card, so the way to book is never off the page.
  const showCta = ((cta ?? variant !== "overlay") !== false) || floating;
  const showAccount = !hideAccount;
  const accountLabel = signInLabel || t("sign-in");
  const bookLabel = t("book-a-transfer");
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
    setMenuOpen(false);
    if ((routing.locales as readonly string[]).includes(value)) onLang?.(value as Locale);
  };
  const pickCur = (value: string) => {
    setMenuOpen(false);
    if (CURRENCY_ORDER.includes(value as CurrencyCode)) onCur?.(value as CurrencyCode);
  };

  const menuLinks = [
    { href: "/faq", label: t("faqs") },
    { href: "/contact", label: t("contact") },
  ];

  return (
    <>
      <header
        data-hd={variant}
        data-hd-float={floating ? "1" : undefined}
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
            <a data-hd-pill="1" href={PHONE_HREF} aria-label={PHONE_DISPLAY}>
              <Icon name="phone" size={16} color="var(--vt-charcoal-900)" />
              <span className="vt-dir-keep">{PHONE_DISPLAY}</span>
            </a>
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
          <div data-hd-narrow="1" data-hd-tail="1" ref={menuRootRef}>
            <a
              data-hd-round="1"
              data-hd-callbtn="1"
              href={PHONE_HREF}
              aria-label={tHeader("call-41-79-626-70-82")}
              title={tHeader("call-41-79-626-70-82")}
            >
              <Icon name="phone" size={18} color="var(--vt-charcoal-900)" />
            </a>
            <button
              type="button"
              data-hd-round="1"
              aria-label={menuLabel}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? "x" : "menu"} size={20} color="var(--vt-charcoal-900)" />
            </button>

            {menuOpen ? (
              <div data-hd-menu="1" role="menu" aria-label={menuLabel}>
                {showCta ? (
                  <Link data-hd-menucta="1" href="/#book" role="menuitem">
                    <span>{bookLabel}</span>
                    <Icon name="arrow-right" size={16} color="currentColor" />
                  </Link>
                ) : null}

                {showAccount ? (
                  <SiteHeaderAccount
                    variant={variant}
                    compact
                    signInLabel={accountLabel}
                    snapshot={accountSnapshot}
                    defaultMenuOpen={accountMenuOpen}
                  />
                ) : null}

                <div data-hd-mgroup="1">
                  <span data-hd-mlabel="1">{t("language")}</span>
                  <div data-hd-mchips="1" data-i18n-skip="">
                    {langOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        data-hd-chip="1"
                        data-on={o.value === lang ? "1" : "0"}
                        aria-pressed={o.value === lang}
                        title={o.note}
                        onClick={() => pickLang(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div data-hd-mgroup="last">
                  <span data-hd-mlabel="1">{t("currency")}</span>
                  <div data-hd-mchips="1" data-i18n-skip="">
                    {curOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        data-hd-chip="1"
                        data-on={o.value === cur ? "1" : "0"}
                        aria-pressed={o.value === cur}
                        title={o.note}
                        onClick={() => pickCur(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {showCta ? (
                  <div data-hd-mlinks="1">
                    {menuLinks.map((l) => (
                      <Link key={l.href} data-hd-menuitem="1" href={l.href} role="menuitem">
                        {l.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {floating ? <div data-hd-spacer="1" aria-hidden="true" /> : null}
    </>
  );
}
