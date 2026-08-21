import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

// The catch-all `[...rest]` route D-20's localized 404 depends on structurally
// existing. Without a page matching an arbitrary subpath under a valid locale (this
// project's only routes under `[locale]` before this file were the fixed `page.tsx`
// and `dev/components/**` — no wildcard), a URL like `/de/definitely-not-a-page`
// matched NO route in the compiled route tree at all and fell through to Next's own
// generic, unlocalized `/_not-found` page — reproduced directly (curl showed
// "This page could not be found." with no German text and no shell) before this file
// existed. This file makes that URL shape "match a route" — an actual page, under the
// real `[locale]/layout.tsx`, whose only job is to call `notFound()` — so Next
// resolves it as a route-level 404 against the LOCAL `app/[locale]/not-found.tsx`
// boundary (in the segment's language, inside the shared shell) instead.
//
// This same catch-all is also what makes an UNRESOLVABLE locale segment
// (`/zz/whatever`) reach a not-found boundary at all, rather than a raw framework
// 404 with no product shell: `[locale]="zz"` still matches this dynamic segment
// structurally (Next has no way to know "zz" isn't a real locale until
// `app/[locale]/layout.tsx` runs its own `hasLocale` check), so the request reaches
// the SAME `app/[locale]/not-found.tsx` boundary, which gracefully falls back to
// English — see that file's own comment for how, and why a separate root-level
// `apps/web/app/not-found.tsx` turned out to be both unreachable (this catch-all
// already covers every possible path shape) and a hard build failure on its own:
// a plain root `not-found.tsx` compiles under Next's `_not-found` special route
// entry, whose own tree walk starts at `app/` (this project has no `app/layout.tsx`
// — the root layout is the `[locale]` segment itself, D-11/D-12) and never enters
// `[locale]/layout.tsx`, so it has no root layout to attach to and fails the build
// outright (`E394`, reproduced locally). The framework's own answer to this exact
// app shape is the experimental `global-not-found.js` convention — tried next, and
// also reverted: it builds, but is dead code once this catch-all exists (the
// invalid-locale case already resolves through `[locale]/not-found.tsx` before a
// request could ever reach it), so keeping it would be an unused experimental
// surface with no purpose.
export default async function CatchAll({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  notFound();
}
