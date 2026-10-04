import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { META_FBC_RE, META_FBP_RE, metaClickIdsToSave, readMetaClickIds, scheduleMetaClickIdSave } from "./click-ids";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.IwAR0abc_DEF-123";
const SUBJECT = "a1b2c3d4-0000-4000-8000-000000002801";
const COOKIES = `consent_subject=${SUBJECT}; _fbp=${FBP}; _fbc=${FBC}`;
const SITE = "https://vamostaxi.site";

describe("readMetaClickIds", () => {
  it("reads both values", () => {
    expect(readMetaClickIds(`_fbp=${FBP}; _fbc=${FBC}`)).toEqual({ fbp: FBP, fbc: FBC });
  });
  it("missing or null header gives nulls", () => {
    expect(readMetaClickIds("a=b")).toEqual({ fbp: null, fbc: null });
    expect(readMetaClickIds(null)).toEqual({ fbp: null, fbc: null });
  });
  it("a malformed or over-long value reads as null, only for that cookie", () => {
    expect(readMetaClickIds(`_fbp=abc; _fbc=${FBC}`)).toEqual({ fbp: null, fbc: FBC });
    expect(readMetaClickIds(`_fbp=${FBP}.${"a".repeat(80)}; _fbc=fb.1.1727771234567.${"a".repeat(590)}`)).toEqual({ fbp: null, fbc: null });
  });
  it("values with a space, quote or semicolon read as null", () => {
    expect(readMetaClickIds(`_fbp="${FBP}"`).fbp).toBeNull();
    expect(readMetaClickIds(`_fbc=fb.1.1727771234567.ab%20cd`).fbc).toBeNull();
    expect(readMetaClickIds(`_fbc=fb.1.1727771234567.abc'`).fbc).toBeNull();
  });
  it("two occurrences that differ read as null, two that agree read as the value", () => {
    expect(readMetaClickIds(`_fbp=${FBP}; _fbp=fb.1.1727771234567.999`).fbp).toBeNull();
    expect(readMetaClickIds(`_fbp=${FBP}; _fbp=${FBP}`).fbp).toBe(FBP);
  });
  it("accepts the appendix forms", () => {
    expect(readMetaClickIds(`_fbc=${FBC}.AQ`).fbc).toBe(`${FBC}.AQ`);
    expect(readMetaClickIds(`_fbc=${FBC}.abcd1234`).fbc).toBe(`${FBC}.abcd1234`);
  });
});

describe("metaClickIdsToSave", () => {
  const base = { cookieHeader: COOKIES, origin: SITE, measurementAllowed: true };

  it("flags off: skip", async () => {
    const readMarketing = vi.fn(async () => true);
    expect(await metaClickIdsToSave({ ...base, measurementAllowed: false, readMarketing })).toEqual({ skip: true });
    expect(readMarketing).not.toHaveBeenCalled();
  });
  it("a dashboard or missing Origin skips: nothing saved and nothing cleared (WR-06)", async () => {
    const readMarketing = vi.fn(async () => true);
    for (const origin of ["https://dashboard.vamostaxi.site", null]) {
      expect(await metaClickIdsToSave({ ...base, origin, readMarketing })).toEqual({ skip: true });
    }
    expect(readMarketing).not.toHaveBeenCalled();
  });
  it("no consent subject gives nulls", async () => {
    const readMarketing = vi.fn(async () => true);
    const r = await metaClickIdsToSave({ ...base, cookieHeader: `_fbp=${FBP}`, readMarketing });
    expect(r).toEqual({ skip: false, fbp: null, fbc: null, subject: null });
  });
  it("marketing off, unknown or a failing read gives nulls", async () => {
    for (const readMarketing of [async () => false, async () => null, async () => { throw new Error("db"); }]) {
      expect(await metaClickIdsToSave({ ...base, readMarketing })).toEqual({ skip: false, fbp: null, fbc: null, subject: null });
    }
  });
  it("marketing on gives the parsed values", async () => {
    const readMarketing = vi.fn(async () => true);
    expect(await metaClickIdsToSave({ ...base, readMarketing })).toEqual({ skip: false, fbp: FBP, fbc: FBC, subject: SUBJECT });
    expect(readMarketing).toHaveBeenCalledWith(SUBJECT);
  });
  it("does not ask for consent when both parsed values are null", async () => {
    const readMarketing = vi.fn(async () => true);
    const r = await metaClickIdsToSave({ ...base, cookieHeader: `consent_subject=${SUBJECT}; _fbp=junk`, readMarketing });
    expect(r).toEqual({ skip: false, fbp: null, fbc: null, subject: null });
    expect(readMarketing).not.toHaveBeenCalled();
  });
});

describe("scheduleMetaClickIdSave", () => {
  const decide = (readMarketing: () => Promise<boolean>) => ({ cookieHeader: COOKIES, origin: SITE, measurementAllowed: true, readMarketing });
  it("passes the subject as the third write argument", async () => {
    const write = vi.fn(async () => {});
    await scheduleMetaClickIdSave({ ctx: null, decide: decide(async () => true), write });
    expect(write).toHaveBeenCalledWith(FBP, FBC, SUBJECT);
  });
  it("writes three nulls when consent is off, nothing on skip", async () => {
    const write = vi.fn(async () => {});
    await scheduleMetaClickIdSave({ ctx: null, decide: decide(async () => false), write });
    expect(write).toHaveBeenCalledWith(null, null, null);
    const w2 = vi.fn(async () => {});
    await scheduleMetaClickIdSave({ ctx: null, decide: { ...decide(async () => true), origin: null }, write: w2 });
    expect(w2).not.toHaveBeenCalled();
  });
});

describe("pins", () => {
  const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

  it("the TypeScript patterns equal the database CHECK patterns", () => {
    const dir = join(repoRoot, "packages/db/supabase/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_booking_meta_click_ids.sql"));
    expect(file).toBeTruthy();
    const sql = readFileSync(join(dir, file!), "utf8");
    expect(sql).toContain(META_FBP_RE.source);
    expect(sql).toContain(META_FBC_RE.source);
    expect(sql).toContain("length(meta_fbp) <= 64");
    expect(sql).toContain("length(meta_fbc) <= 600");
  });

  it("the values never reach Stripe (D-09)", () => {
    for (const rel of ["lib/checkout/stripe.ts", "lib/checkout/intent.ts"]) {
      const src = read(rel);
      for (const word of ["fbp", "fbc", "_fbp", "_fbc", "meta_fb"]) expect(src, `${rel} ${word}`).not.toContain(word);
    }
  });

  it("the route saves once, inside afterBooking, before the account record, and never passes the values to the session", () => {
    const route = read("app/api/checkout/intent/route.ts");
    expect(route.match(/checkout_set_meta_click_ids\(/g)).toHaveLength(1);
    const after = route.indexOf("afterBooking:");
    const save = route.indexOf("checkout_set_meta_click_ids(");
    const record = route.indexOf("record_account_agreement");
    expect(after).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(after);
    expect(save).toBeLessThan(record);
    const session = route.slice(route.indexOf("createCheckoutSession: (input)"), route.indexOf("expireCheckoutSession:"));
    expect(session).not.toMatch(/fbp|fbc|meta/i);
    expect(route).toContain("metaMeasurementAllowed()");
  });
});
