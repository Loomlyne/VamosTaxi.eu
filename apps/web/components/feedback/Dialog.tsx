"use client";

// apps/web/components/feedback/Dialog.tsx
//
// Port of design-system component bundle (reference-only per D-30), function Dialog
// (components/feedback/Dialog.jsx) — the one component in this batch with real
// behaviour beyond rendering (01-PATTERNS.md flagged this: "Dialog/Toast follow same
// shape but add focus-trap/portal logic"). The compiled source is a plain
// `if (!open) return null` render with no focus management or scroll lock of its own
// at all (confirmed by reading `function Dialog` directly) — everything below is new,
// required by this plan's own must_haves ("Focus stays inside an open dialog and
// returns to the trigger when it closes", "Body scroll and the smooth-scroll instance
// are both stopped while a dialog is open and both restored when it closes").
//
// Scroll lock cooperates with, never fights, apps/web/lib/lenis-provider.tsx: that
// provider's own `isLocked()` reads the *inline* style of `document.body`/
// `document.documentElement` (a deliberate fix over a literal computed-style port —
// see lenis-provider.tsx's header comment for the deadlock it avoids). Setting
// `document.body.style.overflow = "hidden"` here is exactly the signal its
// MutationObserver already watches for — the same mechanism the mocks' own
// `lockScroll()` (app/home/home.dc.html:1549) uses, and the one
// tests/integration/lenis.spec.ts's "body lock" test already proves stops/restarts
// the Lenis instance from the provider's side. This file's own
// tests/integration/feedback-behaviour.spec.ts proves the same cycle from the
// dialog's side.

import "./Dialog.css";
import { useEffect, useId, useRef } from "react";
import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { IconButton } from "../core";

export type DialogSize = "sm" | "md" | "lg";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface DialogOwnProps {
  open?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: DialogSize;
  onClose?: () => void;
  /** Component-owned copy (I18N-01) — the source hardcodes `"Close"` as the header
   * close button's label (confirmed by reading `function Dialog` directly). No
   * default here, matching the "no default, not a better default" precedent
   * 01-09-SUMMARY.md set for Counter/DatePicker's own component-owned strings. */
  closeLabel?: string;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export type DialogProps = DialogOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof DialogOwnProps>;

export function Dialog({
  open = false,
  title,
  subtitle,
  size = "md",
  onClose,
  closeLabel,
  footer,
  children,
  className = "",
  "aria-label": ariaLabel,
  ...rest
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const titleId = useId();

  // Body scroll lock + restore-focus-on-close, both scoped to the `open` transition,
  // not to mount/unmount (this component instance can stay mounted across an
  // open/close cycle — see Dialog.tsx's callers, and 01-PATTERNS.md's own
  // "transient state (open/closed)" classification of this file).
  useEffect(() => {
    if (!open) return;

    // Focus restoration target: whatever had focus the instant this dialog opened —
    // almost always the element that triggered it.
    triggerRef.current = document.activeElement;

    // Scroll lock. Store the prior inline value (never assume it was empty — a
    // caller may already have one set for an unrelated reason) and restore exactly
    // that value on close, not a hardcoded "".
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Initial focus: the first focusable element inside the panel, falling back to
    // the panel itself (tabIndex=-1, set below) when the dialog's content has
    // nothing focusable of its own (e.g. a pure message dialog with no footer
    // actions).
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
      triggerRef.current = null;
    };
  }, [open]);

  // Focus trap + Escape-to-close. Escape is a Rule 2 addition (the source has no key
  // handling at all) — a modal that traps keyboard focus without offering a keyboard
  // way out is the exact "elevation of privilege" shape T-01-27 names, so this is
  // treated as a correctness requirement of the trap itself, not a separate feature.
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      onClose?.();
      return;
    }
    if (e.key !== "Tab") return;

    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      // Nothing focusable but the panel itself — keep focus pinned there so Tab can
      // never leave the dialog.
      e.preventDefault();
      panel.focus();
      return;
    }
    // Non-null: the `focusable.length === 0` branch above already returned, so both
    // indices are guaranteed to exist here.
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || active === panel) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="vt-dialog__scrim" onClick={onClose}>
      <div
        {...rest}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={["vt-dialog", `vt-dialog--${size}`, className].filter(Boolean).join(" ")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        data-lenis-prevent
      >
        <div className="vt-dialog__head">
          <div className="vt-dialog__titles">
            {title ? (
              <h3 id={titleId} className="vt-dialog__title">
                {title}
              </h3>
            ) : null}
            {subtitle ? <p className="vt-dialog__sub">{subtitle}</p> : null}
          </div>
          {/* No fallback English label (I18N-01) — if a caller wants the header close
              affordance, it must supply the translated closeLabel; the dialog still
              closes via Escape or a backdrop click either way (handleKeyDown above,
              the scrim's onClick), and a caller can always add its own close action
              to `footer` instead. */}
          {onClose && closeLabel ? (
            <IconButton icon="x" label={closeLabel} onClick={onClose} size="sm" />
          ) : null}
        </div>
        <div className="vt-dialog__body">{children}</div>
        {footer ? <div className="vt-dialog__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
