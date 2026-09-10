import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CustomerSession = {
  sub: string;
  role: "authenticated";
  email?: string;
};

export async function customerClaims(request?: Request): Promise<CustomerSession | null> {
  try {
    const supabase = await createServerSupabaseClient(request);
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user?.id) return null;
    const claims: CustomerSession = { sub: user.id, role: "authenticated" };
    if (typeof user.email === "string" && user.email.includes("@")) {
      claims.email = user.email;
    }
    return claims;
  } catch {
    return null;
  }
}
