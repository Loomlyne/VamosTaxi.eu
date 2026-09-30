"use client";

import "./SiteFooter.css";
import type { MouseEvent, ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { PUBLIC_ROUTES, type PublicRoute } from "@/lib/metadata";
import { useVamosScroll } from "@/lib/lenis-provider";
import {
  PHONE_DISPLAY,
  PHONE_HREF,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
  WHATSAPP_HREF,
} from "@/lib/contact-channels";
import { Button, Icon } from "../core";

// Ported from `app/pages/SiteFooter.dc.html`. CLAUDE.md makes this mandatory on every
// public page and forbids hand-rolling a footer anywhere;
// `apps/web/app/[locale]/layout.tsx` is what makes that structural rather than
// remembered. It takes no required props — the wordmark band and the payment marks are
// on by default.
//
// D-09, the one content rule worth restating at the top of the file: the tagline is
// **"Ride with class"**, and it is set artwork — it is drawn inside
// `wordmark-reversed.svg`, never typeset as copy and never translated. The descriptive
// line printed in the guideline document is prose about the brand, not a lockup, and is
// deliberately not used anywhere in this product.

const { Link } = createNavigation(routing);

/**
 * Destinations come from the shared public-route list (`apps/web/lib/metadata.ts`,
 * D-19) rather than being written out here: the `PublicRoute` union is what stops a
 * footer link going stale when Phase 5 renames or adds one of its eighteen pages, and
 * the development-time membership check catches a route deleted from the list at all.
 */
function route(path: PublicRoute): PublicRoute {
  if (process.env.NODE_ENV !== "production" && !PUBLIC_ROUTES.includes(path)) {
    throw new Error(`SiteFooter: "${path}" is not in PUBLIC_ROUTES (apps/web/lib/metadata.ts)`);
  }
  return path;
}

const FACEBOOK = "https://www.facebook.com/VAMOSTAXISWITZERLAND";
const INSTAGRAM = "https://www.instagram.com/vamos.taxi?utm_source=qr";
const YOUTUBE = "https://www.youtube.com/@vamostaxi";
const TIKTOK = "https://www.tiktok.com/@vamos.taxi";

/** Derived from the mock's own `data-props` declaration block (D-29): `wordmark`,
 *  `showChauffeurByHour`, `showPaymentMarks`, all boolean, all defaulting to on. */
export interface SiteFooterProps {
  wordmark?: boolean;
  showChauffeurByHour?: boolean;
  showPaymentMarks?: boolean;
}

// ── the per-character link roll ──────────────────────────────────────────────────────
//
// The mock builds these cells in a `componentDidMount` DOM walk (progressive
// enhancement over plain text). Here they are rendered directly, which keeps the same
// final DOM while making the effect unnecessary: the label is already resolved by
// next-intl at render time, so there is nothing to re-read from the DOM and nothing to
// re-split when the language changes — a new language is a new render.
//
// Arabic is cursive and right-to-left: one inline-block per character breaks the joins
// and reverses the word, so RTL labels stay plain text with the plain colour hover, as
// the mock's own guard already decided.
function splitCells(label: string): ReactNode {
  const words = label.split(" ");
  let k = 0;
  return words.map((word, w) => {
    const chars = Array.from(word).map((ch) => {
      const delay = `${k * 16}ms`;
      k += 1;
      return (
        <span className="ft-c" key={`${w}-${k}`}>
          <i style={{ transitionDelay: delay }}>
            {ch}
            <b>{ch}</b>
          </i>
        </span>
      );
    });
    if (w < words.length - 1) {
      const delay = `${k * 16}ms`;
      k += 1;
      chars.push(
        <span className="ft-c" key={`${w}-space`}>
          <i style={{ transitionDelay: delay }}>{" "}</i>
        </span>,
      );
    }
    // The trailing space rides with its word, so the break opportunity sits between
    // groups rather than between two characters.
    return (
      <span className="ft-w" key={`w-${w}`}>
        {chars}
      </span>
    );
  });
}

function FooterLink({
  href,
  label,
  plain = false,
  rtl,
  onClick,
}: {
  href: string;
  label: string;
  /** Copyable strings (email, phone) are left as real text nodes — split cells
   *  serialise one character per line on selection. The mock skips `mailto:`/`tel:`
   *  for exactly this reason. */
  plain?: boolean;
  rtl: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const external = /^(mailto:|tel:|https?:)/i.test(href);
  const rolled = !plain && !rtl && !/[؀-ۿ]/.test(label);
  const inner = rolled ? (
    <span aria-hidden="true" data-i18n-skip="">
      {splitCells(label)}
    </span>
  ) : (
    label
  );
  const props = {
    "data-ft-link": "1",
    ...(rolled ? { "data-split": "1" } : {}),
    "aria-label": label,
    onClick,
  } as const;

  if (external) {
    return (
      <a href={href} {...props}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} {...props}>
      {inner}
    </Link>
  );
}

export function SiteFooter({
  wordmark = true,
  showChauffeurByHour = true,
  showPaymentMarks = true,
}: SiteFooterProps) {
  const t = useTranslations("common");
  const tFooter = useTranslations("footer");
  const locale = useLocale() as Locale;
  const rtl = locale === "ar";
  const { scrollTo } = useVamosScroll();

  const groups: { key: string; heading: string; social?: boolean; items: ReactNode }[] = [
    {
      key: "company",
      heading: t("company"),
      items: (
        <>
          <li>
            <FooterLink href={route("/about")} label={t("about")} rtl={rtl} />
          </li>
        </>
      ),
    },
    {
      key: "services",
      heading: t("services"),
      items: (
        <>
          <li>
            <FooterLink href={`${route("/")}#book`} label={t("airport-transfers")} rtl={rtl} />
          </li>
          <li>
            <FooterLink href={`${route("/")}#book`} label={t("city-to-city")} rtl={rtl} />
          </li>
        </>
      ),
    },
    {
      key: "support",
      heading: t("support"),
      items: (
        <>
          <li>
            <FooterLink
              href={route("/faq")}
              label={t("faqs")}
              rtl={rtl}
              onClick={(event) => {
                // Scroll to an #faq section on the current page if there is one,
                // otherwise let the href take the visitor to the FAQ page.
                const el = document.getElementById("faq");
                if (!el) return;
                event.preventDefault();
                scrollTo(el);
                if (history.replaceState) history.replaceState(null, "", "#faq");
              }}
            />
          </li>
          <li>
            <FooterLink
              href={route("/manage-booking")}
              label={t("manage-a-booking")}
              rtl={rtl}
            />
          </li>
          <li>
            <FooterLink href={route("/contact")} label={t("contact")} rtl={rtl} />
          </li>
        </>
      ),
    },
    {
      key: "legal",
      heading: t("legal"),
      items: (
        <>
          <li>
            <FooterLink href={route("/terms")} label={t("terms-conditions")} rtl={rtl} />
          </li>
          <li>
            <FooterLink
              href={route("/cancellation")}
              label={t("cancellation-refunds")}
              rtl={rtl}
            />
          </li>
          <li>
            <FooterLink href={route("/privacy")} label={t("privacy-policy")} rtl={rtl} />
          </li>
          <li>
            <FooterLink href={route("/cookies")} label={t("cookie-policy")} rtl={rtl} />
          </li>
          <li>
            <FooterLink href={route("/imprint")} label={t("imprint")} rtl={rtl} />
          </li>
          <li>
            {/* Opens the cookie preferences sheet (CookieBanner listens); writes nothing. */}
            <button
              type="button"
              data-ft-btnlink="1"
              onClick={(event) => {
                event.preventDefault();
                window.dispatchEvent(new Event("vamos:cookie-prefs"));
              }}
            >
              {t("cookie-preferences")}
            </button>
          </li>
        </>
      ),
    },
    {
      key: "get-in-touch",
      social: true,
      heading: tFooter("get-in-touch"),
      items: (
        <>
          <li>
            <FooterLink href={SUPPORT_EMAIL_HREF} label={SUPPORT_EMAIL} plain rtl={rtl} />
          </li>
          <li>
            <a data-ft-link="1" href={PHONE_HREF} aria-label={PHONE_DISPLAY}>
              <span className="vt-dir-keep">{PHONE_DISPLAY}</span>
            </a>
          </li>
          <li>
            <FooterLink href={WHATSAPP_HREF} label="WhatsApp" plain rtl={rtl} />
          </li>
        </>
      ),
    },
  ];

  return (
    <>
    <footer data-ft="1" data-screen-label="Footer">
      {wordmark ? (
        <div data-ft-pad="band">
          <div data-ft-band="1">
            <p data-ft-lead="1">{tFooter("booked-ahead-priced-up-front")}</p>
            <Button href={`${route("/")}#book`} iconEnd="arrow-right">
              {tFooter("book-now")}
            </Button>
          </div>
          {/* D-09: the tagline "Ride with class" is inside this artwork, not typeset —
              which is why it is the alt text and not a translated string. */}
          <img
            data-ft-wordmark="1"
            src="/brand/logo/wordmark-reversed.svg"
            alt="Vamos Taxi — Ride with class"
          />
        </div>
      ) : null}

      <div data-ft-pad="main">
        <nav data-ft-grid="1" aria-label={tFooter("nav-label")}>
          {groups.map((group) => (
            <div key={group.key}>
              <h2 data-ft-h="1">{group.heading}</h2>
              <ul data-ft-list="1">{group.items}</ul>
              {group.social ? (
                <div data-ft-socrow="1">
                  <a
                    data-ft-soc="1"
                    href={FACEBOOK}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={tFooter("vamos-taxi-on-facebook")}
                  >
                    <Icon name="facebook" size={26} color="var(--vt-ft-soc)" />
                  </a>
                  <a
                    data-ft-soc="1"
                    href={INSTAGRAM}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={tFooter("vamos-taxi-on-instagram")}
                  >
                    <Icon name="instagram" size={26} color="var(--vt-ft-soc)" />
                  </a>
                  <a
                    data-ft-soc="1"
                    href={YOUTUBE}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Vamos Taxi on YouTube"
                  >
                    <Icon name="youtube" size={26} color="var(--vt-ft-soc)" />
                  </a>
                  <a
                    data-ft-soc="1"
                    href={TIKTOK}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Vamos Taxi on TikTok"
                  >
                    <span aria-hidden="true">TikTok</span>
                  </a>
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        {showPaymentMarks ? (
          // T-01-34 (Spoofing): a payment provider mark the business has not confirmed
          // is stated in type, never drawn from memory. An approximated Visa or TWINT
          // logo is both a trademark problem and a trust problem on the one page that
          // is about paying — so these stay as words until the real marks and the
          // confirmed Stripe method list arrive.
          <div data-ft-pay="1">
            <span data-ft-paylabel="1">{t("payment")}</span>
            <span data-ft-paymark="1">{tFooter("payment-visa")}</span>
            <span data-ft-paymark="1">{tFooter("payment-mastercard")}</span>
            <span data-ft-paymark="1">{tFooter("payment-twint")}</span>
            <span data-ft-paymark="1">{tFooter("payment-apple-pay")}</span>
          </div>
        ) : null}

        <div data-ft-bottom="1">
          <p data-ft-copy="1">
            {tFooter("copyright", { year: new Date().getFullYear() })}
          </p>
          <button
            type="button"
            data-ft-quiet="1"
            onClick={() => {
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
            }}
          >
            {tFooter("back-to-top")}
            <Icon name="arrow-up" size={16} color="currentColor" />
          </button>
        </div>
      </div>
    </footer>
    </>
  );
}
