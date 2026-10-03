// Contact button (261003, owner-signed direction B): the pure part of the React twin of
// app/{home,pages}/ContactButton.dc.html. The four channels, the /contact address per
// language, and the rules that decide when the floating button steps aside. No DOM access
// here beyond the element passed in, so it runs under the node unit runner.
import type { IconName } from "@/components/core";
import {
  PHONE_DISPLAY,
  PHONE_HREF,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
  WHATSAPP_HREF,
} from "@/lib/contact-channels";

/** Message keys under the `contactButton` namespace of apps/web/i18n/messages/*.json. */
export type ContactButtonKey =
  | "contact"
  | "close"
  | "talk"
  | "whatsapp"
  | "callUs"
  | "email"
  | "sendMessage"
  | "contactForm"
  | "openOptions"
  | "closeOptions";

export type ContactChannel = {
  id: "whatsapp" | "call" | "email" | "form";
  icon: IconName;
  titleKey: ContactButtonKey;
  /** A number or an address: shown as typed, left to right, never translated. */
  sub?: string;
  /** Translated second line (the form row). */
  subKey?: ContactButtonKey;
  /** Absolute href, or null for the in-app /contact link (locale-prefixed by the router). */
  href: string | null;
  newTab: boolean;
  endIcon: IconName | null;
};

/** The menu rows, in the owner's order (2026-10-03): WhatsApp, Call us, Email, Send us a message. */
export const CONTACT_CHANNELS: readonly ContactChannel[] = Object.freeze([
  { id: "whatsapp", icon: "message-circle", titleKey: "whatsapp", sub: PHONE_DISPLAY, href: WHATSAPP_HREF, newTab: true, endIcon: "external-link" },
  { id: "call", icon: "phone", titleKey: "callUs", sub: PHONE_DISPLAY, href: PHONE_HREF, newTab: false, endIcon: null },
  { id: "email", icon: "mail", titleKey: "email", sub: SUPPORT_EMAIL, href: SUPPORT_EMAIL_HREF, newTab: false, endIcon: null },
  { id: "form", icon: "file-text", titleKey: "sendMessage", subKey: "contactForm", href: null, newTab: false, endIcon: "chevron-right" },
] satisfies ContactChannel[]);

/** The contact form's address in a language: English has no prefix (same rule as the DC twin). */
export function contactPath(locale: string): string {
  return locale === "de" || locale === "fr" || locale === "ar" ? `/${locale}/contact` : "/contact";
}

/** At and below this width the float is a disc, the menu a bottom sheet, and the phone rules apply. */
export const PHONE_MAX_WIDTH = 680;
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

/**
 * Attributes on <html> that hide the floating button. Each is set by the component that owns
 * the state: the cookie card (phone only, by CSS), the home booking and travellers sheets, and a
 * docked contact button (the checkout PAY bar). Kept in one list so the CSS and the tests agree.
 */
export const HIDE_FLAGS = Object.freeze({
  cookieCardOpen: "data-vt-ck-open",
  bookingSheetOpen: "data-vt-sheet-open",
  travellersSheetOpen: "data-vt-trav-open",
  docked: "data-vt-contact-docked",
} as const);

const NOT_TEXT = Object.freeze(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"]);

type FieldLike = { nodeType?: number; tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined;

/** A field that raises the on-screen keyboard on a phone (the float steps aside while it has focus). */
export function isTextField(n: FieldLike): boolean {
  if (!n || n.nodeType !== 1) return false;
  if (n.isContentEditable) return true;
  const tag = String(n.tagName || "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  return !NOT_TEXT.includes(String(n.type || "text").toLowerCase());
}

/** The trigger's accessible name: what pressing it will do. */
export function triggerLabelKey(open: boolean): ContactButtonKey {
  return open ? "closeOptions" : "openOptions";
}
