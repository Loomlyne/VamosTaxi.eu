// apps/web/lib/auth/confirm-link.ts
//
// F12. Builds the link a person gets by e-mail: the site's own confirm page, never Supabase's
// /auth/v1/verify and never the callback. Opening it (GET) uses nothing up; the button POSTs.
// `next` / `nextb` are carried as the callback validates them today (lib/auth/redirect-target.ts).

import { isDashboardHost, trustedSiteOrigin } from "../security/origin";
import { sealAddress } from "./sealed-address";

export const PUBLIC_CONFIRM_PATH = "/sign-in/confirm";
export const DASHBOARD_CONFIRM_PATH = "/login/confirm";

const SITE = "https://vamostaxi.site";

/** Confirm page path for a host: the staff console has its own address. */
export function confirmPathFor(host: string | null): string {
  return isDashboardHost(host) ? DASHBOARD_CONFIRM_PATH : PUBLIC_CONFIRM_PATH;
}

/** Where a hook mail's link lands and which return target it carries, from the allow-listed redirect_to. */
export function siteFromRedirect(redirectTo: string): { origin: string; next: string | null; nextb: string | null } {
  try {
    const url = new URL(redirectTo);
    const origin = trustedSiteOrigin(url.host);
    if (!origin) return { origin: SITE, next: null, nextb: null };
    return { origin, next: url.searchParams.get("next"), nextb: url.searchParams.get("nextb") };
  } catch {
    return { origin: SITE, next: null, nextb: null };
  }
}

/** The mailed confirm URL, or null when the address cannot be sealed (caller fails closed). */
export async function buildConfirmLink(args: {
  origin: string;
  tokenHash: string;
  type: string;
  email: string;
  secret: string | undefined;
  next?: string | null;
  nextb?: string | null;
}): Promise<string | null> {
  const sealed = await sealAddress(args.email, args.tokenHash, args.secret);
  if (!sealed) return null;
  const url = new URL(confirmPathFor(new URL(args.origin).host), args.origin);
  url.searchParams.set("token_hash", args.tokenHash);
  url.searchParams.set("type", args.type);
  if (args.nextb) url.searchParams.set("nextb", args.nextb);
  else if (args.next) url.searchParams.set("next", args.next);
  url.searchParams.set("e", sealed);
  return url.toString();
}
