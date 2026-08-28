// apps/web/lib/auth/actions.ts
//
// Server Actions for auth. This file is the one later plans (05-16) extend
// with sign-in / sign-up. Every action re-reads the session with getUser()
// and never trusts a client-supplied identity. signOutAction takes no
// argument (T-05-05).

"use server";

import { createNavigation } from "next-intl/navigation";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const { redirect } = createNavigation(routing);

export async function signOutAction(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.getUser();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/", locale });
  throw new Error("unreachable");
}
