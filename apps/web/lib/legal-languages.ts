// apps/web/lib/legal-languages.ts
//
// D-01 / D-12 / I18N-08. Per-page declared coverage — never runtime detection.
// A detector cannot tell "translated" from "coincidentally identical".

import type { Locale } from "@/i18n/routing";
import type { PublicRoute } from "@/lib/metadata";

export type LegalPageId = "terms" | "privacy" | "cookies" | "cancellation" | "imprint";

export const LEGAL_LANGUAGES: Record<LegalPageId, readonly Locale[]> = {
  terms: ["en", "de", "fr", "ar"],
  privacy: ["en", "de", "fr", "ar"],
  cookies: ["en", "de", "fr", "ar"],
  cancellation: ["en", "de", "fr", "ar"],
  // Imprint is bilingual only. The mock at app/pages/imprint.dc.html:124 claims
  // data-vt-legal="en de fr ar" while its content is a data-lang="de|en|both"
  // toggle with no French or Arabic branch. Phase 1's dictionary migration
  // nonetheless produced fr/ar values for imprint's English spans. An unreviewed
  // machine translation of a legally binding imprint — whose own text says the
  // German version is the binding one — is exactly the claim I18N-08 forbids.
  // Changing this value is an owner decision after a real translation review.
  imprint: ["en", "de"],
};

/**
 * Phase 5 public-surface inventory (D-01). `/sign-up` is listed here before
 * `PUBLIC_ROUTES` grows it in plan 05-16. `/coming-soon` maps to no requirement
 * id — flagged for the owner in plan 05-24, not silently built.
 */
export const PHASE_5_ROUTES: readonly {
  path: PublicRoute | "/sign-up";
  phase: 5 | 7 | 8 | 9;
}[] = [
  { path: "/", phase: 5 },
  { path: "/about", phase: 5 },
  { path: "/cancellation", phase: 5 },
  { path: "/contact", phase: 5 },
  { path: "/cookies", phase: 5 },
  { path: "/faq", phase: 5 },
  { path: "/imprint", phase: 5 },
  { path: "/privacy", phase: 5 },
  { path: "/reset-password", phase: 5 },
  { path: "/sign-in", phase: 5 },
  { path: "/sign-up", phase: 5 },
  { path: "/terms", phase: 5 },
  { path: "/checkout", phase: 7 },
  { path: "/confirmation", phase: 7 },
  { path: "/account", phase: 8 },
  { path: "/bookings", phase: 8 },
  { path: "/manage-booking", phase: 9 },
  { path: "/coming-soon", phase: 5 },
];
