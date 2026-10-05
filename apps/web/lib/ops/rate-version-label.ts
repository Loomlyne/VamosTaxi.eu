// apps/web/lib/ops/rate-version-label.ts
//
// 261005 money hardening (M18). Saving a price change on a live book clones it into a new draft
// (rate-book.ts cloneRateVersionFrom). The clone's label was the source label plus " draft", and
// Publish copies the draft's label into the new settings_versions row. Every publish therefore
// added one more "draft": live rate_versions row 18 and settings_versions row 15 carry it eleven
// times. A draft now carries exactly one " draft", and Publish writes the label without it.
// Rows already written keep their labels (no data is rewritten).

/** Every trailing " draft" (any case, any spacing) removed, then trimmed. */
export function baseRateVersionLabel(label: string): string {
  return label.replace(/(?:(?:^|\s+)draft)+\s*$/i, "").trim();
}

/** The label of a draft cloned from a book labelled `label`: its base label plus one " draft". */
export function draftLabelFrom(label: string): string {
  const base = baseRateVersionLabel(label);
  return base === "" ? "draft" : `${base} draft`;
}
