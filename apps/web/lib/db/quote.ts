// apps/web/lib/db/quote.ts
//
// The correction this file embodies: 04-RESEARCH.md §1's rate-book table reads
// as though a direct select from rate_versions were available to the quote
// identity. It is not — the public RLS grant covers four content tables and
// one view, so that select is 42501. Plan 04-06's definer RPCs are the
// surface, and this module is the only place apps/web names them.
//
// Three hard rules:
//   1. Every call goes through asQuote, which is on env.HYPERDRIVE_NOCACHE.
//      The cacheable public-content helper and its binding are never imported
//      here. D-34: a cached lag on a pricing_live flip is not an acceptable
//      billing read, and lib/db/public.ts's own header already refuses the
//      alternative.
//   2. Every argument is a bound parameter through postgres.js's tagged
//      template — never string interpolation into the SQL text, and never an
//      unsafe call.
//   3. fn returns the parsed value, never tx. The core wrapper's conditional
//      return type already makes returning the handle a compile error; this
//      file adds nothing on top and relies on it.
//
// Wrappers stay thin on purpose — mapping belongs in rateBook.ts, which is
// pure and testable without a database. Errors rethrow unmodified so a call
// site still branches on err.code (42501, 25P02, 23505, 23P01).
//
// Structured log lines go through withRequestContext's emit when a request
// context is supplied. LogFields are scalar only: rate_version_id,
// pricing_live, class_count — never a whole row and never a coupon code
// (the logger's credential-key pattern does not match `code`, so this is a
// discipline the call site owns).

import { asQuote } from "./identity";
import {
  withRequestContext,
  type LogFields,
  type RequestContext,
} from "../logger";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function emit(
  request: RequestContext | undefined,
  type: string,
  fields: LogFields,
): void {
  if (!request) return;
  withRequestContext(request)("info", type, fields);
}

function bookLogFields(result: unknown): LogFields {
  if (!isRecord(result)) return {};
  const rv = isRecord(result.rate_version) ? result.rate_version : null;
  const classes = Array.isArray(result.classes) ? result.classes : [];
  return {
    rate_version_id: rv ? (rv.id as number) : null,
    pricing_live: rv !== null && rv.status === "live",
    class_count: classes.length,
  };
}

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function loadRateBook(
  env: CloudflareEnv,
  opts: { preferDraft: boolean },
  request?: RequestContext,
): Promise<unknown> {
  const result = await asQuote(env, async (tx) => {
    const rows = await tx`select public.quote_rate_book(${opts.preferDraft}) as result`;
    return rows[0]?.result ?? null;
  });
  emit(request, "quote_rate_book", bookLogFields(result));
  return result;
}

export async function loadSettingsVersion(
  env: CloudflareEnv,
  asOfIso: string,
  request?: RequestContext,
): Promise<unknown> {
  const result = await asQuote(env, async (tx) => {
    const rows = await tx`select public.quote_settings_version(${asOfIso}) as result`;
    return rows[0]?.result ?? null;
  });
  const id = isRecord(result) ? (result.id as number | null) : null;
  emit(request, "quote_settings_version", { settings_version_id: id });
  return result;
}

export async function mintLockDeadline(
  env: CloudflareEnv,
  settingsVersionId: number,
  request?: RequestContext,
): Promise<string | null> {
  const result = await asQuote(env, async (tx) => {
    const rows = await tx`select public.quote_lock_deadline(${settingsVersionId}) as result`;
    return rows[0]?.result ?? null;
  });
  emit(request, "quote_lock_deadline", {
    settings_version_id: settingsVersionId,
  });
  return asIso(result);
}

export async function evaluateCoupon(
  env: CloudflareEnv,
  code: string,
  ids: { customerId: string | null; contactEmail: string | null },
  request?: RequestContext,
): Promise<unknown> {
  const result = await asQuote(env, async (tx) => {
    const rows = await tx`select public.evaluate_coupon(${code}, ${ids.customerId}, ${ids.contactEmail}) as result`;
    return rows[0]?.result ?? null;
  });
  const ok = isRecord(result) && typeof result.ok === "boolean" ? result.ok : null;
  emit(request, "evaluate_coupon", { ok });
  return result;
}
