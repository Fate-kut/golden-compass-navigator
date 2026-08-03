// Server-side transaction cap enforcement.
// The MECHANISM is real; the THRESHOLD VALUES in `transaction_limits` are
// placeholders marked TBD pending compliance sign-off.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LimitKind = "deposit" | "withdrawal" | "invest";

export interface LimitRow {
  currency: string;
  daily_deposit_max: number;
  monthly_deposit_max: number;
  daily_withdrawal_max: number;
  monthly_withdrawal_max: number;
  daily_invest_max: number;
  single_txn_max: number;
}

const COLS =
  "currency, daily_deposit_max, monthly_deposit_max, daily_withdrawal_max, monthly_withdrawal_max, daily_invest_max, single_txn_max";

export async function getLimitsForUser(userId: string): Promise<LimitRow | null> {
  const { data: own } = await supabaseAdmin
    .from("transaction_limits")
    .select(COLS)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (own) return own as LimitRow;

  const { data: tier } = await supabaseAdmin
    .from("transaction_limits")
    .select(COLS)
    .is("user_id", null)
    .eq("tier", "default")
    .eq("is_active", true)
    .maybeSingle();
  return (tier as LimitRow | null) ?? null;
}

/** Sum of non-failed transactions of a type since `sinceIso`. */
async function sumSince(userId: string, type: LimitKind, sinceIso: string) {
  const { data } = await supabaseAdmin
    .from("transactions")
    .select("amount, status")
    .eq("user_id", userId)
    .eq("type", type === "withdrawal" ? "withdrawal" : type)
    .gte("created_at", sinceIso);
  return (data ?? [])
    .filter((r) => r.status !== "failed" && r.status !== "rejected")
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

export interface LimitCheck {
  ok: boolean;
  error?: string;
  usedToday?: number;
  usedThisMonth?: number;
}

export async function checkTransactionLimit(
  userId: string,
  kind: LimitKind,
  amount: number,
): Promise<LimitCheck> {
  const limits = await getLimitsForUser(userId);
  if (!limits) return { ok: true }; // No limits configured — fail open for the PoC.

  if (amount > Number(limits.single_txn_max)) {
    return {
      ok: false,
      error: `Single transaction limit is ${limits.currency} ${Number(limits.single_txn_max).toLocaleString()} (placeholder limit — TBD).`,
    };
  }

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [usedToday, usedThisMonth] = await Promise.all([
    sumSince(userId, kind, dayAgo),
    sumSince(userId, kind, monthAgo),
  ]);

  const dailyMax =
    kind === "deposit"
      ? Number(limits.daily_deposit_max)
      : kind === "withdrawal"
        ? Number(limits.daily_withdrawal_max)
        : Number(limits.daily_invest_max);
  const monthlyMax =
    kind === "deposit"
      ? Number(limits.monthly_deposit_max)
      : kind === "withdrawal"
        ? Number(limits.monthly_withdrawal_max)
        : Number(limits.monthly_deposit_max);

  if (usedToday + amount > dailyMax) {
    return {
      ok: false,
      usedToday,
      usedThisMonth,
      error: `Daily ${kind} limit reached. Used ${limits.currency} ${usedToday.toLocaleString()} of ${dailyMax.toLocaleString()} (placeholder limit — TBD).`,
    };
  }
  if (usedThisMonth + amount > monthlyMax) {
    return {
      ok: false,
      usedToday,
      usedThisMonth,
      error: `30-day ${kind} limit reached. Used ${limits.currency} ${usedThisMonth.toLocaleString()} of ${monthlyMax.toLocaleString()} (placeholder limit — TBD).`,
    };
  }

  return { ok: true, usedToday, usedThisMonth };
}
