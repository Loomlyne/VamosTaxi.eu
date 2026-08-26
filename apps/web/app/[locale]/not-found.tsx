import "./error-pages.css";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Button, Icon } from "@/components/core";
import { routing } from "@/i18n/routing";

// D-20: the wrong-URL surface a visitor reaches under a resolvable language segment
// (`/de/definitely-not-a-page`) — Next's own `not-found.tsx` convention, thrown from
// `notFound()` anywhere below `app/[locale]/layout.tsx` and rendered inside that same
// layout, so `SiteHeader`/`SiteFooter` compose around it by construction (the layout
// itself, not this file, is what makes that structural — see layout.tsx's own comment).
// Next serves this with a 404 status per the framework's documented convention, with
// no extra wiring.
//
// `getLocale()` rather than a `params` prop: the framework's own `not-found.js`
// reference (`next/dist/docs`) documents this file as accepting no props, so the
// active locale is read from the request config `app/[locale]/layout.tsx` already
// resolved and called `setRequestLocale` for — the same seam every Server Component
// in this tree reads from, not a second, undocumented params contract.
//
// This same file also serves D-20's other half — a URL whose locale segment cannot
// resolve at all (`/zz/whatever`) — with NO separate root-level file needed. Verified
// directly, not assumed: `getLocale()` gracefully resolves to `routing.defaultLocale`
// ("en") when next-intl's own request config cannot match the segment, so this
// boundary already renders the English fallback D-20 asks for. A plain
// `apps/web/app/not-found.tsx` was tried first and rejected — see
// `apps/web/app/[locale]/[...rest]/page.tsx`'s own comment for the full reasoning and
// the reproduced build failure.
//
// Copy is 01-UI-SPEC.md's own Copywriting Contract draft, marked there as "drafted here
// as a default, not yet owner-confirmed" — carried verbatim into `apps/web/i18n/messages/
// *.json` under the `errors` namespace rather than rewritten here, so the owner can
// revise the dictionary entry later without touching this component.
//
// SSR note (verified against a real running server, both `next start` and
// `opennextjs-cloudflare preview`): Next.js 15.5.23 renders ANY route-level
// `notFound()` reached via an actual request-time throw (as opposed to a build-time-
// known-empty static route) through a two-phase shell — the initial HTTP response
// carries a placeholder `<html id="__next_error__">` with the real content only in an
// inlined RSC payload script, and the fully correct DOM (this component's real markup,
// `lang`/`dir`, the shell) appears once client JS hydrates. Confirmed directly with a
// headless Playwright check: status 404, correct `lang`, `SiteHeader`/`SiteFooter`
// both present, correct localized heading — for `/de`, `/ar` and the `/zz` (invalid
// locale) case. This means a plain `curl` (no JS) cannot see the resolved HTML in the
// raw response; `apps/web/tests/visual/error-pages.spec.ts` (a real browser via
// Playwright) is the correct verification tool for this file, not a raw curl grep.

export default async function NotFound() {
  const locale = await getLocale();

  // Pitfall 2 (01-RESEARCH.md): keeps this boundary's own rendering static/edge-cacheable
  // rather than forcing it dynamic, the same reasoning `app/[locale]/layout.tsx` already
  // documents for its own `setRequestLocale` call.
  setRequestLocale(locale);

  const t = await getTranslations("errors");
  const home = locale === routing.defaultLocale ? "/" : `/${locale}`;
  const contact = locale === routing.defaultLocale ? "/contact" : `/${locale}/contact`;

  return (
    <main data-error-page>
      <div data-error-block>
        <Icon name="circle-alert" size={40} color="var(--vt-text-secondary)" />
        <h1 data-error-title>{t("notFoundTitle")}</h1>
        <p data-error-body>{t("notFoundBody")}</p>
        <div data-error-actions>
          <Button href={home} variant="primary">
            {t("notFoundHomeCta")}
          </Button>
          <Button href={contact} variant="secondary">
            {t("notFoundContactCta")}
          </Button>
        </div>
      </div>
    </main>
  );
}
