export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  GENERAL_SEGMENT_ID,
  nameParts,
  parsePrefsBody,
  prefsFromMetadata,
  prefsToMetadata,
  topicsFromPrefs,
  type MailPrefs,
} from "@/lib/account/prefs";
import { log } from "@/lib/logger";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { csrfForbidden } from "@/lib/security/origin";

const noStore = { "Cache-Control": "private, no-store" };

async function signedIn(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.id || typeof user.email !== "string" || !user.email.includes("@")) {
    return null;
  }
  return { supabase, user, email: user.email };
}

async function syncResend(
  apiKey: string,
  email: string,
  prefs: MailPrefs,
  names: { firstName?: string; lastName?: string },
): Promise<boolean> {
  const resend = new Resend(apiKey);
  const topics = topicsFromPrefs(prefs);
  const created = await resend.contacts.create({
    email,
    firstName: names.firstName,
    lastName: names.lastName,
    unsubscribed: false,
    segments: [{ id: GENERAL_SEGMENT_ID }],
    topics,
  });
  if (!created.error) return true;
  const updated = await resend.contacts.topics.update({ email, topics });
  return !updated.error;
}

export async function GET(request: Request) {
  const session = await signedIn(request);
  if (!session) {
    return NextResponse.json({ receipts: true, offers: false, synced: false }, { status: 401, headers: noStore });
  }
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const { prefs, synced } = prefsFromMetadata(meta);
  return NextResponse.json(
    { receipts: prefs.receipts, offers: prefs.offers, synced },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const ctx = { requestId: crypto.randomUUID(), route: "/api/account/prefs", locale: null };
  const session = await signedIn(request);
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }
  const prefs = parsePrefsBody(raw);
  if (!prefs) {
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }
  const { error } = await session.supabase.auth.updateUser({
    data: prefsToMetadata(prefs),
  });
  if (error) {
    log("warn", "auth", ctx, { reason: "prefs-metadata-failed" });
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }
  let mail = false;
  try {
    const { env } = await getCloudflareContext({ async: true });
    const key = env.RESEND_API_KEY;
    if (key) {
      const meta = session.user.user_metadata as Record<string, unknown> | undefined;
      mail = await syncResend(key, session.email, prefs, nameParts(meta));
    }
  } catch {
    mail = false;
  }
  if (!mail) {
    log("warn", "mail", ctx, { reason: "prefs-resend-failed" });
  }
  return NextResponse.json({ ok: true, mail }, { headers: noStore });
}
