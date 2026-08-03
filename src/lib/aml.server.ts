// AML monitoring. The detection mechanism is real; the THRESHOLDS below are
// placeholders marked TBD pending compliance sign-off.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLimitsForUser } from "@/lib/limits.server";

// TBD — placeholder AML thresholds, replace with CMA/FRC-approved values.
export const AML_THRESHOLDS = {
  LARGE_SINGLE_AMOUNT: 100_000, // KES
  STRUCTURING_WINDOW_HOURS: 24,
  STRUCTURING_MIN_COUNT: 4,
  STRUCTURING_NEAR_LIMIT_RATIO: 0.9,
  VELOCITY_WINDOW_HOURS: 24,
  VELOCITY_MAX_TXNS: 8,
  RAPID_IN_OUT_HOURS: 6,
};

export async function raiseFlag(params: {
  userId: string;
  transactionId?: string | null;
  reason: string;
  amount?: number;
  severity?: "low" | "medium" | "high";
  details?: Record<string, unknown>;
}) {
  // De-duplicate: don't re-open an identical open flag for the same transaction.
  const { data: existing } = await supabaseAdmin
    .from("aml_flags")
    .select("id")
    .eq("user_id", params.userId)
    .eq("flag_reason", params.reason)
    .eq("status", "open")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabaseAdmin
    .from("aml_flags")
    .insert({
      user_id: params.userId,
      transaction_id: params.transactionId ?? null,
      flag_reason: params.reason,
      amount: params.amount ?? null,
      severity: params.severity ?? "medium",
      details: (params.details ?? {}) as never,
      status: "open",
    })
    .select("id")
    .maybeSingle();
  if (error) console.error("[aml] flag insert failed:", error.message);
  return data?.id ?? null;
}

/** Run at transaction time — cheap checks on the single event + recent history. */
export async function screenTransaction(params: {
  userId: string;
  transactionId?: string | null;
  amount: number;
  kind: "deposit" | "withdrawal" | "invest";
}) {
  const { userId, transactionId, amount, kind } = params;

  if (amount >= AML_THRESHOLDS.LARGE_SINGLE_AMOUNT) {
    await raiseFlag({
      userId,
      transactionId,
      amount,
      reason: `large_${kind}`,
      severity: "high",
      details: { threshold: AML_THRESHOLDS.LARGE_SINGLE_AMOUNT, note: "TBD threshold" },
    });
  }

  const since = new Date(
    Date.now() - AML_THRESHOLDS.STRUCTURING_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("transactions")
    .select("id, amount, type, created_at")
    .eq("user_id", userId)
    .gte("created_at", since);

  const rows = recent ?? [];
  if (rows.length + 1 > AML_THRESHOLDS.VELOCITY_MAX_TXNS) {
    await raiseFlag({
      userId,
      transactionId,
      amount,
      reason: "high_velocity",
      severity: "medium",
      details: { count: rows.length + 1, window_hours: AML_THRESHOLDS.VELOCITY_WINDOW_HOURS },
    });
  }

  const limits = await getLimitsForUser(userId);
  const cap = Number(limits?.single_txn_max ?? 0);
  if (cap > 0) {
    const nearLimit = rows.filter(
      (r) => Number(r.amount ?? 0) >= cap * AML_THRESHOLDS.STRUCTURING_NEAR_LIMIT_RATIO,
    ).length;
    if (nearLimit + (amount >= cap * AML_THRESHOLDS.STRUCTURING_NEAR_LIMIT_RATIO ? 1 : 0) >=
      AML_THRESHOLDS.STRUCTURING_MIN_COUNT) {
      await raiseFlag({
        userId,
        transactionId,
        amount,
        reason: "possible_structuring",
        severity: "high",
        details: { near_limit_count: nearLimit + 1, cap },
      });
    }
  }
}

/** Batch sweep, invoked by the scheduled endpoint. */
export async function runVelocityScan() {
  const since = new Date(
    Date.now() - AML_THRESHOLDS.VELOCITY_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("id, user_id, amount, type, created_at, status")
    .gte("created_at", since)
    .limit(5000);
  if (error) throw new Error(error.message);

  const byUser = new Map<string, { total: number; count: number; deposits: number; withdrawals: number; lastId: string }>();
  for (const t of data ?? []) {
    if (t.status === "failed") continue;
    const cur = byUser.get(t.user_id) ?? { total: 0, count: 0, deposits: 0, withdrawals: 0, lastId: t.id };
    cur.total += Number(t.amount ?? 0);
    cur.count += 1;
    if (t.type === "deposit") cur.deposits += Number(t.amount ?? 0);
    if (t.type === "withdrawal") cur.withdrawals += Number(t.amount ?? 0);
    cur.lastId = t.id;
    byUser.set(t.user_id, cur);
  }

  let flagged = 0;
  for (const [userId, agg] of byUser) {
    if (agg.count > AML_THRESHOLDS.VELOCITY_MAX_TXNS) {
      await raiseFlag({
        userId,
        transactionId: agg.lastId,
        amount: agg.total,
        reason: "velocity_scan_txn_count",
        severity: "medium",
        details: { count: agg.count, window_hours: AML_THRESHOLDS.VELOCITY_WINDOW_HOURS },
      });
      flagged++;
    }
    // Rapid in/out: most of what came in went straight back out.
    if (agg.deposits > 0 && agg.withdrawals >= agg.deposits * 0.8 && agg.deposits >= 20_000) {
      await raiseFlag({
        userId,
        transactionId: agg.lastId,
        amount: agg.withdrawals,
        reason: "rapid_in_out",
        severity: "high",
        details: { deposits: agg.deposits, withdrawals: agg.withdrawals },
      });
      flagged++;
    }
  }

  return { users_scanned: byUser.size, flags_raised: flagged };
}
