"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Icon } from "@/components/core";
import { routing } from "@/i18n/routing";
import { log } from "@/lib/logger";
import "./error-pages.css";

// D-20: the server-side-failure surface, rendered inside `app/[locale]/layout.tsx`'s
// own `SiteHeader`/`SiteFooter` composition the same way `not-found.tsx` is — Next's
// `error.js` convention creates a React error boundary *inside* the segment's layout,
// so the layout (and the `Providers`/`SiteShell` it wraps children in) keeps rendering
// around this file rather than being replaced by it. It only ever catches something
// thrown below the layout — a page, a child component — not a failure in the layout
// itself, which has no boundary above it and would fall through to Next's own default
// error UI instead (a fact worth naming here since it is the one case this file cannot
// cover).
//
// `error.js` must be a Client Component (Next's own documented constraint — this
// boundary runs in the browser so it can call `reset()`), so this reads translations
// via the client hook (`useTranslations`/`useLocale`) rather than the server helpers
// `not-found.tsx` uses; both read from the same `NextIntlClientProvider` `Providers`
// already mounts higher in the tree, so no locale is lost crossing that boundary.
//
// T-01-36 (Information Disclosure, high, mitigate): the caught `error` is a live
// object that can carry an internal file path, a query fragment or a stack trace — it
// is passed to the structured logger only, never interpolated into anything the
// response body renders. The visitor sees the fixed dictionary copy below and nothing
// else. `error.digest` (Next's own server-side correlation id for a matching Workers
// Logs line) is the one property from `error` that reaches the JSON log line; the
// message and stack travel with it for the same reason `apps/web/lib/logger.ts`
// exists at all — a trail Phase 7's booking failures need already in place, not added
// after the first incident.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("errors");

  useEffect(() => {
    // `window.location.pathname` rather than `next/navigation`'s `usePathname()`:
    // this file is a Client Component reached both by a real Next.js error boundary
    // and — for the screenshot-diff spec — by `tests/support/mock-harness.ts`'s
    // `mountPort`, which statically renders via plain `react-dom/server` with no
    // App Router context for `usePathname()` to read (confirmed directly: the real
    // hook throws outside that context). `window.location.pathname` needs no
    // provider and is only ever read inside this effect, which never runs during
    // that static server render in the first place (effects don't fire pre-hydration).
    const route = typeof window !== "undefined" ? window.location.pathname : "unknown";
    log("error", "route_error_boundary", { requestId: error.digest ?? "unknown", route, locale }, {
      message: error.message,
      stack: error.stack ?? null,
      digest: error.digest ?? null,
    });
    // Only re-run if the caught error instance itself changes — `locale` is read for
    // the log line's context field, not a re-trigger for a fresh log of the same
    // already-reported error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const home = locale === routing.defaultLocale ? "/" : `/${locale}`;

  return (
    <main data-error-page>
      <div data-error-block>
        <Icon name="triangle-alert" size={40} color="var(--vt-text-secondary)" />
        <h1 data-error-title>{t("errorTitle")}</h1>
        <p data-error-body>{t("errorBody")}</p>
        <div data-error-actions>
          <Button type="button" variant="primary" onClick={reset}>
            {t("errorRetryCta")}
          </Button>
          <Button href={home} variant="secondary">
            {t("errorHomeCta")}
          </Button>
        </div>
      </div>
    </main>
  );
}
