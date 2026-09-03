// Single source of truth for support addresses (D-18). These are addresses, not
// copy — they stay as typed in every language. Render the visible number inside
// `.vt-dir-keep` so bidi does not reorder it inside an Arabic document.

/** Published business number, spaced for display. */
export const PHONE_DISPLAY = "+41 79 626 70 82";

/** `tel:` href for the same number. No spaces. */
export const PHONE_HREF = "tel:+41796267082";

/** WhatsApp deep link for the same number. No leading `+`, no spaces in the path. */
export const WHATSAPP_HREF = "https://wa.me/41796267082";

/** Confirmed public support mailbox. */
export const SUPPORT_EMAIL = "info@vamostaxi.site";

/** `mailto:` destination for the confirmed public support mailbox. */
export const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}`;
