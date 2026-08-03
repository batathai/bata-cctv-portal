import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export type ProfileLookupResult =
  | { status: "demo" }                          // Supabase not configured — use the demo role switcher
  | { status: "no_session" }                    // shouldn't normally happen behind the auth middleware
  | { status: "not_provisioned"; email: string } // real login, but no matching profiles row (RLS will block everything)
  | { status: "ok"; profile: Profile };

/**
 * Fetches the profile row (role + assigned_zones) for the currently signed-in
 * Supabase user.
 *
 * Distinguishing "demo mode" from "logged in but no profiles row" matters:
 * without a profiles row, every RLS-protected query (stores, cctv_assets, ...)
 * silently returns zero rows rather than an error — which looks exactly like
 * "no data yet" and is very easy to misdiagnose. Surfacing "not_provisioned"
 * explicitly lets the UI say so directly instead of rendering an empty
 * dashboard under a stale/default "HQ Admin" label.
 */
export async function fetchCurrentProfile(): Promise<ProfileLookupResult> {
  if (!isSupabaseConfigured) return { status: "demo" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "no_session" };

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error || !data) {
    if (error) console.error("fetchCurrentProfile failed:", error.message);
    return { status: "not_provisioned", email: user.email ?? "(unknown email)" };
  }
  return { status: "ok", profile: data as Profile };
}
