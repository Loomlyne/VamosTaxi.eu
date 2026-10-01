"use client";

import "./BrandSelect.css";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// Ported from `app/pages/BrandSelect.dc.html` — the header's language and currency
// switchers. `app/pages/SiteHeader.dc.html` composes it twice (`<dc-import
// name="BrandSelect" icon="globe">` and `icon="banknote"`), so the header cannot be
// ported without it. It is not named in 01-13-PLAN.md's own file list (deviation Rule 3,
// blocking issue — see 01-13-SUMMARY.md), and it lives under `components/shell/` rather
// than `components/forms/` because the shell is its only consumer today; a Phase 5/6
// settings page that wants the `field` size can move it then.
//
// `components/forms/Select.tsx` is NOT this control and does not replace it: that is the
// framed, labelled form field; this is the bare white data pill that sits on the charcoal
// bar between the phone number and the sign-in control.

/** One row of the listbox. `note` is the human name shown under the code — "Deutsch"
 *  under "DE", "Swiss francs" under "CHF". */
export interface BrandSelectOption {
  value: string;
  label: string;
  note?: string;
}

export type BrandSelectSize = "compact" | "field";

/** Derived from the mock's own `data-props` declaration block (D-29), not inferred from
 *  usage: `options`, `value`, `size`, `icon`, `a11yLabel`, `onSelect`. `compact` is the
 *  one prop the declaration omits but `renderVals()` reads (`showChevron: !this.props
 *  .compact`) — carried over so the chevron stays suppressible. */
export interface BrandSelectProps {
  options?: BrandSelectOption[];
  value?: string;
  size?: BrandSelectSize;
  compact?: boolean;
  icon?: IconName;
  a11yLabel?: string;
  onSelect?: (value: string) => void;
  /** Marks the whole control as carrying no translatable copy — the language switcher
   *  labels itself in its own language ("Deutsch", never "German"), and a currency mark
   *  is a code, not a word. CLAUDE.md § Localisation names `data-vt-no-i18n` for exactly
   *  this; the mock spells the same intent `data-vt-no-i18n` on the same two subtrees. */
  i18nSkip?: boolean;
}

export function BrandSelect({
  options,
  value,
  size = "compact",
  compact = false,
  icon = "globe",
  a11yLabel = "Select",
  onSelect,
  i18nSkip = false,
}: BrandSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const opts = options && options.length > 0 ? options : [];
  const selected = opts.find((o) => o.value === value) ?? opts[0];
  const field = size === "field";

  // The mock's own rule, verbatim: "In a field the full name leads and the code becomes
  // a mark; in the bar the code is the whole label, because the row has no space for a
  // word."
  const mainLabel = selected ? (field ? selected.note || selected.label : selected.label) : "";
  const markLabel = selected ? selected.label : "";
  const showNote = field && !!selected && !!selected.note;

  return (
    <div
      data-vs-root={field ? "field" : "compact"}
      ref={rootRef}
      {...(i18nSkip ? { "data-vt-no-i18n": "" } : {})}
    >
      <button
        type="button"
        data-vs-btn="1"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={a11yLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={icon} size={18} color="var(--vt-charcoal-900)" />
        <span data-vs-txt="1">
          <span data-vs-main="1">{mainLabel}</span>
          {showNote ? <span data-vs-mark="1">{markLabel}</span> : null}
        </span>
        {compact ? null : <Icon name="chevron-down" size={16} color="var(--vt-grey-500)" />}
      </button>
      {open ? (
        <div data-vs-list="1" id={listId} role="listbox" aria-label={a11yLabel}>
          {opts.map((o) => (
            <button
              key={o.value}
              type="button"
              data-vs-opt="1"
              role="option"
              aria-selected={o.value === (selected ? selected.value : undefined)}
              onClick={() => {
                setOpen(false);
                onSelect?.(o.value);
              }}
            >
              <span>
                <span data-vs-optlabel="1">{o.label}</span>
                <span data-vs-optnote="1">{o.note || ""}</span>
              </span>
              {o.value === (selected ? selected.value : undefined) ? (
                <Icon name="check" size={16} color="var(--vt-charcoal-900)" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
