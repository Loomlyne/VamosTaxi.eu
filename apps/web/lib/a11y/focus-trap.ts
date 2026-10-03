/**
 * 26.2 audit U06-5 / U06-6: one Tab and Shift+Tab wrap for the modal dialogs that had none
 * (mobile menu sheet, cookie preferences). The two older copies (BookingCard, Dialog) are left
 * as they are.
 */

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Where Tab should land inside a trapped dialog, or null when the browser's own move is fine. */
export function nextTrapTarget<T>(items: readonly T[], active: T | null, shift: boolean): T | null {
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return null;
  if (active === null || !items.includes(active)) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

/** The enabled, visible-to-keyboard controls inside `root`, in DOM order. */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true" && el.getClientRects().length > 0,
  );
}

/** Call from a keydown listener while the dialog is open. Wraps Tab inside `root`. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | null): void {
  if (event.key !== "Tab" || !root) return;
  const items = focusablesIn(root);
  const active = document.activeElement as HTMLElement | null;
  const target = nextTrapTarget(items, active, event.shiftKey);
  if (target) {
    event.preventDefault();
    target.focus();
  } else if (items.length === 0) {
    // Nothing to tab to: keep focus on the dialog itself rather than the page behind.
    event.preventDefault();
  }
}
