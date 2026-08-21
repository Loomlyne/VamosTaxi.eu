"use client";

import "./StatusBadge.css";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "../core";
import type { BadgeTone, IconName } from "../core";

// design-system component bundle (reference-only per D-30), function StatusBadge
// (components/transfer/StatusBadge.jsx, `_ds_bundle.js:44782-44845`). A pure
// composition over the ported `Badge` — it derives a tone/icon and renders `Badge`,
// never restyles one (01-PATTERNS.md's own instruction for this component).
//
// The MAP object immediately above the source's `function StatusBadge`
// (`_ds_bundle.js:44785-44831`) is the authoritative source for the nine lifecycle
// values — extracted verbatim below as `STATUS_MAP`, the enum source `BookingStatus`
// is typed against.
export type BookingStatus =
  | "quote"
  | "pending"
  | "paid"
  | "confirmed"
  | "assigned"
  | "completed"
  | "cancelled"
  | "refunded"
  | "no-show";

interface StatusMeta {
  tone: BadgeTone;
  icon: IconName;
}

/** Tone + icon only — the source's MAP also carries an English `label` per status, but
 * that hardcoded literal is what I18N-01 requires to become a dictionary lookup
 * (`apps/web/i18n/messages/*.json`'s `statusBadge` namespace, all nine values in all
 * four languages); see `StatusBadge` below for where the label actually resolves.
 *
 * Law 02 fix on one entry: the source's `pending` reads `tone: 'warning'` — a Badge
 * tone `core/Badge.tsx` already dropped entirely in Plan 06 (pale-yellow-100
 * background, brown-700 text). Porting that literal would produce the class
 * `vt-badge--warning`, which no longer has any CSS rule at all — an unstyled/invisible
 * badge, not a stylistic choice. Remapped to `tone: 'accent'` (the Badge tone that uses
 * the full-strength `--vt-yellow`, not a tinted step — Law 02 only bans the pale/brown
 * steps, and CLAUDE.md names "a badge" explicitly among the accent colour's legitimate
 * uses) — a genuinely attention-carrying tone for "money owed", which is what this
 * status means. Every other entry is untouched.
 */
const STATUS_MAP: Record<BookingStatus, StatusMeta> = {
  quote: { tone: "outline", icon: "receipt" },
  pending: { tone: "accent", icon: "clock" },
  paid: { tone: "success", icon: "circle-check" },
  confirmed: { tone: "success", icon: "circle-check" },
  assigned: { tone: "info", icon: "user" },
  completed: { tone: "neutral", icon: "check" },
  cancelled: { tone: "danger", icon: "x" },
  refunded: { tone: "neutral", icon: "banknote" },
  "no-show": { tone: "danger", icon: "triangle-alert" },
};

export interface StatusBadgeProps {
  status?: BookingStatus;
  /** Overrides the dictionary label for this render only — most callers pass only
   * `status` and let the nine-language default label resolve. */
  label?: ReactNode;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, label, showIcon = true, className }: StatusBadgeProps) {
  const t = useTranslations("statusBadge");
  // T-01-29 (Tampering, this plan's threat register): the closed union already makes
  // an out-of-set value a compile-time error for a typed caller; this guards the one
  // runtime path that can still hand in a bad value (JSON from an API, before Phase 3
  // wires real queries) — an absent/unrecognised status renders no badge at all,
  // never a fallback tone standing in for "unknown."
  if (!status || !(status in STATUS_MAP)) return null;
  const meta = STATUS_MAP[status];

  return (
    <Badge tone={meta.tone} icon={showIcon ? meta.icon : undefined} className={className}>
      {label ?? t(status)}
    </Badge>
  );
}
