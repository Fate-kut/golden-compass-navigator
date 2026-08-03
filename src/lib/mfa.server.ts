// Step-up authentication (MFA) enforcement for sensitive money endpoints.
// This is REAL — it uses Supabase Auth's TOTP factors and AAL claims.
//
// Policy: MFA is opt-in. Users with NO verified factor are unaffected.
// Users WITH a verified factor must present a fresh AAL2 session.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json } from "@/lib/auth.server";

/** How recently the second factor must have been presented. */
const FRESHNESS_SECONDS = 30 * 60;

export async function hasVerifiedFactor(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
    if (error) return false;
    return (data?.factors ?? []).some((f) => f.status === "verified");
  } catch {
    return false;
  }
}

interface AmrEntry {
  method?: string;
  timestamp?: number;
}

/**
 * Returns a 403 Response when the caller has MFA enrolled but the current
 * session is not a fresh AAL2 session. Returns null when the request may proceed.
 */
export async function requireFreshAal2(
  userId: string,
  claims: Record<string, unknown>,
): Promise<Response | null> {
  if (!(await hasVerifiedFactor(userId))) return null;

  const aal = String(claims["aal"] ?? "aal1");
  if (aal !== "aal2") {
    return json(
      { error: "Two-factor verification required for this action.", code: "mfa_required" },
      403,
    );
  }

  const amr = (claims["amr"] as AmrEntry[] | undefined) ?? [];
  const stepUp = amr
    .filter((e) => e.method === "totp" || e.method === "mfa/totp")
    .map((e) => Number(e.timestamp ?? 0))
    .sort((a, b) => b - a)[0];

  const nowSec = Math.floor(Date.now() / 1000);
  if (stepUp && nowSec - stepUp > FRESHNESS_SECONDS) {
    return json(
      { error: "Please re-verify with your authenticator app.", code: "mfa_stale" },
      403,
    );
  }
  return null;
}
