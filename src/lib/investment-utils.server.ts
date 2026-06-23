import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Refund investment units back to a user's holdings.
 * Used when a withdrawal fails (B2C rejected, timeout, etc.)
 */
export async function refundUnits(tx: {
  user_id: string;
  pool_id: string | null;
  amount: number;
}) {
  if (!tx.pool_id) return;

  const [{ data: pool }, { data: inv }] = await Promise.all([
    supabaseAdmin
      .from("investment_pools")
      .select("current_nav")
      .eq("id", tx.pool_id)
      .maybeSingle(),
    supabaseAdmin
      .from("user_investments")
      .select("id, current_value, units_owned, invested_amount")
      .eq("user_id", tx.user_id)
      .eq("pool_id", tx.pool_id)
      .maybeSingle(),
  ]);

  const nav = Number(pool?.current_nav ?? 100);
  const units = Math.round((Number(tx.amount) / nav) * 1_000_000) / 1_000_000;

  if (inv) {
    await supabaseAdmin
      .from("user_investments")
      .update({
        current_value: Number(inv.current_value ?? 0) + Number(tx.amount),
        units_owned: Number(inv.units_owned ?? 0) + units,
        invested_amount: Number(inv.invested_amount ?? 0) + Number(tx.amount),
      })
      .eq("id", inv.id);
  } else {
    await supabaseAdmin.from("user_investments").insert({
      user_id: tx.user_id,
      pool_id: tx.pool_id,
      current_value: Number(tx.amount),
      units_owned: units,
      invested_amount: Number(tx.amount),
    });
  }
}

/**
 * Refund units and mark transaction as failed.
 */
export async function refundAndFail(
  tx: { id: string; user_id: string; pool_id: string | null; amount: number },
  reason: string,
) {
  await refundUnits(tx);
  await supabaseAdmin
    .from("transactions")
    .update({ status: "failed", mpesa_reference: `FAIL: ${reason}`.slice(0, 200) })
    .eq("id", tx.id);
}
