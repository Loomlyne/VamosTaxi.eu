/**
 * Phase 28 plan 28-05 (META-09, D-09): the two Meta cookie values saved on the unpaid booking at the
 * Pay press. Pure helpers; the database write is `public.checkout_set_meta_click_ids` (28-01).
 *
 * Nothing here logs, returns or stores a value except to the caller that passes it to that function.
 */
import { readConsentSubject } from "../consent/cookie";
import { publicOriginAllowed } from "../security/origin";

/** Meta's `_fbp` format. Same pattern and caps as the database CHECK `bookings_meta_fbp_format`. */
export const META_FBP_RE =
  /^fb\.[0-9]\.[0-9]{10,13}\.[0-9]{1,20}(\.(AQ|Ag|Aw|BA|BQ|Bg|[A-Za-z0-9_-]{8}))?$/;
/** Meta's `_fbc` format. Same pattern and caps as the database CHECK `bookings_meta_fbc_format`. */
export const META_FBC_RE =
  /^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_-]+(\.(AQ|Ag|Aw|BA|BQ|Bg|[A-Za-z0-9_-]{8}))?$/;

const FBP_MAX = 64;
const FBC_MAX = 600;

export interface MetaClickIds {
  fbp: string | null;
  fbc: string | null;
}

/** All occurrences of a cookie name must agree (a host-only and a domain cookie can both exist). */
function cookieValue(cookieHeader: string, name: string): string | null {
  let found: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0 || trimmed.slice(0, eq) !== name) continue;
    const value = trimmed.slice(eq + 1);
    if (found !== null && found !== value) return null;
    found = value;
  }
  return found;
}

/**
 * Read `_fbp` and `_fbc` from a Cookie header. A value outside Meta's format, too long, or present
 * twice with different values reads as null.
 */
export function readMetaClickIds(cookieHeader: string | null | undefined): MetaClickIds {
  if (!cookieHeader) return { fbp: null, fbc: null };
  const fbp = cookieValue(cookieHeader, "_fbp");
  const fbc = cookieValue(cookieHeader, "_fbc");
  return {
    fbp: fbp !== null && fbp.length <= FBP_MAX && META_FBP_RE.test(fbp) ? fbp : null,
    fbc: fbc !== null && fbc.length <= FBC_MAX && META_FBC_RE.test(fbc) ? fbc : null,
  };
}

export type MetaSaveDecision =
  | { skip: true }
  | { skip: false; fbp: string | null; fbc: string | null; subject: string | null };

type SaveDecisionInput = {
  cookieHeader: string | null;
  origin: string | null;
  measurementAllowed: boolean;
  readMarketing: (subject: string) => Promise<boolean | null>;
};

/**
 * What to write at the Pay press (D-09). `skip` when the two code flags are not both on. Otherwise the
 * two values are kept only when the request comes from the public site (a dashboard Origin shares the
 * owner's own browser cookies and must never stamp a phone booking), the visitor has a consent subject,
 * and the server says marketing is on under the current policy version right now. Anything else gives
 * nulls, which clears values from an earlier press.
 *
 * Phase 29 D-01: the consent subject is returned and stored beside the ids so the settle queue (which has
 * no browser cookie) can re-check the latest consent just before sending. The subject is never logged.
 */
export async function metaClickIdsToSave(input: SaveDecisionInput): Promise<MetaSaveDecision> {
  if (!input.measurementAllowed) return { skip: true };
  const none = { skip: false, fbp: null, fbc: null, subject: null } as const;
  // A non-public Origin (the dashboard) neither saves nor clears: it must never touch a booking's values (WR-06).
  if (!publicOriginAllowed(input.origin)) return { skip: true };
  const ids = readMetaClickIds(input.cookieHeader);
  if (ids.fbp === null && ids.fbc === null) return none;
  const subject = readConsentSubject(input.cookieHeader);
  if (!subject) return none;
  let marketing: boolean | null = null;
  try {
    marketing = await input.readMarketing(subject);
  } catch {
    return none;
  }
  if (marketing !== true) return none;
  return { skip: false, fbp: ids.fbp, fbc: ids.fbc, subject };
}

/** What the route needs from the Workers execution context (`getCloudflareContext().ctx`). */
export interface BackgroundContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Decide and write the click ids for one booking without ever delaying the Pay answer (review 2, item 3).
 *
 * With a context the whole job (consent read, decision, write) goes to `ctx.waitUntil` and this returns
 * at once. Without one (a test, or a local run that has no context) the job runs inline: the ids are
 * still saved, only the speed guarantee is gone.
 *
 * The job never rejects. A failure logs the SQLSTATE only (never a value) and changes nothing else.
 * Flags off or a non-public Origin decide `skip` before any database call.
 */
export function scheduleMetaClickIdSave(args: {
  ctx: BackgroundContext | null | undefined;
  decide: SaveDecisionInput;
  write: (fbp: string | null, fbc: string | null, subject: string | null) => Promise<void>;
}): Promise<void> {
  const job = async (): Promise<void> => {
    try {
      const save = await metaClickIdsToSave(args.decide);
      if (!save.skip) await args.write(save.fbp, save.fbc, save.subject);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: unknown }).code : null;
      console.error("checkout_meta_click_ids_failed", typeof code === "string" && code.length === 5 ? code : "no-sqlstate");
    }
  };
  const waitUntil = args.ctx?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil.call(args.ctx, job());
    return Promise.resolve();
  }
  return job();
}
