// Order + stock holding persistence (server-only).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface RecordOrderInput {
  userId: string;
  symbol: string;
  exchange: string;
  side: "buy" | "sell";
  quantity: number;
  price: number | null;
  status: "pending" | "filled" | "failed";
  accountId: string | null;
  brokerOrderId?: string | null;
  errorMessage?: string | null;
}

export async function recordOrder(input: RecordOrderInput) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: input.userId,
      symbol: input.symbol,
      exchange: input.exchange,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      status: input.status,
      account_id: input.accountId,
      broker_order_id: input.brokerOrderId ?? null,
      error_message: input.errorMessage ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) console.error("[orders] insert failed:", error.message);
  return data?.id ?? null;
}

/** Apply a filled order to the user's stock_holdings position. */
export async function applyFillToHolding(params: {
  userId: string;
  symbol: string;
  exchange: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  currency: string;
}) {
  const { userId, symbol, exchange, side, quantity, price, currency } = params;

  const { data: existing, error: readErr } = await supabaseAdmin
    .from("stock_holdings")
    .select("id, quantity, avg_price, invested_amount")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .eq("exchange", exchange)
    .maybeSingle();
  if (readErr) {
    console.error("[holdings] read failed:", readErr.message);
    return;
  }

  const prevQty = Number(existing?.quantity ?? 0);
  const prevInvested = Number(existing?.invested_amount ?? 0);
  const delta = side === "buy" ? quantity : -quantity;
  const newQty = Math.max(0, prevQty + delta);

  let newInvested: number;
  if (side === "buy") {
    newInvested = prevInvested + quantity * price;
  } else {
    // Reduce cost basis proportionally on sell.
    newInvested = prevQty > 0 ? Math.max(0, prevInvested * (newQty / prevQty)) : 0;
  }
  const newAvg = newQty > 0 ? newInvested / newQty : 0;

  const { error: upErr } = await supabaseAdmin.from("stock_holdings").upsert(
    {
      ...(existing?.id ? { id: existing.id } : {}),
      user_id: userId,
      symbol,
      exchange,
      quantity: newQty,
      avg_price: newAvg,
      invested_amount: newInvested,
      currency,
    },
    { onConflict: "user_id,symbol,exchange" },
  );
  if (upErr) console.error("[holdings] upsert failed:", upErr.message);
}
