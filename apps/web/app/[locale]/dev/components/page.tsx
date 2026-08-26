import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

// The dev-only states gallery index (D-28). One entry per category
// `design-system/readme.md` §4/§6 already uses — matching
// `apps/web/components/{core,forms,navigation,feedback,transfer,data}/`. Links to
// all six from the start; the five not yet ported 404 until their batch lands
// (Plans 07-09), and Plan 14 asserts all six eventually resolve.
//
// English only, on purpose (CLAUDE.md § "The only copy that stays English on
// purpose is internal... review scaffolds"). This route is not a product surface
// and carries no keys in apps/web/i18n/messages/*.json.
// D-23's own fixed count ("33 components across 6 categories", 01-UI-SPEC.md §
// Overview) — the total below is asserted against the sum of these six rows, not
// hand-typed, so a category whose count drifts from what it actually ports shows up
// as a wrong total instead of a silently stale number.
const CATEGORIES = [
  { slug: "core", label: "Core", count: 9 },
  { slug: "forms", label: "Forms", count: 8 },
  { slug: "navigation", label: "Navigation", count: 3 },
  { slug: "feedback", label: "Feedback", count: 5 },
  { slug: "transfer", label: "Transfer", count: 4 },
  { slug: "data", label: "Data", count: 4 },
] as const;

const TOTAL_COMPONENTS = CATEGORIES.reduce((sum, cat) => sum + cat.count, 0);

// Plan 13's addition: the shell is a seventh review surface, kept OUT of
// `CATEGORIES`/`TOTAL_COMPONENTS` on purpose — `SiteHeader`/`SiteFooter` are page-level
// composites CLAUDE.md makes mandatory on every public page, not two of D-23's fixed
// 33 design-system components, and UI-SPEC's own component inventory never counts them
// among the 33. It still needs the same states gallery and the same German/Arabic pass
// every design-system category gets, so it is listed separately below rather than
// dropped or folded into the total.
const SHELL_CATEGORY = { slug: "shell", label: "Shell", count: 2 } as const;

function localeHref(locale: string, path: string): string {
  // next-intl's own `localePrefix: "as-needed"` contract (D-11/D-12): the default
  // locale is unprefixed, every other locale is prefixed. Kept local to this
  // dev-only route rather than reaching into apps/web/i18n/** (Plan 07's declared
  // scope in this same wave) for a `createNavigation` helper.
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

export default async function DevComponentsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)", maxWidth: 640 }}>
      {/* dir="ltr" on the scaffold's own English prose only — see
          CoreGallery.tsx's comment on the same fix, found during the Arabic
          manual pass. */}
      <h1 dir="ltr">Component gallery</h1>
      <p dir="ltr">
        Internal review scaffold, English only on purpose. Every ported component,
        grouped by the same six categories the design system uses. A category not
        yet ported returns a 404 until its port batch lands.
      </p>
      <p dir="ltr" data-gallery-total>
        {TOTAL_COMPONENTS} components across {CATEGORIES.length} categories.
      </p>
      <ul style={{ paddingInlineStart: "20px" }}>
        {CATEGORIES.map((cat) => (
          <li key={cat.slug} dir="ltr">
            <a href={localeHref(locale, `/dev/components/${cat.slug}`)}>
              {cat.label} ({cat.count})
            </a>
          </li>
        ))}
      </ul>
      <p dir="ltr">
        Plus one review surface that is not one of the 33: the shared header/footer
        shell, mandatory on every public page but not a design-system component count.
      </p>
      <ul style={{ paddingInlineStart: "20px" }}>
        <li dir="ltr">
          <a href={localeHref(locale, `/dev/components/${SHELL_CATEGORY.slug}`)}>
            {SHELL_CATEGORY.label} ({SHELL_CATEGORY.count})
          </a>
        </li>
      </ul>
    </main>
  );
}
